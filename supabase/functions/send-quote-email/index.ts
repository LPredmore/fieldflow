import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "npm:resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SendQuoteEmailRequest {
  quoteId: string;
  customerEmail?: string;
  customerName?: string;
  generateTokenOnly?: boolean; // Flag for share link generation only
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { quoteId, customerEmail, customerName, generateTokenOnly }: SendQuoteEmailRequest = await req.json();
    
    console.log("[send-quote-email] Request received:", { quoteId, generateTokenOnly, hasEmail: !!customerEmail });

    // First check if quote already has a share token
    const { data: existingQuote, error: fetchError } = await supabase
      .from('quotes')
      .select('share_token, quote_number, title, total_amount')
      .eq('id', quoteId)
      .single();

    if (fetchError) {
      console.error("[send-quote-email] Error fetching quote:", fetchError);
      throw new Error(`Failed to fetch quote: ${fetchError.message}`);
    }

    let shareToken = existingQuote.share_token;
    
    // Generate new token if it doesn't exist
    if (!shareToken) {
      console.log("[send-quote-email] Generating new share token...");
      const { data: tokenData, error: tokenError } = await supabase.rpc('generate_quote_share_token');
      
      if (tokenError) {
        console.error("[send-quote-email] Error generating token:", tokenError);
        throw new Error(`Failed to generate share token: ${tokenError.message}`);
      }
      
      shareToken = tokenData;
      console.log("[send-quote-email] Generated token:", shareToken ? "✓" : "✗");

      // Update quote with share token
      const { error: updateError } = await supabase
        .from('quotes')
        .update({ 
          share_token: shareToken,
          ...(generateTokenOnly ? {} : {
            status: 'sent',
            sent_date: new Date().toISOString()
          })
        })
        .eq('id', quoteId);

      if (updateError) {
        console.error("[send-quote-email] Error updating quote:", updateError);
        throw new Error(`Failed to update quote: ${updateError.message}`);
      }
    }

    // Use the correct domain for public URL
    const publicUrl = `https://fieldflow.flo-pro.org/public-quote/${shareToken}`;
    console.log("[send-quote-email] Generated public URL:", publicUrl);

    // If only generating token for share link, return early
    if (generateTokenOnly) {
      return new Response(JSON.stringify({ 
        success: true, 
        shareToken,
        publicUrl 
      }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Validate email parameters for actual email sending
    if (!customerEmail || !customerName) {
      throw new Error("Customer email and name are required for sending emails");
    }

    // Get business settings for branding
    const { data: settings } = await supabase
      .from('settings')
      .select('business_name, business_email, business_phone')
      .single();

    const businessName = settings?.business_name || 'Your Business';

    console.log("[send-quote-email] Sending email to:", customerEmail);

    // Send email
    const emailResponse = await resend.emails.send({
      from: `${businessName} <onboarding@resend.dev>`,
      to: [customerEmail],
      subject: `Quote ${existingQuote.quote_number} - ${existingQuote.title}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #333; border-bottom: 2px solid #0066cc; padding-bottom: 10px;">
            ${businessName}
          </h1>
          
          <h2 style="color: #0066cc;">Quote ${existingQuote.quote_number}</h2>
          
          <p>Dear ${customerName},</p>
          
          <p>We're pleased to provide you with a quote for <strong>${existingQuote.title}</strong>.</p>
          
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #333;">Quote Summary</h3>
            <p><strong>Quote Number:</strong> ${existingQuote.quote_number}</p>
            <p><strong>Service:</strong> ${existingQuote.title}</p>
            <p><strong>Total Amount:</strong> $${existingQuote.total_amount}</p>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${publicUrl}" 
               style="background-color: #0066cc; color: white; padding: 12px 24px; 
                      text-decoration: none; border-radius: 6px; font-weight: bold;">
              View Quote & Respond
            </a>
          </div>
          
          <p>Please click the button above to view the complete quote details and let us know if you'd like to accept or decline this quote.</p>
          
          <p>If you have any questions, please don't hesitate to contact us.</p>
          
          <div style="border-top: 1px solid #ddd; padding-top: 20px; margin-top: 30px; color: #666;">
            <p><strong>${businessName}</strong></p>
            ${settings?.business_email ? `<p>Email: ${settings.business_email}</p>` : ''}
            ${settings?.business_phone ? `<p>Phone: ${settings.business_phone}</p>` : ''}
          </div>
        </div>
      `,
    });

    console.log("[send-quote-email] Email response:", emailResponse);
    
    if (emailResponse.error) {
      console.error("[send-quote-email] Resend error:", emailResponse.error);
      throw new Error(`Failed to send email: ${emailResponse.error.message || 'Unknown Resend error'}`);
    }

    return new Response(JSON.stringify({ 
      success: true, 
      shareToken,
      publicUrl 
    }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });

  } catch (error: any) {
    console.error("Error in send-quote-email function:", error);
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