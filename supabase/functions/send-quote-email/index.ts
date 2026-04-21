import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { Resend } from "https://esm.sh/resend@4.0.0";
import { resolveEmailSender, logEmailMessage } from "../_shared/email-sender.ts";
import { resolvePortalBaseUrl } from "../_shared/portal-url.ts";

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
  generateTokenOnly?: boolean;
}

async function checkRateLimit(identifier: string, endpoint: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('check_rate_limit', {
    _identifier: identifier,
    _endpoint: endpoint,
    _max_requests: 50,
    _window_minutes: 60
  });
  if (error) {
    console.error('Rate limit check failed:', error);
    return true;
  }
  return data;
}

async function logSharedAccess(contentType: string, contentId: string, shareToken: string, request: Request) {
  await supabase.from('shared_content_access_logs').insert({
    content_type: contentType,
    content_id: contentId,
    share_token: shareToken,
    ip_address: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
    user_agent: request.headers.get('user-agent') || 'unknown',
    referrer: request.headers.get('referer') || 'direct',
  });
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const clientIP = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
    const canProceed = await checkRateLimit(clientIP, 'send-quote-email');
    if (!canProceed) {
      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
        { status: 429, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const { quoteId, customerEmail, customerName, generateTokenOnly }: SendQuoteEmailRequest = await req.json();
    console.log("[send-quote-email] Request received:", { quoteId, generateTokenOnly, hasEmail: !!customerEmail });

    const { data: existingQuote, error: fetchError } = await supabase
      .from('quotes')
      .select('share_token, quote_number, title, total_amount, tenant_id')
      .eq('id', quoteId)
      .single();

    if (fetchError) {
      console.error("[send-quote-email] Error fetching quote:", fetchError);
      throw new Error(`Failed to fetch quote: ${fetchError.message}`);
    }

    let shareToken = existingQuote.share_token;
    if (!shareToken) {
      const { data: tokenData, error: tokenError } = await supabase.rpc('generate_quote_share_token');
      if (tokenError) throw new Error(`Failed to generate share token: ${tokenError.message}`);
      shareToken = tokenData;

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);

      const { error: updateError } = await supabase
        .from('quotes')
        .update({
          share_token: shareToken,
          share_token_expires_at: expiresAt.toISOString(),
          ...(generateTokenOnly ? {} : {
            status: 'sent',
            sent_date: new Date().toISOString()
          })
        })
        .eq('id', quoteId);
      if (updateError) throw new Error(`Failed to update quote: ${updateError.message}`);
    }

    const portalBase = await resolvePortalBaseUrl(supabase, existingQuote.tenant_id);
    const publicUrl = `${portalBase}/public-quote/${shareToken}`;
    console.log("[send-quote-email] Public URL:", publicUrl);

    if (generateTokenOnly) {
      await logSharedAccess('quote', quoteId, shareToken, req);
      return new Response(JSON.stringify({ success: true, shareToken, publicUrl }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (!customerEmail || !customerName) {
      throw new Error("Customer email and name are required for sending emails");
    }

    const { data: settings } = await supabase
      .from('settings')
      .select('business_name, business_email, business_phone')
      .eq('tenant_id', existingQuote.tenant_id)
      .maybeSingle();

    const businessName = settings?.business_name || 'Your Business';
    const sender = await resolveEmailSender(supabase, existingQuote.tenant_id);
    const subject = `Quote ${existingQuote.quote_number} - ${existingQuote.title}`;
    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #333; border-bottom: 2px solid #0066cc; padding-bottom: 10px;">${businessName}</h1>
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
            <a href="${publicUrl}" style="background-color: #0066cc; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">View Quote &amp; Respond</a>
          </div>
          <p>Please click the button above to view the complete quote details and let us know if you'd like to accept or decline this quote.</p>
          <p>If you have any questions, please don't hesitate to contact us.</p>
          <div style="border-top: 1px solid #ddd; padding-top: 20px; margin-top: 30px; color: #666;">
            <p><strong>${businessName}</strong></p>
            ${settings?.business_email ? `<p>Email: ${settings.business_email}</p>` : ''}
            ${settings?.business_phone ? `<p>Phone: ${settings.business_phone}</p>` : ''}
          </div>
        </div>`;

    console.log("[send-quote-email] Sending to:", customerEmail, "from:", sender.fromAddress);
    const emailResponse = await resend.emails.send({
      from: sender.from,
      reply_to: sender.replyTo,
      to: [customerEmail],
      subject,
      html,
    });

    // Always log to email_messages — success and failure
    await logEmailMessage(supabase, {
      tenantId: existingQuote.tenant_id,
      to: customerEmail,
      fromAddress: sender.fromAddress,
      subject,
      html,
      resendId: emailResponse.error ? null : (emailResponse.data?.id ?? null),
      status: emailResponse.error ? "failed" : "sent",
      errorCode: emailResponse.error
        ? String(emailResponse.error.name ?? emailResponse.error.message ?? "resend_error")
        : null,
      triggeredBy: "quote_sent",
      relatedEntityType: "quote",
      relatedEntityId: quoteId,
    });

    if (emailResponse.error) {
      console.error("[send-quote-email] Resend error:", emailResponse.error);
      throw new Error(`Failed to send email: ${emailResponse.error.message || 'Unknown Resend error'}`);
    }

    return new Response(JSON.stringify({ success: true, shareToken, publicUrl }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in send-quote-email function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
