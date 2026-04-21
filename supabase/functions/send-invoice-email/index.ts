import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { resolveEmailSender } from "../_shared/email-sender.ts";
import { resolvePortalBaseUrl } from "../_shared/portal-url.ts";
import { dispatchNotification } from "../_shared/notification-dispatcher.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SendInvoiceEmailRequest {
  invoiceId: string;
  customerEmail?: string;
  customerName?: string;
  generateTokenOnly?: boolean;
  /**
   * When true, bypasses the (tenant_id, event_key, channel) idempotency
   * ledger so the user can explicitly resend the same invoice. The frontend
   * "Resend" button sets this; first-time clicks do not.
   */
  forceResend?: boolean;
}

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

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

// Minimal HTML escape — prevents customer_name / business fields from breaking
// the template or smuggling markup into the email body.
function escapeHtml(input: unknown): string {
  if (input === null || input === undefined) return '';
  return String(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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

    const { invoiceId, customerEmail, customerName, generateTokenOnly, forceResend }: SendInvoiceEmailRequest = await req.json();

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

    if (!customerEmail) {
      return new Response(
        JSON.stringify({ error: 'Customer email is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: settings } = await supabase
      .from('settings')
      .select('business_name, business_email, business_phone, logo_url, payment_settings')
      .eq('tenant_id', invoice.tenant_id)
      .maybeSingle();

    const businessName = settings?.business_name || 'Your Business';
    const safeName = escapeHtml(customerName || invoice.customer_name);
    const safeBusiness = escapeHtml(businessName);
    const safeInvoiceNumber = escapeHtml(invoice.invoice_number);
    const paymentSettings: any = settings?.payment_settings ?? null;

    const emailHtml = `
      <!DOCTYPE html>
      <html><head><meta charset="utf-8"><title>Invoice ${safeInvoiceNumber}</title>
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
            ${settings?.logo_url ? `<img src="${escapeHtml(settings.logo_url)}" alt="${safeBusiness}" class="logo">` : ''}
            <h1>${safeBusiness}</h1>
            <h2>Invoice Ready for Payment</h2>
          </div>
          <p>Hello ${safeName},</p>
          <p>Your invoice is ready for payment. Please review the details below:</p>
          <div class="invoice-details">
            <div class="invoice-number">Invoice #${safeInvoiceNumber}</div>
            <p><strong>Issue Date:</strong> ${escapeHtml(new Date(invoice.issue_date).toLocaleDateString())}</p>
            <p><strong>Due Date:</strong> ${escapeHtml(new Date(invoice.due_date).toLocaleDateString())}</p>
            <p><strong>Amount Due:</strong> <span class="amount">$${Number(invoice.total_amount).toFixed(2)}</span></p>
          </div>
          <div style="text-align: center;"><a href="${escapeHtml(publicUrl)}" class="cta-button">View Invoice &amp; Pay Online</a></div>
          ${paymentSettings ? `
            <div class="payment-info">
              <h3>Payment Options:</h3>
              ${paymentSettings.paypal_me_link ? `<p><strong>PayPal:</strong> <a href="${escapeHtml(paymentSettings.paypal_me_link)}">Pay with PayPal</a></p>` : ''}
              ${paymentSettings.venmo_handle ? `<p><strong>Venmo:</strong> @${escapeHtml(paymentSettings.venmo_handle)}</p>` : ''}
              ${paymentSettings.payment_instructions ? `<p><strong>Other Instructions:</strong><br>${escapeHtml(paymentSettings.payment_instructions).replace(/\n/g, '<br>')}</p>` : ''}
            </div>` : ''}
          <p>If you have any questions about this invoice, please don't hesitate to contact us.</p>
          <div class="footer">
            <p>${safeBusiness}<br>
            ${settings?.business_phone ? `Phone: ${escapeHtml(settings.business_phone)}<br>` : ''}
            ${settings?.business_email ? `Email: ${escapeHtml(settings.business_email)}` : ''}</p>
            <p><small>This is an automated message. Please do not reply to this email.</small></p>
          </div>
        </div></body></html>`;

    const sender = await resolveEmailSender(supabase, invoice.tenant_id);
    const subject = `Invoice ${invoice.invoice_number} - ${businessName}`;

    // Route through the centralized dispatcher so per-channel idempotency
    // (preventing accidental double-sends from rapid clicks), opt-out, and
    // logging are enforced uniformly with all other notifications.
    // forceResend → caller-controlled override that allows an explicit resend
    // by suffixing the event key with a timestamp (cron/Stripe convention).
    const eventKey = forceResend
      ? `invoice_sent:${invoiceId}:resend:${Date.now()}`
      : `invoice_sent:${invoiceId}`;

    const result = await dispatchNotification(supabase, {
      tenantId: invoice.tenant_id,
      eventKey,
      email: {
        to: customerEmail,
        subject,
        html: emailHtml,
        triggeredBy: "invoice_sent",
        relatedEntityType: "invoice",
        relatedEntityId: invoiceId,
        replyTo: sender.replyTo,
      },
    });

    const emailResult = result.email;
    const wasSent = emailResult?.status === "sent";

    // Side effect: only stamp status='sent' on the *first* successful dispatch.
    // Resends should not re-toggle a draft that has already been sent.
    if (wasSent && invoice.status === 'draft') {
      await supabase
        .from('invoices')
        .update({ status: 'sent', sent_date: new Date().toISOString() })
        .eq('id', invoiceId);
    }

    return new Response(
      JSON.stringify({
        success: wasSent,
        shareToken,
        publicUrl,
        email: emailResult,
      }),
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
