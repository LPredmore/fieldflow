import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useToast } from '@/hooks/use-toast';
import { useInvoices } from './useInvoices';
import { useJobSeries, CreateJobSeriesData } from './useJobSeries';

export interface Job {
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
  scheduled_date: string;
  scheduled_time?: string;
  complete_date?: string;
  estimated_duration?: number;
  assigned_to_user_id?: string;
  service_type: 'plumbing' | 'electrical' | 'hvac' | 'cleaning' | 'landscaping' | 'general_maintenance' | 'other';
  estimated_cost?: number;
  actual_cost?: number;
  additional_info?: string;
  completion_notes?: string;
  contractor_name?: string; // Added for display purposes
  series_id?: string; // For recurring jobs
  job_type?: 'single' | 'recurring'; // Unified calendar view
  start_at?: string; // Unified calendar view
  end_at?: string; // Unified calendar view
}

export interface UnifiedJob {
  id: string;
  tenant_id: string;
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
  job_type: 'single' | 'recurring';
  completion_notes?: string;
  additional_info?: string;
  created_at: string;
  updated_at?: string;
}

export function useJobs() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [unifiedJobs, setUnifiedJobs] = useState<UnifiedJob[]>([]);
  const [loading, setLoading] = useState(true);
  const { user, tenantId } = useAuth();
  const { toast } = useToast();
  const { createInvoice } = useInvoices();
  const { createJobSeries } = useJobSeries();

  const fetchJobs = async () => {
    if (!user || !tenantId) return;

    try {
      setLoading(true);
      
      // Fetch traditional jobs with contractor names
      const { data: jobsData, error: jobsError } = await supabase
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

      // Process jobs to include contractor names
      const processedJobs = (jobsData || []).map(job => ({
        ...job,
        contractor_name: job.assigned_contractor?.full_name || 
                         job.assigned_contractor?.email?.split('@')[0] || 
                         (job.assigned_to_user_id ? 'Unnamed User' : null),
        assigned_contractor: undefined, // Remove the nested profile object
      }));

      setJobs(processedJobs);

      // Fetch unified calendar view for upcoming jobs
      const { data: unifiedData, error: unifiedError } = await supabase
        .from('jobs_calendar_upcoming')
        .select('*')
        .gte('start_at', new Date().toISOString())
        .order('start_at', { ascending: true });

      if (unifiedError) {
        console.error('Error loading unified jobs:', unifiedError);
      } else {
        // Type the unified data properly
        const typedUnifiedData: UnifiedJob[] = (unifiedData || []).map(job => ({
          ...job,
          job_type: job.job_type as 'single' | 'recurring'
        }));
        setUnifiedJobs(typedUnifiedData);
      }

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

  const createJob = async (jobData: any) => {
    if (!user || !tenantId) throw new Error('User not authenticated');

    console.log('Creating job with data:', jobData);

    // Check if this is a recurring job
    if (jobData.is_recurring) {
      // Create a job series instead of a single job
      const seriesData: CreateJobSeriesData = {
        title: jobData.title,
        customer_id: jobData.customer_id || crypto.randomUUID(), // Generate UUID for customer
        customer_name: jobData.customer_name,
        service_type: jobData.service_type,
        description: jobData.description,
        start_date: jobData.scheduled_date,
        local_start_time: '08:00', // Default time
        duration_minutes: 60, // Default duration
        timezone: jobData.timezone || 'America/New_York',
        rrule: jobData.rrule,
        until_date: jobData.until_date,
        priority: jobData.priority,
        assigned_to_user_id: jobData.assigned_to_user_id,
        estimated_cost: jobData.estimated_cost,
        notes: jobData.additional_info,
      };

      return await createJobSeries(seriesData);
    } else {
      // Create a traditional single job - only include fields that exist in the table
      const jobInsertData = {
        title: jobData.title,
        customer_name: jobData.customer_name,
        customer_id: jobData.customer_id || crypto.randomUUID(), // Generate UUID for customer
        service_type: jobData.service_type,
        description: jobData.description,
        scheduled_date: jobData.scheduled_date,
        status: jobData.status || 'scheduled',
        priority: jobData.priority || 'medium',
        assigned_to_user_id: jobData.assigned_to_user_id,
        estimated_cost: jobData.estimated_cost,
        actual_cost: jobData.actual_cost,
        additional_info: jobData.additional_info,
        completion_notes: jobData.completion_notes,
        tenant_id: tenantId,
        created_by_user_id: user.id,
      };

      console.log('Inserting job data:', jobInsertData);

      const { data, error } = await supabase
        .from('jobs')
        .insert(jobInsertData)
        .select()
        .single();

      if (error) {
        console.error('Job creation error:', error);
        throw error;
      }
      
      toast({
        title: "Job created",
        description: "The job has been successfully created.",
      });
      
      await fetchJobs(); // Refresh the list
      return data;
    }
  };

  const updateJob = async (jobId: string, updates: Partial<Job>) => {
    if (!user || !tenantId) throw new Error('User not authenticated');

    // Get current job data to check for status changes
    const currentJob = jobs.find(job => job.id === jobId);
    const isStatusChangingToCompleted = updates.status === 'completed' && currentJob?.status !== 'completed';

    // Remove contractor_name from updates as it's not a database field
    const { contractor_name, ...dbUpdates } = updates;

    const { data, error } = await supabase
      .from('jobs')
      .update(dbUpdates)
      .eq('id', jobId)
      .select()
      .single();

    if (error) throw error;
    
    // Auto-create invoice when job is marked as completed
    if (isStatusChangingToCompleted && currentJob) {
      try {
        const issueDate = new Date().toISOString().split('T')[0];
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 30);
        
        const jobCost = data.actual_cost || data.estimated_cost || 0;
        const lineItems = [{
          description: `${data.service_type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())} - ${data.title}`,
          quantity: 1,
          unit_price: jobCost,
          total: jobCost
        }];

        await createInvoice({
          customer_id: data.customer_id,
          customer_name: data.customer_name,
          job_id: jobId,
          issue_date: issueDate,
          due_date: dueDate.toISOString().split('T')[0],
          status: 'draft',
          line_items: lineItems,
          tax_rate: 8.75, // Default tax rate
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
    } else {
      toast({
        title: "Job updated",
        description: "The job has been successfully updated.",
      });
    }
    
    await fetchJobs(); // Refresh the list
    return data;
  };

  const deleteJob = async (jobId: string) => {
    if (!user || !tenantId) throw new Error('User not authenticated');

    const { error } = await supabase
      .from('jobs')
      .delete()
      .eq('id', jobId);

    if (error) throw error;
    
    toast({
      title: "Job deleted",
      description: "The job has been successfully deleted.",
    });
    
    await fetchJobs(); // Refresh the list
  };

  useEffect(() => {
    fetchJobs();
  }, [user, tenantId]);

  return {
    jobs,
    unifiedJobs,
    loading,
    refetchJobs: fetchJobs,
    createJob,
    updateJob,
    deleteJob,
  };
}