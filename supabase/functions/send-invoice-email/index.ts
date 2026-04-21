import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { Resend } from "https://esm.sh/resend@4.0.0";
import { resolveEmailSender, logEmailMessage } from "../_shared/email-sender.ts";
import { resolvePortalBaseUrl } from "../_shared/portal-url.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SendInvoiceEmailRequest {
  invoiceId: string;
  customerEmail?: string;
  customerName?: string;
  generateTokenOnly?: boolean;
}

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

const resend = new Resend(Deno.env.get('RESEND_API_KEY'));

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

serve(async (req) => {
  console.log('send-invoice-email function called');
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const clientIP = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
    const canProceed = await checkRateLimit(clientIP, 'send-invoice-email');
    if (!canProceed) {
      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { invoiceId, customerEmail, customerName, generateTokenOnly }: SendInvoiceEmailRequest = await req.json();

    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', invoiceId)
      .single();

    if (invoiceError || !invoice) {
      console.error('Invoice fetch error:', invoiceError);
      return new Response(
        JSON.stringify({ error: 'Invoice not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let shareToken = invoice.share_token;
    if (!shareToken) {
      shareToken = crypto.randomUUID().replace(/-/g, '');
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);
      const { error: updateError } = await supabase
        .from('invoices')
        .update({ share_token: shareToken, share_token_expires_at: expiresAt.toISOString() })
        .eq('id', invoiceId);
      if (updateError) {
        console.error('Error updating invoice with share token:', updateError);
        return new Response(
          JSON.stringify({ error: 'Failed to generate share token' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    const portalBase = await resolvePortalBaseUrl(supabase, invoice.tenant_id);
    const publicUrl = `${portalBase}/public-invoice/${shareToken}`;

    if (generateTokenOnly) {
      await logSharedAccess('invoice', invoiceId, shareToken, req);
      return new Response(
        JSON.stringify({ shareToken, publicUrl }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: settings } = await supabase
      .from('settings')
      .select('business_name, business_email, business_phone, logo_url, payment_settings')
      .eq('tenant_id', invoice.tenant_id)
      .maybeSingle();

    const businessName = settings?.business_name || 'Your Business';

    const emailHtml = `
      <!DOCTYPE html>
      <html><head><meta charset="utf-8"><title>Invoice ${invoice.invoice_number}</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #eee; padding-bottom: 20px; }
          .logo { max-height: 60px; margin-bottom: 10px; }
          .invoice-details { background: #f9f9f9; padding: 20px; border-radius: 8px; margin: 20px 0; }
          .invoice-number { font-size: 24px; font-weight: bold; color: #2563eb; }
          .amount { font-size: 28px; font-weight: bold; color: #059669; }
          .cta-button { display: inline-block; background: #2563eb; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 20px 0; }
          .payment-info { background: #f0f9ff; padding: 15px; border-radius: 8px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 14px; color: #666; }
        </style></head>
        <body><div class="container">
          <div class="header">
            ${settings?.logo_url ? `<img src="${settings.logo_url}" alt="${businessName}" class="logo">` : ''}
            <h1>${businessName}</h1>
            <h2>Invoice Ready for Payment</h2>
          </div>
          <p>Hello ${customerName || invoice.customer_name},</p>
          <p>Your invoice is ready for payment. Please review the details below:</p>
          <div class="invoice-details">
            <div class="invoice-number">Invoice #${invoice.invoice_number}</div>
            <p><strong>Issue Date:</strong> ${new Date(invoice.issue_date).toLocaleDateString()}</p>
            <p><strong>Due Date:</strong> ${new Date(invoice.due_date).toLocaleDateString()}</p>
            <p><strong>Amount Due:</strong> <span class="amount">$${invoice.total_amount.toFixed(2)}</span></p>
          </div>
          <div style="text-align: center;"><a href="${publicUrl}" class="cta-button">View Invoice &amp; Pay Online</a></div>
          ${settings?.payment_settings ? `
            <div class="payment-info">
              <h3>Payment Options:</h3>
              ${settings.payment_settings.paypal_me_link ? `<p><strong>PayPal:</strong> <a href="${settings.payment_settings.paypal_me_link}">Pay with PayPal</a></p>` : ''}
              ${settings.payment_settings.venmo_handle ? `<p><strong>Venmo:</strong> @${settings.payment_settings.venmo_handle}</p>` : ''}
              ${settings.payment_settings.payment_instructions ? `<p><strong>Other Instructions:</strong><br>${settings.payment_settings.payment_instructions.replace(/\n/g, '<br>')}</p>` : ''}
            </div>` : ''}
          <p>If you have any questions about this invoice, please don't hesitate to contact us.</p>
          <div class="footer">
            <p>${businessName}<br>
            ${settings?.business_phone ? `Phone: ${settings.business_phone}<br>` : ''}
            ${settings?.business_email ? `Email: ${settings.business_email}` : ''}</p>
            <p><small>This is an automated message. Please do not reply to this email.</small></p>
          </div>
        </div></body></html>`;

    if (!customerEmail) {
      return new Response(
        JSON.stringify({ error: 'Customer email is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const sender = await resolveEmailSender(supabase, invoice.tenant_id);
    const subject = `Invoice ${invoice.invoice_number} - ${businessName}`;

    const emailResponse = await resend.emails.send({
      from: sender.from,
      reply_to: sender.replyTo,
      to: [customerEmail],
      subject,
      html: emailHtml,
    });

    // Audit-log every send (success or failure)
    await logEmailMessage(supabase, {
      tenantId: invoice.tenant_id,
      to: customerEmail,
      fromAddress: sender.fromAddress,
      subject,
      html: emailHtml,
      resendId: emailResponse.error ? null : (emailResponse.data?.id ?? null),
      status: emailResponse.error ? "failed" : "sent",
      errorCode: emailResponse.error
        ? String(emailResponse.error.name ?? emailResponse.error.message ?? "resend_error")
        : null,
      triggeredBy: "invoice_sent",
      relatedEntityType: "invoice",
      relatedEntityId: invoiceId,
    });

    if (invoice.status === 'draft') {
      await supabase
        .from('invoices')
        .update({ status: 'sent', sent_date: new Date().toISOString() })
        .eq('id', invoiceId);
    }

    return new Response(
      JSON.stringify({ shareToken, publicUrl, emailResponse }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error in send-invoice-email function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
