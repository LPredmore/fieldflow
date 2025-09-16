import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useToast } from '@/hooks/use-toast';

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

  const createJobSeries = async (seriesData: CreateJobSeriesData) => {
    if (!user || !tenantId) throw new Error('User not authenticated');

    const { data, error } = await supabase
      .from('job_series')
      .insert({
        ...seriesData,
        tenant_id: tenantId,
        created_by_user_id: user.id,
      })
      .select()
      .single();

    if (error) throw error;

    // Generate occurrences for the new series
    try {
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
        title: "Success",
        description: `Series created with ${functionResult.generated?.created || 0} initial occurrences`,
      });
    } catch (generateError: any) {
      console.error('Error generating occurrences:', generateError);
      toast({
        variant: "destructive",
        title: "Warning: Occurrences not generated",
        description: `Job series created but occurrences failed: ${generateError.message}`,
      });
    }
    toast({
      title: "Recurring job created",
      description: "The recurring job series has been successfully created.",
    });
    
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