import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useToast } from '@/hooks/use-toast';
import { combineDateTimeToUTC, DEFAULT_TIMEZONE } from '@/lib/timezoneUtils';

export interface JobSeries {
  id: string;
  created_at: string;
  updated_at?: string;
  tenant_id: string;
  created_by_user_id: string;
  title: string;
  customer_id: string;
  customer_name: string;
  service_type: 'plumbing' | 'electrical' | 'hvac' | 'cleaning' | 'landscaping' | 'general_maintenance' | 'other';
  description?: string;
  start_date: string;
  local_start_time: string;
  duration_minutes: number;
  timezone: string;
  rrule: string;
  until_date?: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  assigned_to_user_id?: string;
  estimated_cost?: number;
  actual_cost?: number;
  completion_notes?: string;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  notes?: string;
  active: boolean;
}

export interface CreateJobSeriesData {
  title: string;
  customer_id: string;
  customer_name: string;
  service_type: JobSeries['service_type'];
  description?: string;
  start_date: string;
  local_start_time: string;
  duration_minutes: number;
  timezone: string;
  rrule: string;
  until_date?: string;
  priority: JobSeries['priority'];
  assigned_to_user_id?: string;
  estimated_cost?: number;
  actual_cost?: number;
  completion_notes?: string;
  status?: JobSeries['status'];
  notes?: string;
}

