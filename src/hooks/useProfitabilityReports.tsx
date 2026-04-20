import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { Database } from '@/integrations/supabase/types';

export type CustomerProfitabilityRow = {
  customer_id: string;
  customer_name: string;
  revenue: number;
  total_cost: number;
  gross_margin: number;
  margin_percent: number | null;
  job_count: number;
};

export type ServiceTypeProfitabilityRow = {
  service_type: Database['public']['Enums']['job_service_type'];
  revenue: number;
  total_cost: number;
  gross_margin: number;
  margin_percent: number | null;
  job_count: number;
};

export type JobProfitabilityRow = Database['public']['Views']['job_cost_summary']['Row'];

export function useProfitabilityReports(dateFrom: string, dateTo: string) {
  const { user } = useAuth();

  const customerQuery = useQuery({
    queryKey: ['profitability', 'customer', dateFrom, dateTo],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_customer_profitability', {
        date_from: dateFrom,
        date_to: dateTo,
      });
      if (error) throw error;
      return (data || []) as CustomerProfitabilityRow[];
    },
    enabled: !!user,
  });

  const serviceTypeQuery = useQuery({
    queryKey: ['profitability', 'service-type', dateFrom, dateTo],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_service_type_profitability', {
        date_from: dateFrom,
        date_to: dateTo,
      });
      if (error) throw error;
      return (data || []) as ServiceTypeProfitabilityRow[];
    },
    enabled: !!user,
  });

  const jobQuery = useQuery({
    queryKey: ['profitability', 'job', dateFrom, dateTo],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('job_cost_summary')
        .select('*')
        .gte('start_date', dateFrom)
        .lte('start_date', dateTo)
        .order('gross_margin', { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data || []) as JobProfitabilityRow[];
    },
    enabled: !!user,
  });

  return {
    customers: customerQuery.data || [],
    serviceTypes: serviceTypeQuery.data || [],
    jobs: jobQuery.data || [],
    isLoading: customerQuery.isLoading || serviceTypeQuery.isLoading || jobQuery.isLoading,
    error: customerQuery.error || serviceTypeQuery.error || jobQuery.error,
  };
}
