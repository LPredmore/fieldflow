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
  taxable?: boolean;
}

// Update Quote interface to include new date fields
interface Quote {
  id: string;
  quote_number: string;
  customer_id: string;
  customer_name: string;
  title: string;
  status: 'draft' | 'sent' | 'accepted' | 'declined' | 'expired';
  valid_until?: string;
  estimated_start_date?: string;
  estimated_completion_date?: string;
  sent_date?: string;
  is_emergency?: boolean;
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
  created_by_user_name?: string;
}

interface QuoteFormData {
  customer_id: string;
  customer_name: string;
  title: string;
  status: 'draft' | 'sent' | 'accepted' | 'declined';
  valid_until?: string;
  estimated_start_date?: string;
  estimated_completion_date?: string;
  is_emergency?: boolean;
  line_items: LineItem[];
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
      
      // Fetch quotes with creator profile information
      const { data, error } = await supabase
        .from("quotes")
        .select(`
          *,
          profiles!quotes_created_by_user_id_fkey (
            full_name
          )
        `)
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      
      // Map the data to include creator name and proper line items
      return (data || []).map(quote => ({
        ...quote,
        line_items: (quote.line_items as unknown) as LineItem[],
        created_by_user_name: quote.profiles?.full_name || 'Unknown User'
      })) as Quote[];
    },
    enabled: !!tenantId,
  });

  // Helper function to check if quote is expired
  const isExpired = (quote: Quote): boolean => {
    if (!quote.valid_until) return false;
    return new Date(quote.valid_until) < new Date() && quote.status === 'sent';
  };

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

  // Generate unique quote number with collision handling
  const generateQuoteNumber = async (): Promise<string> => {
    const currentYear = new Date().getFullYear();
    let attempts = 0;
    const maxAttempts = 10;
    
    while (attempts < maxAttempts) {
      try {
        // Get the highest sequence number for the current year
        const { data: existingQuotes } = await supabase
          .from("quotes")
          .select("quote_number")
          .eq("tenant_id", tenantId)
          .like("quote_number", `QUO-${currentYear}-%`)
          .order("quote_number", { ascending: false })
          .limit(1);
        
        let sequenceNumber = 1;
        if (existingQuotes && existingQuotes.length > 0) {
          const lastQuoteNumber = existingQuotes[0].quote_number;
          const match = lastQuoteNumber.match(/QUO-\d{4}-(\d{3})/);
          if (match) {
            sequenceNumber = parseInt(match[1]) + 1;
          }
        }
        
        const quoteNumber = `QUO-${currentYear}-${sequenceNumber.toString().padStart(3, '0')}`;
        
        // Check if this number already exists (double-check for race conditions)
        const { data: duplicate } = await supabase
          .from("quotes")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("quote_number", quoteNumber)
          .limit(1);
        
        if (!duplicate || duplicate.length === 0) {
          return quoteNumber;
        }
        
        // If duplicate exists, increment and try again
        attempts++;
        await new Promise(resolve => setTimeout(resolve, Math.random() * 100)); // Random delay
      } catch (error) {
        attempts++;
        if (attempts >= maxAttempts) throw error;
        await new Promise(resolve => setTimeout(resolve, Math.random() * 100));
      }
    }
    
    throw new Error("Failed to generate unique quote number after multiple attempts");
  };

  // Create quote mutation
  const createQuoteMutation = useMutation({
    mutationFn: async (formData: QuoteFormData) => {
      if (!user || !tenantId) throw new Error("Authentication required");
      
      const quoteNumber = await generateQuoteNumber();
      
      // Calculate totals with emergency multiplier
      const isEmergency = formData.is_emergency || false;
      
      // Get emergency multiplier from settings
      const { data: settingsData } = await supabase
        .from("settings")
        .select("service_settings")
        .eq("tenant_id", tenantId)
        .single();
      
      const emergencyMultiplier = (settingsData?.service_settings as any)?.emergency_rate_multiplier || 1.5;
      
      const subtotal = formData.line_items.reduce((sum, item) => sum + item.total, 0);
      
      // Calculate taxable and non-taxable amounts
      const taxableAmount = formData.line_items.reduce((sum, item) => 
        sum + (item.taxable === true ? item.total : 0), 0);
      
      const nonTaxableAmount = formData.line_items.reduce((sum, item) => 
        sum + (item.taxable === false ? item.total : 0), 0);
      
      // Emergency adjustment based on non-taxable items
      const emergencyAdjustment = isEmergency ? nonTaxableAmount * (emergencyMultiplier - 1) : 0;
      const adjustedSubtotal = subtotal + emergencyAdjustment;
      
      // No tax calculations since we removed tax rate
      const taxAmount = 0;
      const totalAmount = adjustedSubtotal;

      const quoteData = {
        quote_number: quoteNumber,
        customer_id: formData.customer_id,
        customer_name: formData.customer_name,
        title: formData.title,
        status: formData.status,
        valid_until: formData.valid_until,
        is_emergency: formData.is_emergency || false,
        estimated_start_date: formData.estimated_start_date,
        estimated_completion_date: formData.estimated_completion_date,
        line_items: formData.line_items as any,
        subtotal: adjustedSubtotal,
        tax_rate: 0, // Set to 0 since we removed tax rate
        tax_amount: 0, // Set to 0 since we removed tax calculations
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
      
      // Calculate totals with emergency multiplier
      const isEmergency = formData.is_emergency || false;
      
      // Get emergency multiplier from settings
      const { data: settingsData } = await supabase
        .from("settings")
        .select("service_settings")
        .eq("tenant_id", tenantId)
        .single();
      
      const emergencyMultiplier = (settingsData?.service_settings as any)?.emergency_rate_multiplier || 1.5;
      
      const subtotal = formData.line_items.reduce((sum, item) => sum + item.total, 0);
      
      // Calculate taxable and non-taxable amounts
      const taxableAmount = formData.line_items.reduce((sum, item) => 
        sum + (item.taxable === true ? item.total : 0), 0);
      
      const nonTaxableAmount = formData.line_items.reduce((sum, item) => 
        sum + (item.taxable === false ? item.total : 0), 0);
      
      // Emergency adjustment based on non-taxable items
      const emergencyAdjustment = isEmergency ? nonTaxableAmount * (emergencyMultiplier - 1) : 0;
      const adjustedSubtotal = subtotal + emergencyAdjustment;
      
      // No tax calculations since we removed tax rate
      const taxAmount = 0;
      const totalAmount = adjustedSubtotal;

      const quoteData = {
        customer_id: formData.customer_id,
        customer_name: formData.customer_name,
        title: formData.title,
        status: formData.status,
        valid_until: formData.valid_until,
        is_emergency: formData.is_emergency || false,
        estimated_start_date: formData.estimated_start_date,
        estimated_completion_date: formData.estimated_completion_date,
        line_items: formData.line_items as any,
        subtotal: adjustedSubtotal,
        tax_rate: 0, // Set to 0 since we removed tax rate  
        tax_amount: 0, // Set to 0 since we removed tax calculations
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

  // Send quote email mutation (improved)
  const sendQuoteEmailMutation = useMutation({
    mutationFn: async ({ quoteId, customerEmail, customerName }: { quoteId: string; customerEmail: string; customerName: string }) => {
      if (!tenantId) throw new Error("Authentication required");
      
      const response = await supabase.functions.invoke("send-quote-email", {
        body: {
          quoteId,
          customerEmail,
          customerName,
        },
      });

      if (response.error) {
        throw new Error(response.error.message || "Failed to send email");
      }

      return response.data;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["quotes"] });
      toast({
        title: "Quote sent successfully!",
        description: `Email sent to customer with quote link.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error sending quote",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Enhanced send quote email function that fetches customer email
  const sendQuoteWithCustomerEmail = async (quoteId: string, customerName: string, customerId: string) => {
    try {
      // Fetch customer email from database
      const { data: customer, error: customerError } = await supabase
        .from('customers')
        .select('email')
        .eq('id', customerId)
        .single();

      if (customerError || !customer?.email) {
        throw new Error('Customer email not found. Please update customer information first.');
      }

      // Send the email
      sendQuoteEmailMutation.mutate({
        quoteId,
        customerEmail: customer.email,
        customerName,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,          
        variant: "destructive",
      });
    }
  };

  // Share quote mutation - generates token via edge function
  const shareQuoteMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!tenantId) throw new Error("Authentication required");
      
      console.log("[shareQuoteMutation] Starting share process for quote:", id);
      
      // Get quote details first
      const { data: quote, error: fetchError } = await supabase
        .from("quotes")
        .select("share_token, customer_name")
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .single();

      if (fetchError) {
        console.error("[shareQuoteMutation] Error fetching quote:", fetchError);
        throw fetchError;
      }

      let shareToken = quote.share_token;
      let publicUrl = '';
      
      // If no share token exists, generate one via edge function
      if (!shareToken) {
        console.log("[shareQuoteMutation] No share token, generating via edge function...");
        
        const response = await supabase.functions.invoke("send-quote-email", {
          body: {
            quoteId: id,
            generateTokenOnly: true, // Flag to only generate token, not send email
          },
        });

        if (response.error) {
          console.error("[shareQuoteMutation] Error generating token:", response.error);
          throw new Error("Failed to generate share link: " + response.error.message);
        }

        shareToken = response.data?.shareToken;
        publicUrl = response.data?.publicUrl;
        
        if (!shareToken || !publicUrl) {
          throw new Error("Failed to generate share token");
        }
      } else {
        // Use existing token to create URL
        publicUrl = `${window.location.origin}/public-quote/${shareToken}`;
      }
      
      console.log("[shareQuoteMutation] Generated URL:", publicUrl);
      
      // Copy to clipboard
      await navigator.clipboard.writeText(publicUrl);
      
      return { publicUrl, customerName: quote.customer_name };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["quotes"] });
      toast({
        title: "Link copied to clipboard!",
        description: `Share it with ${result.customerName}: ${result.publicUrl}`,
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
        scheduled_date: quote.estimated_start_date || format(new Date(), 'yyyy-MM-dd'),
        complete_date: quote.estimated_completion_date || null,
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
    sendQuoteEmail: sendQuoteWithCustomerEmail,
    convertToJob: convertToJobMutation.mutate,
    isCreating: createQuoteMutation.isPending,
    isUpdating: updateQuoteMutation.isPending,
    isDeleting: deleteQuoteMutation.isPending,
    isSharing: shareQuoteMutation.isPending,
    isSendingEmail: sendQuoteEmailMutation.isPending,
    isConverting: convertToJobMutation.isPending,
  };
};