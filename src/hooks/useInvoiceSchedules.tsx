import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import type { LineItem } from '@/hooks/useInvoices';

export type InvoiceBillingMode = 'flat_fee' | 'per_visit_rollup';
export type InvoiceScheduleStatus = 'active' | 'paused' | 'ended';

export interface InvoiceSchedule {
  id: string;
  tenant_id: string;
  created_by_user_id: string;
  customer_id: string;
  customer_name: string;
  name: string;
  billing_mode: InvoiceBillingMode;
  linked_job_series_ids: string[];
  rrule: string;
  timezone: string;
  start_date: string;
  until_date: string | null;
  next_issue_at: string | null;
  last_issued_at: string | null;
  last_issued_invoice_id: string | null;
  line_items_template: LineItem[];
  tax_rate: number;
  payment_terms: string;
  due_days_after_issue: number;
  notes_template: string | null;
  auto_send: boolean;
  status: InvoiceScheduleStatus;
  created_at: string;
  updated_at: string | null;
}

export interface InvoiceScheduleFormData {
  customer_id: string;
  customer_name: string;
  name: string;
  billing_mode: InvoiceBillingMode;
  linked_job_series_ids: string[];
  rrule: string;
  timezone: string;
  start_date: string;
  until_date?: string | null;
  line_items_template: LineItem[];
  tax_rate: number;
  payment_terms: string;
  due_days_after_issue: number;
  notes_template?: string | null;
  auto_send: boolean;
  status?: InvoiceScheduleStatus;
}

export function useInvoiceSchedules() {
  const queryClient = useQueryClient();
  const { user, tenantId } = useAuth();
  const { toast } = useToast();

  const { data: schedules = [], isLoading: loading } = useQuery({
    queryKey: ['invoice_schedules'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoice_schedules' as any)
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data ?? []).map((row: any) => ({
        ...row,
        line_items_template: (row.line_items_template ?? []) as LineItem[],
        linked_job_series_ids: row.linked_job_series_ids ?? [],
      })) as InvoiceSchedule[];
    },
  });

  const createSchedule = useMutation({
    mutationFn: async (form: InvoiceScheduleFormData) => {
      if (!user?.id || !tenantId) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('invoice_schedules' as any)
        .insert([
          {
            tenant_id: tenantId,
            created_by_user_id: user.id,
            customer_id: form.customer_id,
            customer_name: form.customer_name,
            name: form.name,
            billing_mode: form.billing_mode,
            linked_job_series_ids: form.linked_job_series_ids ?? [],
            rrule: form.rrule,
            timezone: form.timezone,
            start_date: form.start_date,
            until_date: form.until_date ?? null,
            line_items_template: form.line_items_template as any,
            tax_rate: form.tax_rate,
            payment_terms: form.payment_terms,
            due_days_after_issue: form.due_days_after_issue,
            notes_template: form.notes_template ?? null,
            auto_send: form.auto_send,
            status: form.status ?? 'active',
          },
        ])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoice_schedules'] });
      toast({ title: 'Schedule created', description: 'The recurring invoice schedule is active.' });
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message ?? 'Failed to create schedule', variant: 'destructive' });
    },
  });

  const updateSchedule = useMutation({
    mutationFn: async ({ id, ...form }: InvoiceScheduleFormData & { id: string }) => {
      const { data, error } = await supabase
        .from('invoice_schedules' as any)
        .update({
          customer_id: form.customer_id,
          customer_name: form.customer_name,
          name: form.name,
          billing_mode: form.billing_mode,
          linked_job_series_ids: form.linked_job_series_ids ?? [],
          rrule: form.rrule,
          timezone: form.timezone,
          start_date: form.start_date,
          until_date: form.until_date ?? null,
          line_items_template: form.line_items_template as any,
          tax_rate: form.tax_rate,
          payment_terms: form.payment_terms,
          due_days_after_issue: form.due_days_after_issue,
          notes_template: form.notes_template ?? null,
          auto_send: form.auto_send,
          status: form.status ?? 'active',
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoice_schedules'] });
      toast({ title: 'Schedule updated' });
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message ?? 'Failed to update schedule', variant: 'destructive' });
    },
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: InvoiceScheduleStatus }) => {
      const { error } = await supabase
        .from('invoice_schedules' as any)
        .update({ status })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoice_schedules'] });
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  const deleteSchedule = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('invoice_schedules' as any)
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoice_schedules'] });
      toast({ title: 'Schedule deleted' });
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  const generateNow = useMutation({
    mutationFn: async (scheduleId: string) => {
      const { data, error } = await supabase.functions.invoke('generate-recurring-invoices', {
        body: { scheduleId },
      });
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['invoice_schedules'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      const generated = data?.generated ?? 0;
      const skipped = data?.skipped ?? 0;
      toast({
        title: 'Generation complete',
        description:
          generated > 0
            ? `Generated ${generated} invoice${generated === 1 ? '' : 's'}.`
            : skipped > 0
              ? `Nothing to bill for current period (${skipped} cycle${skipped === 1 ? '' : 's'} skipped).`
              : 'No cycles were due.',
      });
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message ?? 'Generation failed', variant: 'destructive' });
    },
  });

  return {
    schedules,
    loading,
    createSchedule: createSchedule.mutateAsync,
    updateSchedule: updateSchedule.mutateAsync,
    setStatus: setStatus.mutateAsync,
    deleteSchedule: deleteSchedule.mutateAsync,
    generateNow: generateNow.mutateAsync,
    isGenerating: generateNow.isPending,
  };
}
