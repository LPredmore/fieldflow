import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.3";
import { Resend } from "npm:resend@2.0.0";

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

serve(async (req) => {
  console.log('send-invoice-email function called');

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { invoiceId, customerEmail, customerName, generateTokenOnly }: SendInvoiceEmailRequest = await req.json();
    console.log('Processing invoice email request:', { invoiceId, customerEmail, generateTokenOnly });

    // Fetch invoice details
    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', invoiceId)
      .single();

    if (invoiceError || !invoice) {
      console.error('Invoice not found:', invoiceError);
      return new Response(
        JSON.stringify({ error: 'Invoice not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate share token if it doesn't exist
    let shareToken = invoice.share_token;
    if (!shareToken) {
      shareToken = crypto.randomUUID().replace(/-/g, '');
      
      const { error: updateError } = await supabase
        .from('invoices')
        .update({ share_token: shareToken })
        .eq('id', invoiceId);

      if (updateError) {
        console.error('Error updating invoice with share token:', updateError);
        return new Response(
          JSON.stringify({ error: 'Failed to generate share token' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    const publicUrl = `${Deno.env.get('SUPABASE_URL')?.replace('https://', 'https://').replace('.supabase.co', '.lovable.app')}/public-invoice/${shareToken}`;
    
    console.log('Generated public URL:', publicUrl);

    // If only generating token, return early
    if (generateTokenOnly) {
      return new Response(
        JSON.stringify({ 
          shareToken,
          publicUrl 
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Fetch business settings for email template
    const { data: settings } = await supabase
      .from('settings')
      .select('business_name, business_email, business_phone, logo_url, payment_settings')
      .eq('tenant_id', invoice.tenant_id)
      .single();

    const businessName = settings?.business_name || 'Your Business';
    const businessEmail = settings?.business_email || 'noreply@yourbusiness.com';

    // Create email HTML
    const emailHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Invoice ${invoice.invoice_number}</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #eee; padding-bottom: 20px; }
            .logo { max-height: 60px; margin-bottom: 10px; }
            .invoice-details { background: #f9f9f9; padding: 20px; border-radius: 8px; margin: 20px 0; }
            .invoice-number { font-size: 24px; font-weight: bold; color: #2563eb; }
            .amount { font-size: 28px; font-weight: bold; color: #059669; }
            .cta-button { 
              display: inline-block; 
              background: #2563eb; 
              color: white; 
              padding: 15px 30px; 
              text-decoration: none; 
              border-radius: 8px; 
              font-weight: bold;
              margin: 20px 0;
            }
            .payment-info { background: #f0f9ff; padding: 15px; border-radius: 8px; margin: 20px 0; }
            .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 14px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
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
            
            <div style="text-align: center;">
              <a href="${publicUrl}" class="cta-button">View Invoice & Pay Online</a>
            </div>
            
            ${settings?.payment_settings ? `
              <div class="payment-info">
                <h3>Payment Options:</h3>
                ${settings.payment_settings.paypal_me_link ? `<p><strong>PayPal:</strong> <a href="${settings.payment_settings.paypal_me_link}">Pay with PayPal</a></p>` : ''}
                ${settings.payment_settings.venmo_handle ? `<p><strong>Venmo:</strong> @${settings.payment_settings.venmo_handle}</p>` : ''}
                ${settings.payment_settings.payment_instructions ? `<p><strong>Other Instructions:</strong><br>${settings.payment_settings.payment_instructions.replace(/\n/g, '<br>')}</p>` : ''}
              </div>
            ` : ''}
            
            <p>If you have any questions about this invoice, please don't hesitate to contact us.</p>
            
            <div class="footer">
              <p>
                ${businessName}<br>
                ${settings?.business_phone ? `Phone: ${settings.business_phone}<br>` : ''}
                ${settings?.business_email ? `Email: ${settings.business_email}` : ''}
              </p>
              <p><small>This is an automated message. Please do not reply to this email.</small></p>
            </div>
          </div>
        </body>
      </html>
    `;

    // Validate customer email is provided
    if (!customerEmail) {
      console.error('Customer email is required but not provided');
      return new Response(
        JSON.stringify({ error: 'Customer email is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Send email
    const emailResponse = await resend.emails.send({
      from: `${businessName} <${businessEmail}>`,
      to: [customerEmail],
      subject: `Invoice ${invoice.invoice_number} - ${businessName}`,
      html: emailHtml,
    });

    console.log('Email sent successfully:', emailResponse);

    // Update invoice status to 'sent' if it was 'draft'
    if (invoice.status === 'draft') {
      await supabase
        .from('invoices')
        .update({ 
          status: 'sent',
          sent_date: new Date().toISOString()
        })
        .eq('id', invoiceId);
    }

    return new Response(
      JSON.stringify({ 
        shareToken,
        publicUrl,
        emailResponse 
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error: any) {
    console.error('Error in send-invoice-email function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});