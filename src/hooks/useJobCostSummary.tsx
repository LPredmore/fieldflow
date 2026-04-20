import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { Database } from '@/integrations/supabase/types';

export type JobCostSummary = Database['public']['Views']['job_cost_summary']['Row'];

export function useJobCostSummary(jobSeriesId?: string) {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ['job-cost-summary', jobSeriesId],
    queryFn: async () => {
      if (!jobSeriesId) return null;
      const { data, error } = await supabase
        .from('job_cost_summary')
        .select('*')
        .eq('job_series_id', jobSeriesId)
        .maybeSingle();
      if (error) throw error;
      return data as JobCostSummary | null;
    },
    enabled: !!jobSeriesId && !!user,
  });

  return {
    summary: query.data,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}
