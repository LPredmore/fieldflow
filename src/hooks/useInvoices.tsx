import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface LineItem {
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
}

export interface Invoice {
  id: string;
  invoice_number: string;
  customer_id: string;
  customer_name: string;
  job_id?: string;
  issue_date: string;
  due_date: string;
  status: 'draft' | 'sent' | 'paid' | 'cancelled';
  line_items: LineItem[];
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total_amount: number;
  notes?: string;
  payment_terms: string;
  payment_instructions?: string;
  venmo_handle?: string;
  paypal_me_link?: string;
  sent_date?: string;
  paid_date?: string;
  created_at: string;
  updated_at?: string;
  tenant_id: string;
  created_by_user_id: string;
}

export interface InvoiceFormData {
  customer_id: string;
  customer_name: string;
  job_id?: string;
  issue_date: string;
  due_date: string;
  status: 'draft' | 'sent' | 'paid' | 'cancelled';
  line_items: LineItem[];
  tax_rate: number;
  notes?: string;
  payment_terms: string;
}

export interface InvoiceStats {
  total_billed: number;
  outstanding: number;
  overdue: number;
  paid_last_30_days: number;
  total_count: number;
}

export const useInvoices = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch all invoices
  const { data: invoices = [], isLoading: loading } = useQuery({
    queryKey: ["invoices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data.map(invoice => ({
        ...invoice,
        line_items: invoice.line_items as unknown as LineItem[]
      })) as Invoice[];
    },
  });

  // Calculate statistics
  const stats: InvoiceStats = {
    total_billed: invoices.reduce((sum, invoice) => sum + invoice.total_amount, 0),
    outstanding: invoices
      .filter(invoice => invoice.status === 'sent' || isOverdue(invoice))
      .reduce((sum, invoice) => sum + invoice.total_amount, 0),
    overdue: invoices
      .filter(invoice => isOverdue(invoice))
      .reduce((sum, invoice) => sum + invoice.total_amount, 0),
    paid_last_30_days: invoices
      .filter(invoice => {
        if (invoice.status !== 'paid' || !invoice.paid_date) return false;
        const paidDate = new Date(invoice.paid_date);
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        return paidDate >= thirtyDaysAgo;
      })
      .reduce((sum, invoice) => sum + invoice.total_amount, 0),
    total_count: invoices.length,
  };

  // Helper function to check if invoice is overdue
  const isOverdue = (invoice: Invoice): boolean => {
    if (invoice.status !== 'sent') return false;
    const dueDate = new Date(invoice.due_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    dueDate.setHours(0, 0, 0, 0);
    return today > dueDate;
  };

  // Generate invoice number
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
      const lastNumber = data[0].invoice_number.split('-')[2];
      nextNumber = parseInt(lastNumber) + 1;
    }

    return `INV-${currentYear}-${nextNumber.toString().padStart(4, '0')}`;
  };

  // Create invoice mutation
  const createInvoiceMutation = useMutation({
    mutationFn: async (invoiceData: InvoiceFormData) => {
      const invoiceNumber = await generateInvoiceNumber();
      
      // Calculate totals
      const subtotal = invoiceData.line_items.reduce((sum, item) => sum + item.total, 0);
      const tax_amount = subtotal * (invoiceData.tax_rate / 100);
      const total_amount = subtotal + tax_amount;

      const { data, error } = await supabase
        .from("invoices")
        .insert([{
          invoice_number: invoiceNumber,
          customer_id: invoiceData.customer_id,
          customer_name: invoiceData.customer_name,
          job_id: invoiceData.job_id || null,
          issue_date: invoiceData.issue_date,
          due_date: invoiceData.due_date,
          status: invoiceData.status,
          line_items: invoiceData.line_items as any,
          subtotal,
          tax_rate: invoiceData.tax_rate,
          tax_amount,
          total_amount,
          notes: invoiceData.notes || null,
          payment_terms: invoiceData.payment_terms,
        }])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      toast({
        title: "Success",
        description: "Invoice created successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to create invoice",
        variant: "destructive",
      });
      console.error("Error creating invoice:", error);
    },
  });

  // Update invoice mutation
  const updateInvoiceMutation = useMutation({
    mutationFn: async ({ id, ...invoiceData }: InvoiceFormData & { id: string }) => {
      // Calculate totals
      const subtotal = invoiceData.line_items.reduce((sum, item) => sum + item.total, 0);
      const tax_amount = subtotal * (invoiceData.tax_rate / 100);
      const total_amount = subtotal + tax_amount;

      const { data, error } = await supabase
        .from("invoices")
        .update({
          customer_id: invoiceData.customer_id,
          customer_name: invoiceData.customer_name,
          job_id: invoiceData.job_id,
          issue_date: invoiceData.issue_date,
          due_date: invoiceData.due_date,
          status: invoiceData.status,
          line_items: invoiceData.line_items as any,
          subtotal,
          tax_rate: invoiceData.tax_rate,
          tax_amount,
          total_amount,
          notes: invoiceData.notes,
          payment_terms: invoiceData.payment_terms,
        })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      toast({
        title: "Success",
        description: "Invoice updated successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to update invoice",
        variant: "destructive",
      });
      console.error("Error updating invoice:", error);
    },
  });

  // Delete invoice mutation
  const deleteInvoiceMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("invoices")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      toast({
        title: "Success",
        description: "Invoice deleted successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to delete invoice",
        variant: "destructive",
      });
      console.error("Error deleting invoice:", error);
    },
  });

  // Update invoice status mutation
  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status, additionalData }: { 
      id: string; 
      status: 'draft' | 'sent' | 'paid' | 'cancelled';
      additionalData?: { sent_date?: string; paid_date?: string; }
    }) => {
      const updateData: any = { status };
      
      if (additionalData?.sent_date) {
        updateData.sent_date = additionalData.sent_date;
      }
      if (additionalData?.paid_date) {
        updateData.paid_date = additionalData.paid_date;
      }

      const { data, error } = await supabase
        .from("invoices")
        .update(updateData)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      toast({
        title: "Success",
        description: "Invoice status updated successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to update invoice status",
        variant: "destructive",
      });
      console.error("Error updating invoice status:", error);
    },
  });

  return {
    invoices,
    loading,
    stats,
    isOverdue,
    createInvoice: createInvoiceMutation.mutateAsync,
    updateInvoice: updateInvoiceMutation.mutateAsync,
    deleteInvoice: deleteInvoiceMutation.mutateAsync,
    updateStatus: updateStatusMutation.mutateAsync,
  };
};