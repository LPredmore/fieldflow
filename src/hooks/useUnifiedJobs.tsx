import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useToast } from '@/hooks/use-toast';
import { useInvoices } from './useInvoices';
import { useUserTimezone } from './useUserTimezone';

export interface UnifiedJob {
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
  start_at: string;
  end_at: string;
  series_id?: string;
  job_type: 'one_time' | 'recurring_instance';
  completion_notes?: string;
  additional_info?: string;
  contractor_name?: string;
  // Original job fields for backward compatibility
  scheduled_date?: string;
  scheduled_time?: string;
  complete_date?: string;
  estimated_duration?: number;
}

export function useUnifiedJobs() {
  const [unifiedJobs, setUnifiedJobs] = useState<UnifiedJob[]>([]);
  const [loading, setLoading] = useState(true);
  const { user, tenantId } = useAuth();
  const { toast } = useToast();
  const { createInvoice } = useInvoices();
  const userTimezone = useUserTimezone();

  const fetchUnifiedJobs = async () => {
    if (!user || !tenantId) return;

    try {
      setLoading(true);
      
      // Fetch one-time jobs from job_series where is_recurring = false
      // Using aggressive type assertion to avoid TypeScript deep instantiation issues
      const oneTimeResult = await (supabase as any)
        .from('job_series')
        .select('*')
        .eq('is_recurring', false)
        .order('created_at', { ascending: false });
        
      const oneTimeJobSeries = oneTimeResult.data || [];
      const jobsError = oneTimeResult.error;

      if (jobsError) {
        toast({
          variant: "destructive",
          title: "Error loading jobs",
          description: jobsError.message,
        });
        return;
      }

      // Fetch recurring job instances (job occurrences)
      const occurrencesQuery = supabase
        .from('job_occurrences')
        .select(`
          *,
          job_series!job_occurrences_series_id_fkey(
            title,
            description,
            service_type,
            estimated_cost,
            notes
          )
        `)
        .order('start_at', { ascending: false });

      const { data: jobOccurrences, error: occurrencesError } = await occurrencesQuery;

      if (occurrencesError) {
        toast({
          variant: "destructive",
          title: "Error loading job occurrences",
          description: occurrencesError.message,
        });
        return;
      }

      // Transform one-time job series to unified format
      const transformedOneTimeJobs: UnifiedJob[] = [];
      
      for (const job of oneTimeJobSeries) {
        // Get contractor name separately
        let contractorName;
        if (job.assigned_to_user_id) {
          const { data: contractorData } = await supabase
            .from('profiles')
            .select('full_name, email')
            .eq('id', job.assigned_to_user_id)
            .single();
          
          contractorName = contractorData?.full_name || 
                          contractorData?.email?.split('@')[0] || 
                          'Unnamed User';
        }
        
        try {
          // Convert local_start_time and duration to start/end times
          const startTime = job.local_start_time || '08:00:00';
          const startTimeFormatted = startTime.substring(0, 5); // HH:mm format
          
          // Calculate end time based on duration_minutes
          const startHours = parseInt(startTime.split(':')[0]);
          const startMinutes = parseInt(startTime.split(':')[1]);
          const totalMinutes = startHours * 60 + startMinutes + (job.duration_minutes || 60);
          const endHours = Math.floor(totalMinutes / 60);
          const endMinutesRemainder = totalMinutes % 60;
          const endTime = `${endHours.toString().padStart(2, '0')}:${endMinutesRemainder.toString().padStart(2, '0')}`;

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
            status: 'scheduled' as const, // One-time jobs from job_series are always scheduled until they have occurrences
            priority: job.priority,
            assigned_to_user_id: job.assigned_to_user_id,
            service_type: job.service_type,
            estimated_cost: job.estimated_cost,
            actual_cost: null, // No actual cost until job is completed
            start_at: `${job.start_date}T${startTimeFormatted}:00.000Z`,
            end_at: `${job.start_date}T${endTime}:00.000Z`,
            job_type: 'one_time' as const,
            completion_notes: undefined,
            additional_info: job.notes,
            contractor_name: contractorName,
            // Backward compatibility fields
            scheduled_date: job.start_date,
            scheduled_time: startTimeFormatted,
            complete_date: undefined,
            estimated_duration: job.duration_minutes / 60, // Convert minutes to hours
          });
        } catch (error) {
          console.error('Error transforming job:', job.id, error);
        }
      }

      // Filter out job occurrences with invalid dates and transform to unified format
      const transformedJobOccurrences: UnifiedJob[] = (jobOccurrences || [])
        .filter(occurrence => occurrence.start_at && occurrence.end_at)
        .map(occurrence => {
          try {
            // Validate that start_at and end_at are valid dates
            const startDate = new Date(occurrence.start_at);
            const endDate = new Date(occurrence.end_at);
            
            if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
              console.warn('Invalid date in occurrence:', occurrence.id, occurrence.start_at, occurrence.end_at);
              return null;
            }

            return {
              id: occurrence.id,
              created_at: occurrence.created_at,
              updated_at: occurrence.updated_at,
              tenant_id: occurrence.tenant_id,
              created_by_user_id: user?.id || '', // Use current user as creator for occurrences
              customer_id: occurrence.customer_id,
              customer_name: occurrence.customer_name,
              title: occurrence.override_title || occurrence.job_series?.title || 'Recurring Job',
              description: occurrence.override_description || occurrence.job_series?.description,
              status: occurrence.status,
              priority: occurrence.priority,
              assigned_to_user_id: occurrence.assigned_to_user_id,
              service_type: occurrence.job_series?.service_type || 'general_maintenance',
              estimated_cost: occurrence.override_estimated_cost || occurrence.job_series?.estimated_cost,
              actual_cost: occurrence.actual_cost,
              start_at: occurrence.start_at,
              end_at: occurrence.end_at,
              series_id: occurrence.series_id,
              job_type: 'recurring_instance' as const,
              completion_notes: occurrence.completion_notes,
              additional_info: occurrence.job_series?.notes,
              // Backward compatibility fields
              scheduled_date: occurrence.start_at.split('T')[0],
              scheduled_time: startDate.toLocaleTimeString('en-US', { 
                hour12: false, 
                hour: '2-digit', 
                minute: '2-digit' 
              }),
              complete_date: occurrence.status === 'completed' ? occurrence.start_at.split('T')[0] : undefined
            };
          } catch (error) {
            console.error('Error transforming occurrence:', occurrence.id, error);
            return null;
          }
        })
        .filter((occurrence): occurrence is NonNullable<typeof occurrence> => occurrence !== null);

      // Combine and sort by start date
      const combined = [...transformedOneTimeJobs, ...transformedJobOccurrences]
        .sort((a, b) => new Date(b.start_at).getTime() - new Date(a.start_at).getTime());

      setUnifiedJobs(combined);

    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error loading jobs",
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  // Get upcoming scheduled jobs for dashboard
  const upcomingJobs = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    return unifiedJobs
      .filter(job => job.status === 'scheduled' && new Date(job.start_at) <= today)
      .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime())
      .slice(0, 3);
  }, [unifiedJobs]);

  const updateJob = async (jobId: string, updates: Partial<UnifiedJob>) => {
    if (!user || !tenantId) throw new Error('User not authenticated');

    const job = unifiedJobs.find(j => j.id === jobId);
    if (!job) throw new Error('Job not found');

    const isStatusChangingToCompleted = updates.status === 'completed' && job.status !== 'completed';
    const isStatusChangingToCancelled = updates.status === 'cancelled' && job.status !== 'cancelled';

    // Handle cancellation of recurring jobs
    if (isStatusChangingToCancelled && job.job_type === 'recurring_instance' && job.series_id) {
      // Cancel all future occurrences in the series
      const { error: cancelError } = await supabase
        .from('job_occurrences')
        .update({ status: 'cancelled' })
        .eq('series_id', job.series_id)
        .gt('start_at', new Date().toISOString())
        .neq('status', 'completed'); // Don't cancel completed ones

      if (cancelError) {
        console.error('Error cancelling future occurrences:', cancelError);
      }
    }

    // Update the specific job/occurrence
    let data, error;
    if (job.job_type === 'one_time') {
      // Update in job_series table (one-time jobs are now stored there with is_recurring=false)
      const { contractor_name, job_type, start_at, end_at, series_id, scheduled_date, scheduled_time, complete_date, estimated_duration, ...dbUpdates } = updates;
      ({ data, error } = await supabase
        .from('job_series')
        .update(dbUpdates)
        .eq('id', jobId)
        .select()
        .single());
    } else {
      // Update in job_occurrences table
      const { contractor_name, job_type, scheduled_date, scheduled_time, complete_date, 
              estimated_duration, ...dbUpdates } = updates;
      ({ data, error } = await supabase
        .from('job_occurrences')
        .update(dbUpdates)
        .eq('id', jobId)
        .select()
        .single());
    }

    if (error) throw error;
    
    // Auto-create invoice when job is marked as completed
    if (isStatusChangingToCompleted) {
      try {
        const issueDate = new Date().toISOString().split('T')[0];
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 30);
        
        const jobCost = data.actual_cost || job.estimated_cost || 0;
        const lineItems = [{
          description: `${job.service_type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())} - ${job.title}`,
          quantity: 1,
          unit_price: jobCost,
          total: jobCost
        }];

        await createInvoice({
          customer_id: job.customer_id,
          customer_name: job.customer_name,
          job_id: jobId,
          issue_date: issueDate,
          due_date: dueDate.toISOString().split('T')[0],
          status: 'draft',
          line_items: lineItems,
          tax_rate: 8.75,
          payment_terms: 'Net 30',
          notes: data.completion_notes || undefined
        });

        toast({
          title: "Job completed & Invoice created",
          description: "The job has been marked as completed and a draft invoice has been created.",
        });
      } catch (invoiceError) {
        console.error('Error creating invoice:', invoiceError);
        toast({
          title: "Job updated",
          description: "The job has been updated, but there was an error creating the invoice.",
          variant: "destructive",
        });
      }
    } else if (isStatusChangingToCancelled && job.job_type === 'recurring_instance') {
      toast({
        title: "Job series cancelled",
        description: "This job and all future occurrences in the series have been cancelled.",
      });
    } else {
      toast({
        title: "Job updated",
        description: "The job has been successfully updated.",
      });
    }
    
    await fetchUnifiedJobs();
    return data;
  };

  const deleteJob = async (jobId: string) => {
    if (!user || !tenantId) throw new Error('User not authenticated');

    const job = unifiedJobs.find(j => j.id === jobId);
    if (!job) throw new Error('Job not found');

    let error;
    if (job.job_type === 'one_time') {
      ({ error } = await supabase.from('job_series').delete().eq('id', jobId));
    } else {
      ({ error } = await supabase.from('job_occurrences').delete().eq('id', jobId));
    }

    if (error) throw error;
    
    toast({
      title: "Job deleted",
      description: "The job has been successfully deleted.",
    });
    
    await fetchUnifiedJobs();
  };

  useEffect(() => {
    fetchUnifiedJobs();
  }, [user, tenantId]);

  return {
    unifiedJobs,
    upcomingJobs,
    loading,
    refetchJobs: fetchUnifiedJobs,
    updateJob,
    deleteJob,
  };
}