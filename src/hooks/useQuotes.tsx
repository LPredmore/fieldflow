import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { addDays, format } from "date-fns";

// Interfaces
interface LineItem {
  id?: string;
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
}

interface Quote {
  id: string;
  quote_number: string;
  customer_id: string;
  customer_name: string;
  title: string;
  status: 'draft' | 'sent' | 'accepted' | 'declined' | 'expired';
  valid_until?: string;
  sent_date?: string;
  line_items: LineItem[];
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total_amount: number;
  notes?: string;
  terms: string;
  created_at: string;
  updated_at?: string;
  tenant_id: string;
  created_by_user_id: string;
}

interface QuoteFormData {
  customer_id: string;
  customer_name: string;
  title: string;
  status: 'draft' | 'sent' | 'accepted' | 'declined';
  valid_until?: string;
  line_items: LineItem[];
  tax_rate: number;
  notes?: string;
  terms: string;
}

interface QuoteStats {
  total: number;
  draft: number;
  sent: number;
  accepted: number;
  declined: number;
  expired: number;
  total_value: number;
  acceptance_rate: number;
}

export const useQuotes = () => {
  const { user, tenantId } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch quotes
  const {
    data: quotes = [],
    isLoading: loading,
    error,
  } = useQuery({
    queryKey: ["quotes", tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      
      const { data, error } = await supabase
        .from("quotes")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data || []).map(quote => ({
        ...quote,
        line_items: (quote.line_items as unknown) as LineItem[]
      })) as Quote[];
    },
    enabled: !!tenantId,
  });

  // Calculate statistics
  const stats: QuoteStats = {
    total: quotes.length,
    draft: quotes.filter(q => q.status === 'draft').length,
    sent: quotes.filter(q => q.status === 'sent').length,
    accepted: quotes.filter(q => q.status === 'accepted').length,
    declined: quotes.filter(q => q.status === 'declined').length,
    expired: quotes.filter(q => isExpired(q)).length,
    total_value: quotes.reduce((sum, quote) => sum + Number(quote.total_amount), 0),
    acceptance_rate: quotes.length > 0 ? (quotes.filter(q => q.status === 'accepted').length / quotes.length) * 100 : 0,
  };

  // Helper function to check if quote is expired
  const isExpired = (quote: Quote): boolean => {
    if (!quote.valid_until) return false;
    return new Date(quote.valid_until) < new Date() && quote.status === 'sent';
  };

  // Generate unique quote number
  const generateQuoteNumber = async (): Promise<string> => {
    const currentYear = new Date().getFullYear();
    const { data: existingQuotes } = await supabase
      .from("quotes")
      .select("quote_number")
      .eq("tenant_id", tenantId)
      .like("quote_number", `QUO-${currentYear}-%`);
    
    const sequenceNumber = (existingQuotes?.length || 0) + 1;
    return `QUO-${currentYear}-${sequenceNumber.toString().padStart(3, '0')}`;
  };

  // Create quote mutation
  const createQuoteMutation = useMutation({
    mutationFn: async (formData: QuoteFormData) => {
      if (!user || !tenantId) throw new Error("Authentication required");
      
      const quoteNumber = await generateQuoteNumber();
      
      // Calculate totals
      const subtotal = formData.line_items.reduce((sum, item) => sum + item.total, 0);
      const taxAmount = subtotal * (formData.tax_rate / 100);
      const totalAmount = subtotal + taxAmount;

      const quoteData = {
        quote_number: quoteNumber,
        customer_id: formData.customer_id,
        customer_name: formData.customer_name,
        title: formData.title,
        status: formData.status,
        valid_until: formData.valid_until,
        line_items: formData.line_items as any,
        subtotal,
        tax_rate: formData.tax_rate,
        tax_amount: taxAmount,
        total_amount: totalAmount,
        notes: formData.notes,
        terms: formData.terms,
        tenant_id: tenantId,
        created_by_user_id: user.id,
      };

      const { data, error } = await supabase
        .from("quotes")
        .insert([quoteData])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quotes"] });
      toast({
        title: "Success",
        description: "Quote created successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Update quote mutation
  const updateQuoteMutation = useMutation({
    mutationFn: async ({ id, ...formData }: QuoteFormData & { id: string }) => {
      if (!tenantId) throw new Error("Authentication required");
      
      // Calculate totals
      const subtotal = formData.line_items.reduce((sum, item) => sum + item.total, 0);
      const taxAmount = subtotal * (formData.tax_rate / 100);
      const totalAmount = subtotal + taxAmount;

      const quoteData = {
        customer_id: formData.customer_id,
        customer_name: formData.customer_name,
        title: formData.title,
        status: formData.status,
        valid_until: formData.valid_until,
        line_items: formData.line_items as any,
        subtotal,
        tax_rate: formData.tax_rate,
        tax_amount: taxAmount,
        total_amount: totalAmount,
        notes: formData.notes,
        terms: formData.terms,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from("quotes")
        .update(quoteData)
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quotes"] });
      toast({
        title: "Success",
        description: "Quote updated successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Delete quote mutation
  const deleteQuoteMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!tenantId) throw new Error("Authentication required");
      
      const { error } = await supabase
        .from("quotes")
        .delete()
        .eq("id", id)
        .eq("tenant_id", tenantId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quotes"] });
      toast({
        title: "Success",
        description: "Quote deleted successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Share quote mutation
  const shareQuoteMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!tenantId) throw new Error("Authentication required");
      
      const { data, error } = await supabase
        .from("quotes")
        .update({ 
          status: 'sent',
          sent_date: new Date().toISOString() 
        })
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .select()
        .single();

      if (error) throw error;
      
      // Generate public URL
      const publicUrl = `${window.location.origin}/public-quote/${id}`;
      
      // Copy to clipboard
      await navigator.clipboard.writeText(publicUrl);
      
      return { quote: data, publicUrl };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["quotes"] });
      toast({
        title: "Link copied to clipboard!",
        description: `Share it with ${result.quote.customer_name}: ${result.publicUrl}`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Convert quote to job mutation
  const convertToJobMutation = useMutation({
    mutationFn: async (quoteId: string) => {
      if (!user || !tenantId) throw new Error("Authentication required");
      
      // Get the quote details first
      const { data: quote, error: quoteError } = await supabase
        .from("quotes")
        .select("*")
        .eq("id", quoteId)
        .eq("tenant_id", tenantId)
        .single();

      if (quoteError || !quote) throw new Error("Quote not found");

      // Create job from quote
      const jobData = {
        title: quote.title,
        customer_id: quote.customer_id,
        customer_name: quote.customer_name,
        status: 'scheduled' as const,
        priority: 'medium' as const,
        scheduled_date: format(new Date(), 'yyyy-MM-dd'),
        service_type: 'general_maintenance' as const,
        description: `Job created from quote ${quote.quote_number}`,
        estimated_cost: quote.total_amount,
        tenant_id: tenantId,
        created_by_user_id: user.id,
      };

      const { error: jobError } = await supabase
        .from("jobs")
        .insert([jobData]);

      if (jobError) throw jobError;

      // Update quote status to accepted
      const { error: updateError } = await supabase
        .from("quotes")
        .update({ status: 'accepted' })
        .eq("id", quoteId)
        .eq("tenant_id", tenantId);

      if (updateError) throw updateError;
      
      return quote;
    },
    onSuccess: (quote) => {
      queryClient.invalidateQueries({ queryKey: ["quotes"] });
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      toast({
        title: "Success",
        description: `Job created from quote ${quote.quote_number}`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return {
    quotes,
    loading,
    error,
    stats,
    isExpired,
    createQuote: createQuoteMutation.mutate,
    updateQuote: updateQuoteMutation.mutate,
    deleteQuote: deleteQuoteMutation.mutate,
    shareQuote: shareQuoteMutation.mutate,
    convertToJob: convertToJobMutation.mutate,
    isCreating: createQuoteMutation.isPending,
    isUpdating: updateQuoteMutation.isPending,
    isDeleting: deleteQuoteMutation.isPending,
    isSharing: shareQuoteMutation.isPending,
    isConverting: convertToJobMutation.isPending,
  };
};