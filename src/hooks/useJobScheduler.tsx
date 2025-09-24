import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useUserTimezone } from './useUserTimezone';
import { useToast } from '@/hooks/use-toast';
import { combineDateTimeToUTC, splitUTCToLocalDateTime } from '@/lib/timezoneUtils';

export interface ScheduledJob {
  id: string;
  tenant_id: string;
  customer_id: string;
  customer_name: string;
  assigned_to_user_id?: string;
  title: string;
  description?: string;
  start_at: string; // UTC timestamp
  end_at: string; // UTC timestamp  
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  estimated_cost?: number;
  actual_cost?: number;
  completion_notes?: string;
  job_type: 'one_time' | 'recurring_instance';
  created_at: string;
  updated_at?: string;
  // Local display fields (computed)
  local_start: Date;
  local_end: Date;
}

export interface CreateJobData {
  customer_id: string;
  customer_name: string;
  assigned_to_user_id?: string;
  title: string;
  description?: string;
  service_type: 'plumbing' | 'electrical' | 'hvac' | 'cleaning' | 'landscaping' | 'general_maintenance' | 'other';
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  duration_minutes: number;
  estimated_cost?: number;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  is_recurring: boolean;
  rrule?: string;
  until_date?: string;
}

export function useJobScheduler() {
  const [jobs, setJobs] = useState<ScheduledJob[]>([]);
  const [loading, setLoading] = useState(true);
  const { user, tenantId } = useAuth();
  const userTimezone = useUserTimezone();
  const { toast } = useToast();

  // Fetch all jobs from the unified view
  const fetchJobs = useCallback(async () => {
    if (!user || !tenantId) return;

    try {
      setLoading(true);
      console.log('🗓️ Fetching jobs for tenant:', tenantId, 'timezone:', userTimezone);
      
      const { data, error } = await supabase
        .from('jobs_calendar_upcoming')
        .select('*')
        .order('start_at', { ascending: true });

      if (error) {
        console.error('❌ Error fetching jobs:', error);
        toast({
          variant: "destructive",
          title: "Error loading jobs",
          description: error.message,
        });
        return;
      }

      console.log(`✅ Loaded ${data?.length || 0} jobs from database`);

      // Transform data and add local timezone fields
      const transformedJobs: ScheduledJob[] = (data || []).map(job => ({
        ...job,
        job_type: job.job_type as 'one_time' | 'recurring_instance',
        local_start: new Date(job.start_at),
        local_end: new Date(job.end_at),
      }));

      setJobs(transformedJobs);
      console.log('🎯 Jobs ready for calendar display:', transformedJobs.length);
      
    } catch (error: any) {
      console.error('❌ Unexpected error fetching jobs:', error);
      toast({
        variant: "destructive",
        title: "Error loading jobs",
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  }, [user, tenantId, userTimezone, toast]);

  // Create a new job (one-time or recurring)
  const createJob = useCallback(async (jobData: CreateJobData) => {
    if (!user || !tenantId) throw new Error('User not authenticated');

    try {
      console.log('🚀 Creating job:', jobData);
      
      // Convert local date/time to UTC for storage
      const scheduledTimeUTC = combineDateTimeToUTC(jobData.date, jobData.time, userTimezone);
      const scheduledEndTimeUTC = new Date(scheduledTimeUTC.getTime() + (jobData.duration_minutes * 60 * 1000));
      
      console.log('⏰ Timezone conversion:', {
        local: `${jobData.date} ${jobData.time}`,
        timezone: userTimezone,
        utc_start: scheduledTimeUTC.toISOString(),
        utc_end: scheduledEndTimeUTC.toISOString()
      });

      // Create job series
      const seriesPayload = {
        tenant_id: tenantId,
        created_by_user_id: user.id,
        customer_id: jobData.customer_id,
        customer_name: jobData.customer_name,
        assigned_to_user_id: jobData.assigned_to_user_id,
        title: jobData.title,
        description: jobData.description,
        service_type: jobData.service_type,
        start_date: jobData.date,
        local_start_time: jobData.time,
        duration_minutes: jobData.duration_minutes,
        timezone: userTimezone,
        estimated_cost: jobData.estimated_cost,
        priority: jobData.priority,
        is_recurring: jobData.is_recurring,
        rrule: jobData.rrule,
        until_date: jobData.until_date,
        // NEW: Store pre-calculated UTC times
        scheduled_time_utc: scheduledTimeUTC.toISOString(),
        scheduled_end_time_utc: scheduledEndTimeUTC.toISOString(),
        generation_status: 'pending'
      };

      const { data: series, error: seriesError } = await supabase
        .from('job_series')
        .insert(seriesPayload)
        .select()
        .single();

      if (seriesError) throw seriesError;
      console.log('✅ Job series created:', series.id);

      // Generate occurrences
      if (jobData.is_recurring && jobData.rrule) {
        console.log('🔄 Generating recurring occurrences...');
        const { error: generateError } = await supabase.functions.invoke('generate-job-occurrences-enhanced', {
          body: { seriesId: series.id }
        });
        
        if (generateError) {
          console.error('❌ Error generating occurrences:', generateError);
          throw generateError;
        }
        
        console.log('✅ Recurring occurrences generated');
      } else {
        // Create single occurrence for one-time job
        console.log('📋 Creating single occurrence...');
        const { error: occurrenceError } = await supabase
          .from('job_occurrences')
          .insert({
            tenant_id: tenantId,
            series_id: series.id,
            customer_id: jobData.customer_id,
            assigned_to_user_id: jobData.assigned_to_user_id,
            start_at: scheduledTimeUTC.toISOString(),
            end_at: scheduledEndTimeUTC.toISOString(),
            status: 'scheduled',
            priority: jobData.priority,
            series_timezone: userTimezone,
            series_local_start_time: jobData.time
          });

        if (occurrenceError) throw occurrenceError;
        console.log('✅ Single occurrence created');
      }

      toast({
        title: "Job created successfully",
        description: `${jobData.is_recurring ? 'Recurring' : 'One-time'} job "${jobData.title}" has been scheduled.`,
      });

      // Refresh jobs
      await fetchJobs();
      return series;

    } catch (error: any) {
      console.error('❌ Error creating job:', error);
      toast({
        variant: "destructive",
        title: "Failed to create job",
        description: error.message,
      });
      throw error;
    }
  }, [user, tenantId, userTimezone, toast, fetchJobs]);

  // Update a job
  const updateJob = useCallback(async (jobId: string, updates: Partial<ScheduledJob>) => {
    if (!user || !tenantId) throw new Error('User not authenticated');

    try {
      const job = jobs.find(j => j.id === jobId);
      if (!job) throw new Error('Job not found');

      // Update in appropriate table based on job type
      if (job.job_type === 'one_time') {
        const { error } = await supabase
          .from('job_series')
          .update(updates)
          .eq('id', jobId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('job_occurrences')
          .update(updates)
          .eq('id', jobId);
        if (error) throw error;
      }

      toast({
        title: "Job updated",
        description: "The job has been successfully updated.",
      });

      await fetchJobs();
    } catch (error: any) {
      console.error('❌ Error updating job:', error);
      toast({
        variant: "destructive",
        title: "Failed to update job",
        description: error.message,
      });
      throw error;
    }
  }, [user, tenantId, jobs, toast, fetchJobs]);

  // Delete a job
  const deleteJob = useCallback(async (jobId: string) => {
    if (!user || !tenantId) throw new Error('User not authenticated');

    try {
      const job = jobs.find(j => j.id === jobId);
      if (!job) throw new Error('Job not found');

      if (job.job_type === 'one_time') {
        // Delete series (will cascade to occurrences)
        const { error } = await supabase
          .from('job_series')
          .delete()
          .eq('id', jobId);
        if (error) throw error;
      } else {
        // Delete single occurrence
        const { error } = await supabase
          .from('job_occurrences')
          .delete()
          .eq('id', jobId);
        if (error) throw error;
      }

      toast({
        title: "Job deleted",
        description: "The job has been successfully deleted.",
      });

      await fetchJobs();
    } catch (error: any) {
      console.error('❌ Error deleting job:', error);
      toast({
        variant: "destructive",
        title: "Failed to delete job",
        description: error.message,
      });
      throw error;
    }
  }, [user, tenantId, jobs, toast, fetchJobs]);

  // Get jobs for calendar display (with timezone conversion)
  const getCalendarEvents = useCallback(() => {
    return jobs.map(job => ({
      id: job.id,
      title: job.title,
      start: job.start_at, // Keep UTC for FullCalendar
      end: job.end_at,     // Keep UTC for FullCalendar
      backgroundColor: job.status === 'completed' ? '#10b981' : 
                      job.status === 'cancelled' ? '#ef4444' :
                      job.priority === 'urgent' ? '#f59e0b' : '#3b82f6',
      borderColor: 'transparent',
      extendedProps: {
        ...job,
        localStart: job.local_start,
        localEnd: job.local_end,
      }
    }));
  }, [jobs]);

  // Initialize
  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  return {
    jobs,
    loading,
    createJob,
    updateJob,
    deleteJob,
    refreshJobs: fetchJobs,
    getCalendarEvents,
    // Derived data
    upcomingJobs: jobs.filter(job => 
      new Date(job.start_at) > new Date() && job.status === 'scheduled'
    ).slice(0, 5),
    todaysJobs: jobs.filter(job => {
      const today = new Date();
      const jobDate = new Date(job.start_at);
      return jobDate.toDateString() === today.toDateString();
    }),
  };
}