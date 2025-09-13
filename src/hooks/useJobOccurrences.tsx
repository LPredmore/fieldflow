import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useToast } from '@/hooks/use-toast';

export interface JobOccurrence {
  id: string;
  created_at: string;
  updated_at?: string;
  tenant_id: string;
  series_id: string;
  start_at: string;
  end_at: string;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  assigned_to_user_id?: string;
  override_title?: string;
  override_description?: string;
  override_estimated_cost?: number;
  completion_notes?: string;
  actual_cost?: number;
  customer_id: string;
  customer_name: string;
}

export function useJobOccurrences() {
  const [occurrences, setOccurrences] = useState<JobOccurrence[]>([]);
  const [loading, setLoading] = useState(true);
  const { user, tenantId } = useAuth();
  const { toast } = useToast();

  const fetchOccurrences = async () => {
    if (!user || !tenantId) return;

    try {
      setLoading(true);
      
      const { data, error } = await supabase
        .from('job_occurrences')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('start_at', { ascending: true });

      if (error) {
        toast({
          variant: "destructive",
          title: "Error loading job occurrences",
          description: error.message,
        });
        return;
      }

      setOccurrences(data || []);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error loading job occurrences",
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  const updateOccurrence = async (occurrenceId: string, updates: Partial<JobOccurrence>) => {
    if (!user || !tenantId) throw new Error('User not authenticated');

    const { data, error } = await supabase
      .from('job_occurrences')
      .update(updates)
      .eq('id', occurrenceId)
      .select()
      .single();

    if (error) throw error;
    
    toast({
      title: "Job occurrence updated",
      description: "The job occurrence has been successfully updated.",
    });
    
    await fetchOccurrences();
    return data;
  };

  const skipOccurrence = async (occurrenceId: string) => {
    return updateOccurrence(occurrenceId, { status: 'cancelled' });
  };

  const rescheduleOccurrence = async (occurrenceId: string, newStartAt: string, durationMinutes: number = 60) => {
    const newEndAt = new Date(new Date(newStartAt).getTime() + (durationMinutes * 60 * 1000)).toISOString();
    
    return updateOccurrence(occurrenceId, { 
      start_at: newStartAt,
      end_at: newEndAt 
    });
  };

  const completeOccurrence = async (occurrenceId: string, completionData?: {
    actual_cost?: number;
    completion_notes?: string;
  }) => {
    const updates: Partial<JobOccurrence> = {
      status: 'completed' as const,
      ...completionData
    };

    return updateOccurrence(occurrenceId, updates);
  };

  useEffect(() => {
    fetchOccurrences();
  }, [user, tenantId]);

  return {
    occurrences,
    loading,
    refetchOccurrences: fetchOccurrences,
    updateOccurrence,
    skipOccurrence,
    rescheduleOccurrence,
    completeOccurrence,
  };
}