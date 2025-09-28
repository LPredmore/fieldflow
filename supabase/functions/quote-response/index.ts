import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface QuoteResponseRequest {
  shareToken: string;
  responseType: 'accepted' | 'declined' | 'viewed';
  customerEmail?: string;
  customerComments?: string;
}

// Security helper function
async function checkRateLimit(identifier: string, endpoint: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('check_rate_limit', {
    _identifier: identifier,
    _endpoint: endpoint,
    _max_requests: 100, // 100 responses per hour (higher limit for public responses)
    _window_minutes: 60
  });
  
  if (error) {
    console.error('Rate limit check failed:', error);
    return true; // Allow on error to prevent blocking legitimate requests
  }
  
  return data;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Rate limiting check
    const clientIP = req.headers.get('x-forwarded-for') || 
                     req.headers.get('x-real-ip') || 
                     'unknown';
    
    const canProceed = await checkRateLimit(clientIP, 'quote-response');
    if (!canProceed) {
      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
        { status: 429, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const { shareToken, responseType, customerEmail, customerComments }: QuoteResponseRequest = await req.json();

    // Input validation
    if (!shareToken || !responseType) {
      return new Response(
        JSON.stringify({ error: 'Share token and response type are required' }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Find the quote by share token first to get quote ID for validation
    const { data: quote, error: quoteError } = await supabase
      .from('quotes')
      .select('id, status, customer_name')
      .eq('share_token', shareToken)
      .single();

    if (quoteError || !quote) {
      return new Response(
        JSON.stringify({ error: 'Quote not found or invalid token' }),
        {
          status: 404,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    // Use server-side validation function for enhanced security
    const { data: isValid, error: validationError } = await supabase.rpc('validate_quote_response_input', {
      _quote_id: quote.id,
      _response_type: responseType,
      _customer_email: customerEmail,
      _customer_comments: customerComments
    });

    if (validationError || !isValid) {
      return new Response(
        JSON.stringify({ error: 'Invalid input data' }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Get client IP and user agent for tracking  
    const userAgent = req.headers.get('user-agent') || 'unknown';

    // Quote was already validated above, so we can proceed

    // Record the response
    const { error: responseError } = await supabase
      .from('quote_responses')
      .insert({
        quote_id: quote.id,
        response_type: responseType,
        customer_email: customerEmail,
        customer_comments: customerComments,
        ip_address: clientIP,
        user_agent: userAgent
      });

    if (responseError) {
      console.error('Error recording quote response:', responseError);
      return new Response(
        JSON.stringify({ error: 'Failed to record response' }),
        {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    // Update quote status if it's an acceptance or decline
    if (responseType === 'accepted' || responseType === 'declined') {
      const { error: updateError } = await supabase
        .from('quotes')
        .update({ status: responseType })
        .eq('id', quote.id);

      if (updateError) {
        console.error('Error updating quote status:', updateError);
        return new Response(
          JSON.stringify({ error: 'Failed to update quote status' }),
          {
            status: 500,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          }
        );
      }
    }

    console.log(`Quote ${responseType} recorded for quote ID: ${quote.id}`);

    return new Response(JSON.stringify({ 
      success: true, 
      message: `Quote ${responseType} successfully recorded`,
      quoteId: quote.id,
      customerName: quote.customer_name
    }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });

  } catch (error: any) {
    console.error("Error in quote-response function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);