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
  scheduled_date: string;
  scheduled_time?: string;
  scheduled_end_time?: string;
  estimated_duration?: number;
  complete_date?: string;
  completion_notes?: string;
  additional_info?: string;
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
      
      // Fetch one-time jobs
      const { data: oneTimeJobsData, error: jobsError } = await supabase
        .from('jobs')
        .select(`
          *,
          assigned_contractor:profiles!assigned_to_user_id(full_name, email)
        `)
        .order('created_at', { ascending: false });

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
        .order('created_at', { ascending: false });

      if (seriesError) {
        toast({
          variant: "destructive",
          title: "Error loading job series",
          description: seriesError.message,
        });
        return;
      }

      // Transform one-time jobs
      const transformedOneTimeJobs: OneTimeJob[] = (oneTimeJobsData || []).map(job => ({
        ...job,
        contractor_name: job.assigned_contractor?.full_name || 
                        job.assigned_contractor?.email?.split('@')[0] || 
                        (job.assigned_to_user_id ? 'Unnamed User' : undefined),
        job_type: 'one_time' as const,
      }));

      // Transform job series and get occurrence counts
      const transformedJobSeries: JobSeries[] = [];
      
      for (const series of jobSeriesData || []) {
        // Get contractor name separately
        let contractorName;
        if (series.assigned_to_user_id) {
          const { data: contractorData } = await supabase
            .from('profiles')
            .select('full_name, email')
            .eq('id', series.assigned_to_user_id)
            .single();
          
          contractorName = contractorData?.full_name || 
                          contractorData?.email?.split('@')[0] || 
                          'Unnamed User';
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

  const updateOneTimeJob = async (jobId: string, updates: Partial<OneTimeJob>) => {
    if (!user || !tenantId) throw new Error('User not authenticated');

    const { contractor_name, job_type, ...dbUpdates } = updates;
    const { data, error } = await supabase
      .from('jobs')
      .update(dbUpdates)
      .eq('id', jobId)
      .select()
      .single();

    if (error) throw error;
    
    toast({
      title: "Job updated",
      description: "The job has been successfully updated.",
    });
    
    await fetchJobManagementData();
    return data;
  };

  const updateJobSeries = async (seriesId: string, updates: Partial<JobSeries>) => {
    if (!user || !tenantId) throw new Error('User not authenticated');

    const { contractor_name, job_type, total_occurrences, completed_occurrences, next_occurrence_date, ...dbUpdates } = updates;
    const { data, error } = await supabase
      .from('job_series')
      .update(dbUpdates)
      .eq('id', seriesId)
      .select()
      .single();

    if (error) throw error;
    
    // If the series is being deactivated, cancel all future occurrences
    if (updates.active === false) {
      await supabase
        .from('job_occurrences')
        .update({ status: 'cancelled' })
        .eq('series_id', seriesId)
        .gt('start_at', new Date().toISOString())
        .neq('status', 'completed');
    }
    
    toast({
      title: "Job series updated",
      description: "The job series has been successfully updated.",
    });
    
    await fetchJobManagementData();
    return data;
  };

  const deleteOneTimeJob = async (jobId: string) => {
    if (!user || !tenantId) throw new Error('User not authenticated');

    const { error } = await supabase.from('jobs').delete().eq('id', jobId);
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