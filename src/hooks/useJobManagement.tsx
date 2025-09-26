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
  customer_id: string;
  customer_name: string;
  title: string;
  description?: string;
  service_type: 'plumbing' | 'electrical' | 'hvac' | 'cleaning' | 'landscaping' | 'general_maintenance' | 'other';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  assigned_to_user_id?: string;
  estimated_cost?: number;
  actual_cost?: number;
  completion_notes?: string;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  start_date: string;
  local_start_time: string;
  duration_minutes: number;
  until_date?: string;
  rrule: string;
  timezone: string;
  active: boolean;
  notes?: string;
  // Aggregated stats
  total_occurrences: number;
  completed_occurrences: number;
  next_occurrence_date?: string;
  contractor_name?: string;
  job_type: 'job_series';
}

export interface OneTimeJob {
  id: string;
  created_at: string;
  updated_at?: string;
  tenant_id: string;
  created_by_user_id: string;
  customer_id: string;
  customer_name: string;
  title: string;
  description?: string;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  assigned_to_user_id?: string;
  service_type: 'plumbing' | 'electrical' | 'hvac' | 'cleaning' | 'landscaping' | 'general_maintenance' | 'other';
  estimated_cost?: number;
  actual_cost?: number;
  start_date: string;
  local_start_time: string;
  duration_minutes: number;
  timezone: string;
  completion_notes?: string;
  notes?: string;
  contractor_name?: string;
  job_type: 'one_time';
}

export type ManagedJob = OneTimeJob | JobSeries;

