import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";

export interface InvoiceableLineItem {
  source: "quote" | "labor" | "expense";
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
  // Source identifiers used to stamp billed_to_invoice_id
  time_entry_id?: string;
  expense_id?: string;
}

export interface InvoiceableSummary {
  job_series_id: string;
  job_title: string;
  service_type: string;
  customer_id: string;
  customer_name: string;
  quote_id: string | null;
  quote_number: string | null;
  quote_items: any[];
  labor_items: any[];
  expense_items: any[];
}

const normalizeQuoteItems = (items: any[]): InvoiceableLineItem[] =>
  (items || []).map((it) => ({
    source: "quote" as const,
    description: it.description ?? "Quote item",
    quantity: Number(it.quantity ?? 1),
    unit_price: Number(it.unit_price ?? 0),
    total: Number(it.total ?? Number(it.quantity ?? 1) * Number(it.unit_price ?? 0)),
  }));

const normalizeLaborItems = (items: any[]): InvoiceableLineItem[] =>
  (items || []).map((it) => ({
    source: "labor" as const,
    description: it.description,
    quantity: Number(it.quantity ?? 0),
    unit_price: Number(it.unit_price ?? 0),
    total: Number(it.total ?? 0),
    time_entry_id: it.time_entry_id,
  }));

const normalizeExpenseItems = (items: any[]): InvoiceableLineItem[] =>
  (items || []).map((it) => ({
    source: "expense" as const,
    description: it.description,
    quantity: Number(it.quantity ?? 0),
    unit_price: Number(it.unit_price ?? 0),
    total: Number(it.total ?? 0),
    expense_id: it.expense_id,
  }));

/**
 * Fetches the invoiceable summary for a job (quote items + unbilled labor + unbilled expenses).
 */
export const useJobInvoiceableSummary = (jobSeriesId?: string, enabled = true) => {
  return useQuery({
    queryKey: ["job-invoiceable-summary", jobSeriesId],
    enabled: !!jobSeriesId && enabled,
    queryFn: async (): Promise<InvoiceableSummary> => {
      const { data, error } = await supabase.rpc("get_job_invoiceable_summary", {
        _job_series_id: jobSeriesId!,
      });
      if (error) throw error;
      return data as unknown as InvoiceableSummary;
    },
  });
};

interface GenerateInvoiceArgs {
  jobSeriesId: string;
  /** Optional explicit selection of items. If omitted, all returned items are billed. */
  selectedItems?: InvoiceableLineItem[];
  taxRate?: number;
  paymentTerms?: string;
  notes?: string;
  dueInDays?: number;
  /** If true, navigate to the newly created invoice. */
  navigateOnSuccess?: boolean;
  /** If true, skip toast / navigation - useful for auto-trigger on completion. */
  silent?: boolean;
}

