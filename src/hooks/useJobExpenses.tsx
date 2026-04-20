import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import type { Database } from '@/integrations/supabase/types';

export type JobExpense = Database['public']['Tables']['job_expenses']['Row'];
export type ExpenseCategory = Database['public']['Enums']['expense_category'];

export interface CreateExpenseInput {
  job_series_id: string;
  job_occurrence_id?: string | null;
  category: ExpenseCategory;
  description: string;
  quantity?: number;
  unit_cost: number;
  markup_percent?: number | null;
  billable?: boolean;
  expense_date?: string;
  vendor?: string | null;
  receipt_file_id?: string | null;
  notes?: string | null;
}

export function useJobExpenses(jobSeriesId?: string) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const expensesQuery = useQuery({
    queryKey: ['job-expenses', jobSeriesId],
    queryFn: async () => {
      if (!jobSeriesId) return [];
      const { data, error } = await supabase
        .from('job_expenses')
        .select('*')
        .eq('job_series_id', jobSeriesId)
        .order('expense_date', { ascending: false });
      if (error) throw error;
      return data as JobExpense[];
    },
    enabled: !!jobSeriesId && !!user,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['job-expenses', jobSeriesId] });
    queryClient.invalidateQueries({ queryKey: ['job-cost-summary', jobSeriesId] });
  };

  const createExpense = useMutation({
    mutationFn: async (input: CreateExpenseInput) => {
      if (!user) throw new Error('Not authenticated');

      // Get tenant_id from profile
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id, role, parent_admin_id')
        .eq('id', user.id)
        .single();
      if (profileError) throw profileError;

      const tenant_id =
        profile.role === 'business_admin' ? profile.id : profile.parent_admin_id;
      if (!tenant_id) throw new Error('Could not resolve tenant');

      const { data, error } = await supabase
        .from('job_expenses')
        .insert({
          tenant_id,
          created_by_user_id: user.id,
          job_series_id: input.job_series_id,
          job_occurrence_id: input.job_occurrence_id ?? null,
          category: input.category,
          description: input.description,
          quantity: input.quantity ?? 1,
          unit_cost: input.unit_cost,
          markup_percent: input.markup_percent ?? null,
          billable: input.billable ?? true,
          expense_date: input.expense_date ?? new Date().toISOString().slice(0, 10),
          vendor: input.vendor ?? null,
          receipt_file_id: input.receipt_file_id ?? null,
          notes: input.notes ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Expense added' });
    },
    onError: (e: any) =>
      toast({ title: 'Failed to add expense', description: e.message, variant: 'destructive' }),
  });

  const updateExpense = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<JobExpense> & { id: string }) => {
      const { data, error } = await supabase
        .from('job_expenses')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Expense updated' });
    },
    onError: (e: any) =>
      toast({ title: 'Update failed', description: e.message, variant: 'destructive' }),
  });

  const deleteExpense = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('job_expenses').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Expense deleted' });
    },
    onError: (e: any) =>
      toast({ title: 'Delete failed', description: e.message, variant: 'destructive' }),
  });

  return {
    expenses: expensesQuery.data ?? [],
    isLoading: expensesQuery.isLoading,
    error: expensesQuery.error,
    createExpense: createExpense.mutateAsync,
    updateExpense: updateExpense.mutateAsync,
    deleteExpense: deleteExpense.mutateAsync,
    isCreating: createExpense.isPending,
  };
}
