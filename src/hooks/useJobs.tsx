import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useToast } from '@/hooks/use-toast';
import { useInvoices } from './useInvoices';

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
  estimated_duration?: number;
  assigned_to_user_id?: string;
  service_type: 'plumbing' | 'electrical' | 'hvac' | 'cleaning' | 'landscaping' | 'general_maintenance' | 'other';
  estimated_cost?: number;
  actual_cost?: number;
  additional_info?: string;
  completion_notes?: string;
  contractor_name?: string; // Added for display purposes
}

export function useJobs() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const { user, tenantId } = useAuth();
  const { toast } = useToast();
  const { createInvoice } = useInvoices();

  const fetchJobs = async () => {
    if (!user || !tenantId) return;

    try {
      setLoading(true);
      
      // Fetch jobs with contractor names
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

  const createJob = async (jobData: Omit<Job, 'id' | 'created_at' | 'updated_at' | 'tenant_id' | 'created_by_user_id' | 'contractor_name'>) => {
    if (!user || !tenantId) throw new Error('User not authenticated');

    const { data, error } = await supabase
      .from('jobs')
      .insert({
        ...jobData,
        tenant_id: tenantId,
        created_by_user_id: user.id,
      })
      .select()
      .single();

    if (error) throw error;
    
    toast({
      title: "Job created",
      description: "The job has been successfully created.",
    });
    
    await fetchJobs(); // Refresh the list
    return data;
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
    loading,
    refetchJobs: fetchJobs,
    createJob,
    updateJob,
    deleteJob,
  };
}