export const useGenerateInvoiceFromJob = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user, tenantId } = useAuth();
  const navigate = useNavigate();

  const generateInvoiceNumber = async (): Promise<string> => {
    const currentYear = new Date().getFullYear();
    const { data, error } = await supabase
      .from("invoices")
      .select("invoice_number")
      .like("invoice_number", `INV-${currentYear}-%`)
      .order("invoice_number", { ascending: false })
      .limit(1);
    if (error) throw error;
    let nextNumber = 1;
    if (data && data.length > 0) {
      const lastNumber = data[0].invoice_number.split("-")[2];
      nextNumber = parseInt(lastNumber) + 1;
    }
    return `INV-${currentYear}-${nextNumber.toString().padStart(4, "0")}`;
  };

  const mutation = useMutation({
    mutationFn: async (args: GenerateInvoiceArgs) => {
      if (!user || !tenantId) throw new Error("Not authenticated");

      // 1. Idempotency: don't auto-create another invoice if one already exists for this job
      //    (only enforced on auto/silent path; manual path may want a second invoice)
      if (args.silent) {
        const { data: existing } = await supabase
          .from("invoices")
          .select("id")
          .eq("job_id", args.jobSeriesId)
          .neq("status", "cancelled")
          .limit(1)
          .maybeSingle();
        if (existing) {
          return { invoice: existing, skipped: true as const };
        }
      }

      // 2. Pull invoiceable summary
      const { data: summaryData, error: summaryError } = await supabase.rpc(
        "get_job_invoiceable_summary",
        { _job_series_id: args.jobSeriesId }
      );
      if (summaryError) throw summaryError;
      const summary = summaryData as unknown as InvoiceableSummary;

      // 3. Build line items (use selected items if provided, otherwise everything)
      const allItems: InvoiceableLineItem[] = args.selectedItems ?? [
        ...normalizeQuoteItems(summary.quote_items || []),
        ...normalizeLaborItems(summary.labor_items || []),
        ...normalizeExpenseItems(summary.expense_items || []),
      ];

      if (allItems.length === 0) {
        throw new Error(
          "No invoiceable items found. Add labor or expenses, or link a quote."
        );
      }

      // 4. Compute totals
      const subtotal = allItems.reduce((sum, it) => sum + (it.total || 0), 0);
      const taxRate = args.taxRate ?? 0;
      const tax_amount = subtotal * (taxRate / 100);
      const total_amount = subtotal + tax_amount;

      const today = new Date();
      const due = new Date();
      due.setDate(today.getDate() + (args.dueInDays ?? 30));

      const invoiceNumber = await generateInvoiceNumber();

      // Strip our internal source identifiers from the persisted line items
      const persistedLineItems = allItems.map((it) => ({
        description: it.description,
        quantity: it.quantity,
        unit_price: it.unit_price,
        total: it.total,
        source: it.source,
      }));

      // 5. Insert invoice (link to job + quote)
      const { data: invoice, error: insertError } = await supabase
        .from("invoices")
        .insert({
          invoice_number: invoiceNumber,
          customer_id: summary.customer_id,
          customer_name: summary.customer_name,
          job_id: args.jobSeriesId,
          quote_id: summary.quote_id,
          issue_date: today.toISOString().split("T")[0],
          due_date: due.toISOString().split("T")[0],
          status: "draft",
          line_items: persistedLineItems as any,
          subtotal,
          tax_rate: taxRate,
          tax_amount,
          total_amount,
          payment_terms: args.paymentTerms ?? `Net ${args.dueInDays ?? 30}`,
          notes: args.notes ?? null,
          tenant_id: tenantId,
          created_by_user_id: user.id,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      // 6. Stamp billed_to_invoice_id on time entries and expenses to prevent double-billing
      const timeEntryIds = allItems
        .filter((i) => i.source === "labor" && i.time_entry_id)
        .map((i) => i.time_entry_id!);
      const expenseIds = allItems
        .filter((i) => i.source === "expense" && i.expense_id)
        .map((i) => i.expense_id!);

      if (timeEntryIds.length > 0) {
        const { error: teErr } = await supabase
          .from("time_entries")
          .update({ billed_to_invoice_id: invoice.id })
          .in("id", timeEntryIds);
        if (teErr) console.error("Failed to stamp time_entries:", teErr);
      }

      if (expenseIds.length > 0) {
        const { error: exErr } = await supabase
          .from("job_expenses")
          .update({ billed_to_invoice_id: invoice.id })
          .in("id", expenseIds);
        if (exErr) console.error("Failed to stamp job_expenses:", exErr);
      }

      return { invoice, skipped: false as const };
    },
    onSuccess: (result, vars) => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["job-invoiceable-summary", vars.jobSeriesId] });
      queryClient.invalidateQueries({ queryKey: ["job-cost-summary", vars.jobSeriesId] });
      queryClient.invalidateQueries({ queryKey: ["job-expenses", vars.jobSeriesId] });

      if (vars.silent) return;

      if (result.skipped) {
        toast({
          title: "Invoice already exists",
          description: "This job already has an invoice. Skipping creation.",
        });
        return;
      }

      toast({
        title: "Invoice generated",
        description: `Invoice ${(result.invoice as any).invoice_number ?? ""} created from job.`,
      });

      if (vars.navigateOnSuccess) {
        navigate("/invoices");
      }
    },
    onError: (error: any) => {
      toast({
        title: "Failed to generate invoice",
        description: error?.message ?? "Unknown error",
        variant: "destructive",
      });
    },
  });

  return {
    generateInvoice: mutation.mutateAsync,
    isGenerating: mutation.isPending,
  };
};