export function useJobSeries() {
  const [jobSeries, setJobSeries] = useState<JobSeries[]>([]);
  const [loading, setLoading] = useState(true);
  const { user, tenantId } = useAuth();
  const { toast } = useToast();

  const fetchJobSeries = async () => {
    if (!user || !tenantId) return;

    try {
      setLoading(true);
      
      const { data, error } = await supabase
        .from('job_series')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });

      if (error) {
        toast({
          variant: "destructive",
          title: "Error loading job series",
          description: error.message,
        });
        return;
      }

      setJobSeries(data || []);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error loading job series",
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  const createJobSeries = async (seriesData: CreateJobSeriesData & Record<string, any>) => {
    if (!user || !tenantId) throw new Error('User not authenticated');

    console.log('Creating job series with data:', seriesData);

    // Clean the data to only include valid database columns
    const {
      // Remove any form-specific fields that don't exist in database
      additional_info,
      scheduled_date,
      start_time,
      end_time,
      complete_date,
      scheduled_time_utc,
      scheduled_end_time_utc,
      scheduled_time,
      scheduled_end_time,
      ...validSeriesData
    } = seriesData;

    const { data, error } = await supabase
      .from('job_series')
      .insert({
        ...validSeriesData,
        tenant_id: tenantId,
        created_by_user_id: user.id,
      })
      .select()
      .single();

    if (error) throw error;

    console.log('Job series created successfully:', data);

    // Always create occurrences for all jobs (recurring and single)
    if (validSeriesData.is_recurring && validSeriesData.rrule) {
      // For recurring jobs, use the edge function
      try {
        console.log('Generating occurrences for recurring job series:', data.id);
        
        const { data: functionResult, error: functionError } = await supabase.functions.invoke('generate-job-occurrences', {
          body: { 
            seriesId: data.id,
            monthsAhead: 3,
            maxOccurrences: 200
          }
        });
        
        if (functionError) {
          throw new Error(functionError.message || 'Failed to generate job occurrences');
        }
        
        console.log('Occurrence generation result:', functionResult);
        toast({
          title: "Recurring job created",
          description: `Series created with ${functionResult.generated?.created || 0} initial occurrences`,
        });
      } catch (occurrenceError: any) {
        console.error('Error generating occurrences:', occurrenceError);
        toast({
          variant: "destructive",
          title: "Job created but occurrences failed",
          description: occurrenceError.message,
        });
      }
    } else {
      // For single occurrence jobs, create one occurrence with proper UTC timestamps
      console.log('Creating single occurrence for one-time job');
      
      // Use the provided UTC timestamps if available, otherwise construct from local time
      let startAtUTC: string;
      let endAtUTC: string;
      
      if (scheduled_time_utc && scheduled_end_time_utc) {
        // Use the pre-converted UTC timestamps from the form
        startAtUTC = scheduled_time_utc;
        endAtUTC = scheduled_end_time_utc;
        console.log('Using pre-converted UTC timestamps:', { startAtUTC, endAtUTC });
      } else {
        // Fallback: construct from date and local_start_time using proper timezone conversion
        const timezone = validSeriesData.timezone || DEFAULT_TIMEZONE;
        
        // Normalize time to HH:mm format (remove seconds if present)
        const startTime = (validSeriesData.local_start_time || '08:00').split(':').slice(0, 2).join(':');
        
        // Convert local date/time to UTC using the series timezone
        const utcStartDate = combineDateTimeToUTC(validSeriesData.start_date, startTime, timezone);
        
        // Calculate end time by adding duration minutes
        const endUtcDate = new Date(utcStartDate.getTime() + (validSeriesData.duration_minutes || 60) * 60000);
        
        startAtUTC = utcStartDate.toISOString();
        endAtUTC = endUtcDate.toISOString();
        console.log(`Constructed timestamps using timezone ${timezone}:`, { startAtUTC, endAtUTC });
      }
      
      const occurrenceData = {
        series_id: data.id,
        customer_id: validSeriesData.customer_id,
        customer_name: validSeriesData.customer_name,
        start_at: startAtUTC,
        end_at: endAtUTC,
        status: validSeriesData.status || 'scheduled',
        priority: validSeriesData.priority || 'medium',
        assigned_to_user_id: validSeriesData.assigned_to_user_id,
        tenant_id: tenantId,
      };

      console.log('Creating occurrence with data:', occurrenceData);
      
      const { error: occurrenceError } = await supabase
        .from('job_occurrences')
        .insert(occurrenceData);
      
      if (occurrenceError) {
        console.error('Error creating single occurrence:', occurrenceError);
        toast({
          variant: "destructive",
          title: "Job created but occurrence failed",
          description: occurrenceError.message,
        });
      } else {
        toast({
          title: "Job created",
          description: "Job created successfully and will appear in the calendar",
        });
      }
    }
    
    await fetchJobSeries();
    return data;
  };

  const updateJobSeries = async (seriesId: string, updates: Partial<JobSeries>) => {
    if (!user || !tenantId) throw new Error('User not authenticated');

    const { data, error } = await supabase
      .from('job_series')
      .update(updates)
      .eq('id', seriesId)
      .select()
      .single();

    if (error) throw error;

    // Regenerate occurrences if the series is still active
    if (data.active) {
      try {
        const { data: functionResult, error: functionError } = await supabase.functions.invoke('generate-job-occurrences', {
          body: { 
            seriesId: data.id,
            monthsAhead: 3,
            maxOccurrences: 200
          }
        });
        
        if (functionError) {
          throw new Error(functionError.message || 'Failed to regenerate job occurrences');
        }
        
        console.log('Occurrence regeneration result:', functionResult);
      } catch (generateError: any) {
        console.error('Error regenerating occurrences:', generateError);
        toast({
          variant: "destructive", 
          title: "Warning: Occurrences not regenerated",
          description: `Job series updated but occurrences failed: ${generateError.message}`,
        });
      }
    }
    
    toast({
      title: "Recurring job updated",
      description: "The recurring job series has been successfully updated.",
    });
    
    await fetchJobSeries();
    return data;
  };

  const deleteJobSeries = async (seriesId: string) => {
    if (!user || !tenantId) throw new Error('User not authenticated');

    const { error } = await supabase
      .from('job_series')
      .delete()
      .eq('id', seriesId);

    if (error) throw error;
    
    toast({
      title: "Recurring job deleted",
      description: "The recurring job series and all future occurrences have been deleted.",
    });
    
    await fetchJobSeries();
  };

  const toggleSeriesActive = async (seriesId: string, active: boolean) => {
    return updateJobSeries(seriesId, { active });
  };

  useEffect(() => {
    fetchJobSeries();
  }, [user, tenantId]);

  return {
    jobSeries,
    loading,
    refetchJobSeries: fetchJobSeries,
    createJobSeries,
    updateJobSeries,
    deleteJobSeries,
    toggleSeriesActive,
  };
}