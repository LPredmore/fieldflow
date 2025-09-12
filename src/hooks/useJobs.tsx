import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useToast } from '@/hooks/use-toast';

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
  materials_needed?: any;
  completion_notes?: string;
  contractor_name?: string; // Added for display purposes
}

export function useJobs() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const { user, tenantId } = useAuth();
  const { toast } = useToast();

  const fetchJobs = async () => {
    if (!user || !tenantId) return;

    try {
      setLoading(true);
      
      // Fetch jobs with contractor names
      const { data: jobsData, error: jobsError } = await supabase
        .from('jobs')
        .select(`
          *,
          profiles!jobs_assigned_to_user_id_fkey(full_name)
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
        contractor_name: job.profiles?.full_name || null,
        profiles: undefined, // Remove the nested profile object
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

    // Remove contractor_name from updates as it's not a database field
    const { contractor_name, ...dbUpdates } = updates;

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