export function useJobManagement() {
  const [oneTimeJobs, setOneTimeJobs] = useState<OneTimeJob[]>([]);
  const [jobSeries, setJobSeries] = useState<JobSeries[]>([]);
  const [loading, setLoading] = useState(true);
  const { user, tenantId } = useAuth();
  const { toast } = useToast();

  const fetchJobManagementData = async () => {
    if (!user || !tenantId) return;

    try {
      setLoading(true);
      
      // Fetch one-time jobs from job_series where is_recurring = false
      const { data: oneTimeJobsData, error: jobsError } = await supabase
        .from('job_series')
        .select('*')
        .eq('is_recurring', false)
        .order('created_at', { ascending: false }) as { data: any[] | null, error: any };

      if (jobsError) {
        toast({
          variant: "destructive",
          title: "Error loading jobs",
          description: jobsError.message,
        });
        return;
      }

      // Fetch job series with aggregated data
      const { data: jobSeriesData, error: seriesError } = await supabase
        .from('job_series')
        .select('*')
        .eq('is_recurring', true)
        .order('created_at', { ascending: false }) as { data: any[] | null, error: any };

      if (seriesError) {
        toast({
          variant: "destructive",
          title: "Error loading job series",
          description: seriesError.message,
        });
        return;
      }

      // Transform one-time jobs from job_series
      const transformedOneTimeJobs: OneTimeJob[] = [];
      
      for (const job of oneTimeJobsData || []) {
        // Get contractor name separately
        let contractorName;
        if (job.assigned_to_user_id) {
          try {
            const { data: contractorData, error } = await supabase
              .from('profiles')
              .select('full_name, email')
              .eq('id', job.assigned_to_user_id)
              .single();
            
            if (error) {
              console.warn(`Failed to fetch contractor for ID ${job.assigned_to_user_id}:`, error);
              contractorName = 'Unknown User';
            } else {
              contractorName = contractorData?.full_name || 
                              contractorData?.email?.split('@')[0] || 
                              'Unnamed User';
            }
          } catch (err) {
            console.warn(`Error fetching contractor for ID ${job.assigned_to_user_id}:`, err);
            contractorName = 'Unknown User';
          }
        }

        transformedOneTimeJobs.push({
          id: job.id,
          created_at: job.created_at,
          updated_at: job.updated_at,
          tenant_id: job.tenant_id,
          created_by_user_id: job.created_by_user_id,
          customer_id: job.customer_id,
          customer_name: job.customer_name,
          title: job.title,
          description: job.description,
          status: 'scheduled' as const, // One-time jobs are scheduled by default
          priority: job.priority,
          assigned_to_user_id: job.assigned_to_user_id,
          service_type: job.service_type,
          estimated_cost: job.estimated_cost,
          actual_cost: job.actual_cost,
          start_date: job.start_date,
          local_start_time: job.local_start_time,
          duration_minutes: job.duration_minutes,
          timezone: job.timezone,
          completion_notes: job.completion_notes,
          notes: job.notes,
          contractor_name: contractorName,
          job_type: 'one_time' as const,
        });
      }

      // Transform job series and get occurrence counts
      const transformedJobSeries: JobSeries[] = [];
      
      for (const series of jobSeriesData || []) {
        // Get contractor name separately
        let contractorName;
        if (series.assigned_to_user_id) {
          try {
            const { data: contractorData, error } = await supabase
              .from('profiles')
              .select('full_name, email')
              .eq('id', series.assigned_to_user_id)
              .single();
            
            if (error) {
              console.warn(`Failed to fetch contractor for ID ${series.assigned_to_user_id}:`, error);
              contractorName = 'Unknown User';
            } else {
              contractorName = contractorData?.full_name || 
                              contractorData?.email?.split('@')[0] || 
                              'Unnamed User';
            }
          } catch (err) {
            console.warn(`Error fetching contractor for ID ${series.assigned_to_user_id}:`, err);
            contractorName = 'Unknown User';
          }
        }

        // Get occurrence counts for this series
        const { data: occurrenceStats } = await supabase
          .from('job_occurrences')
          .select('status, start_at')
          .eq('series_id', series.id);

        const totalOccurrences = occurrenceStats?.length || 0;
        const completedOccurrences = occurrenceStats?.filter(occ => occ.status === 'completed').length || 0;
        
        // Get next occurrence date
        const futureOccurrences = occurrenceStats
          ?.filter(occ => new Date(occ.start_at) > new Date() && occ.status === 'scheduled')
          .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
        
        const nextOccurrenceDate = futureOccurrences?.[0]?.start_at;

        transformedJobSeries.push({
          ...series,
          contractor_name: contractorName,
          job_type: 'job_series' as const,
          total_occurrences: totalOccurrences,
          completed_occurrences: completedOccurrences,
          next_occurrence_date: nextOccurrenceDate,
        });
      }

      setOneTimeJobs(transformedOneTimeJobs);
      setJobSeries(transformedJobSeries);

    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error loading job data",
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  const updateOneTimeJob = async (jobId: string, updates: Partial<OneTimeJob> & Record<string, any>) => {
    if (!user || !tenantId) throw new Error('User not authenticated');

    // Clean updates to remove fields that don't exist in database
    const { 
      contractor_name, 
      job_type,
      additional_info,
      scheduled_date,
      start_time,
      end_time,
      complete_date,
      scheduled_time_utc,
      scheduled_end_time_utc,
      scheduled_time,
      scheduled_end_time,
      ...dbUpdates 
    } = updates;
    
    // Check if timing fields have changed and we have UTC timestamps
    const hasTimingChanges = updates.scheduled_time_utc && updates.scheduled_end_time_utc;
    
    // Update the job_series record
    const { data, error } = await supabase
      .from('job_series')
      .update(dbUpdates)
      .eq('id', jobId)
      .select()
      .single();

    if (error) throw error;
    
    // If timing changed, also update any corresponding job_occurrences
    if (hasTimingChanges) {
      try {
        // For one-time jobs, there might be an occurrence in job_occurrences table
        // Update it to keep the calendar in sync
        const { error: occurrenceError } = await supabase
          .from('job_occurrences')
          .update({
            start_at: updates.scheduled_time_utc,
            end_at: updates.scheduled_end_time_utc,
          })
          .eq('series_id', jobId);
          
        if (occurrenceError) {
          console.warn('Could not update job_occurrences for one-time job:', occurrenceError);
          // Don't throw - this is not critical as one-time jobs might not have occurrences
        }
      } catch (occError) {
        console.warn('Error updating job occurrence:', occError);
      }
    }
    
    toast({
      title: "Job updated",
      description: "The job has been successfully updated.",
    });
    
    await fetchJobManagementData();
    return data;
  };

  const updateJobSeries = async (seriesId: string, updates: Partial<JobSeries> & Record<string, any>) => {
    if (!user || !tenantId) throw new Error('User not authenticated');

    // Check if we need to reschedule occurrences
    const shouldRescheduleOccurrences = updates.rescheduleOccurrences;

    // Clean updates to remove fields that don't exist in database
    const { 
      contractor_name, 
      job_type, 
      total_occurrences, 
      completed_occurrences, 
      next_occurrence_date,
      additional_info,
      scheduled_date,
      start_time,
      end_time,
      complete_date,
      scheduled_time_utc,
      scheduled_end_time_utc,
      scheduled_time,
      scheduled_end_time,
      rescheduleOccurrences,
      ...dbUpdates 
    } = updates;

    // If rescheduling, clear future occurrences and reset last_generated_until
    if (shouldRescheduleOccurrences) {
      console.log('Rescheduling occurrences for series:', seriesId);
      
      // Delete all future occurrences (not yet started or completed)
      const { error: deleteError } = await supabase
        .from('job_occurrences')
        .delete()
        .eq('series_id', seriesId)
        .gt('start_at', new Date().toISOString());
        
      if (deleteError) {
        console.error('Error deleting future occurrences:', deleteError);
      } else {
        console.log('Deleted future occurrences for rescheduling');
      }
      
      // Reset last_generated_until to allow regeneration
      dbUpdates.last_generated_until = null;
    }

    const { data, error } = await supabase
      .from('job_series')
      .update(dbUpdates)
      .eq('id', seriesId)
      .select()
      .single();

    if (error) throw error;
    
    // If rescheduling, regenerate occurrences with new settings
    if (shouldRescheduleOccurrences) {
      try {
        console.log('Invoking generate-job-occurrences-enhanced for rescheduled series');
        const { error: generateError } = await supabase.functions.invoke('generate-job-occurrences-enhanced', {
          body: { 
            seriesId: seriesId,
            fromDate: data.start_date, // Start from the series start date
            monthsAhead: 3 // Generate 3 months ahead
          }
        });
        
        if (generateError) {
          console.error('Error generating new occurrences:', generateError);
        } else {
          console.log('Successfully regenerated occurrences for rescheduled series');
        }
      } catch (generateError) {
        console.error('Error invoking generate-job-occurrences:', generateError);
      }
    }
    
    // If the series is being deactivated, cancel all future occurrences
    if (updates.active === false) {
      await supabase
        .from('job_occurrences')
        .update({ status: 'cancelled' })
        .eq('series_id', seriesId)
        .gt('start_at', new Date().toISOString())
        .neq('status', 'completed');
    }
    
    // Update future occurrences with new assignment, priority, or estimated cost (only if not rescheduling)
    if (!shouldRescheduleOccurrences) {
      const occurrenceUpdates: any = {};
      if (updates.assigned_to_user_id !== undefined) {
        occurrenceUpdates.assigned_to_user_id = updates.assigned_to_user_id;
      }
      if (updates.priority) {
        occurrenceUpdates.priority = updates.priority;
      }
      if (updates.estimated_cost !== undefined) {
        occurrenceUpdates.override_estimated_cost = updates.estimated_cost;
      }
      
      // Only update future scheduled occurrences if there are changes to propagate
      if (Object.keys(occurrenceUpdates).length > 0) {
        const { error: occurrenceError } = await supabase
          .from('job_occurrences')
          .update(occurrenceUpdates)
          .eq('series_id', seriesId)
          .gt('start_at', new Date().toISOString())
          .eq('status', 'scheduled');
          
        if (occurrenceError) {
          console.error('Error updating future occurrences:', occurrenceError);
        }
      }
    }
    
    toast({
      title: "Job series updated",
      description: shouldRescheduleOccurrences 
        ? "The job series has been updated and all future occurrences have been rescheduled."
        : "The job series and all future occurrences have been successfully updated.",
    });
    
    await fetchJobManagementData();
    return data;
  };

  const deleteOneTimeJob = async (jobId: string) => {
    if (!user || !tenantId) throw new Error('User not authenticated');

    const { error } = await supabase.from('job_series').delete().eq('id', jobId);
    if (error) throw error;
    
    toast({
      title: "Job deleted",
      description: "The job has been successfully deleted.",
    });
    
    await fetchJobManagementData();
  };

  const deleteJobSeries = async (seriesId: string) => {
    if (!user || !tenantId) throw new Error('User not authenticated');

    // First delete all occurrences
    await supabase.from('job_occurrences').delete().eq('series_id', seriesId);
    
    // Then delete the series
    const { error } = await supabase.from('job_series').delete().eq('id', seriesId);
    if (error) throw error;
    
    toast({
      title: "Job series deleted",
      description: "The job series and all its occurrences have been successfully deleted.",
    });
    
    await fetchJobManagementData();
  };

  useEffect(() => {
    fetchJobManagementData();
  }, [user, tenantId]);

  // Combined jobs for display
  const allManagedJobs: ManagedJob[] = [...oneTimeJobs, ...jobSeries]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return {
    oneTimeJobs,
    jobSeries,
    allManagedJobs,
    loading,
    refetch: fetchJobManagementData,
    updateOneTimeJob,
    updateJobSeries,
    deleteOneTimeJob,
    deleteJobSeries,
  };
}