import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useUserTimezone } from './useUserTimezone';
import { convertFromUTC, formatInUserTimezone } from '@/lib/timezoneUtils';
import { useToast } from '@/hooks/use-toast';

export interface CalendarJob {
  id: string;
  series_id: string;
  title: string;
  description?: string;
  start_at: string; // UTC timestamp
  end_at: string; // UTC timestamp
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  customer_id: string;
  customer_name: string;
  assigned_to_user_id?: string;
  estimated_cost?: number;
  actual_cost?: number;
  completion_notes?: string;
  created_at: string;
  updated_at?: string;
  tenant_id: string;
  // Derived fields for display
  local_start?: Date;
  local_end?: Date;
}

/**
 * Hook to fetch calendar jobs from job_occurrences table only
 * All jobs (single and recurring) should be materialized in job_occurrences
 */
export function useCalendarJobs() {
  const [jobs, setJobs] = useState<CalendarJob[]>([]);
  const [loading, setLoading] = useState(true);
  const { user, tenantId } = useAuth();
  const userTimezone = useUserTimezone();
  const { toast } = useToast();

  const fetchJobs = async () => {
    if (!user || !tenantId) {
      setJobs([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      
      // Fetch all job occurrences for the tenant
      const { data, error } = await supabase
        .from('job_occurrences')
        .select(`
          id,
          series_id,
          start_at,
          end_at,
          status,
          priority,
          customer_id,
          customer_name,
          assigned_to_user_id,
          completion_notes,
          actual_cost,
          override_title,
          override_description,
          override_estimated_cost,
          created_at,
          updated_at,
          tenant_id,
          job_series!inner(
            title,
            description,
            estimated_cost,
            service_type
          )
        `)
        .eq('tenant_id', tenantId)
        .order('start_at', { ascending: true });

      if (error) {
        console.error('Error fetching calendar jobs:', error);
        toast({
          variant: "destructive",
          title: "Error loading calendar",
          description: error.message,
        });
        setJobs([]);
        return;
      }

      // Transform data - keep UTC times for FullCalendar, add local versions for other displays
      const transformedJobs: CalendarJob[] = (data || []).map((job: any) => {
        const series = job.job_series;
        
        // Convert UTC times to user's local timezone for non-calendar displays
        const localStart = convertFromUTC(job.start_at, userTimezone);
        const localEnd = convertFromUTC(job.end_at, userTimezone);
        
        return {
          id: job.id,
          series_id: job.series_id,
          title: job.override_title || series?.title || 'Untitled Job',
          description: job.override_description || series?.description,
          start_at: job.start_at, // Keep as UTC for FullCalendar
          end_at: job.end_at, // Keep as UTC for FullCalendar
          status: job.status,
          priority: job.priority,
          customer_id: job.customer_id,
          customer_name: job.customer_name,
          assigned_to_user_id: job.assigned_to_user_id,
          estimated_cost: job.override_estimated_cost || series?.estimated_cost,
          actual_cost: job.actual_cost,
          completion_notes: job.completion_notes,
          created_at: job.created_at,
          updated_at: job.updated_at,
          tenant_id: job.tenant_id,
          // Add local timezone versions for non-calendar displays
          local_start: localStart,
          local_end: localEnd,
        };
      });

      console.log(`Loaded ${transformedJobs.length} calendar jobs for timezone: ${userTimezone}`);
      setJobs(transformedJobs);
    } catch (error: any) {
      console.error('Error in fetchJobs:', error);
      toast({
        variant: "destructive",
        title: "Error loading calendar",
        description: error.message,
      });
      setJobs([]);
    } finally {
      setLoading(false);
    }
  };

  const updateJob = async (jobId: string, updates: Partial<CalendarJob>) => {
    if (!user || !tenantId) throw new Error('User not authenticated');

    // Remove display-only fields before updating
    const { local_start, local_end, ...dbUpdates } = updates;

    const { data, error } = await supabase
      .from('job_occurrences')
      .update(dbUpdates)
      .eq('id', jobId)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (error) throw error;
    
    toast({
      title: "Job updated",
      description: "The job has been successfully updated.",
    });
    
    await fetchJobs();
    return data;
  };

  const deleteJob = async (jobId: string) => {
    if (!user || !tenantId) throw new Error('User not authenticated');

    const { error } = await supabase
      .from('job_occurrences')
      .delete()
      .eq('id', jobId)
      .eq('tenant_id', tenantId);

    if (error) throw error;
    
    toast({
      title: "Job deleted",
      description: "The job has been successfully deleted.",
    });
    
    await fetchJobs();
  };

  useEffect(() => {
    fetchJobs();
  }, [user, tenantId, userTimezone]);

  return {
    jobs,
    loading,
    refetch: fetchJobs,
    updateJob,
    deleteJob,
  };
}