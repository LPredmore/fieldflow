import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import Stripe from "https://esm.sh/stripe@17.5.0?target=deno";
import { z } from "https://esm.sh/zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: "2024-12-18.acacia",
  httpClient: Stripe.createFetchHttpClient(),
});

const BodySchema = z.object({
  share_token: z.string().min(10).max(128),
  return_origin: z.string().url().optional(),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: parsed.error.flatten().fieldErrors }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }
    const { share_token, return_origin } = parsed.data;

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Rate limit by IP + token
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
    const { data: rl } = await admin.rpc("enhanced_rate_limit_check", {
      _identifier: `${ip}:${share_token}`,
      _endpoint: "invoice_checkout",
      _max_requests: 10,
      _window_minutes: 60,
    });
    if (rl && (rl as any).allowed === false) {
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded" }),
        {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Look up invoice via public RPC
    const { data: rows, error: rpcErr } = await admin.rpc(
      "get_public_invoice_by_token",
      { token_param: share_token }
    );
    if (rpcErr || !rows || rows.length === 0) {
      return new Response(
        JSON.stringify({ error: "Invoice not found or expired" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }
    const invoice = rows[0];

    if (!invoice.stripe_enabled) {
      return new Response(
        JSON.stringify({ error: "Stripe is not enabled for this invoice" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (invoice.status === "paid") {
      return new Response(
        JSON.stringify({ error: "Invoice already paid" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Look up tenant's connected stripe account
    const { data: acct } = await admin
      .from("stripe_connected_accounts")
      .select("stripe_account_id, charges_enabled, disconnected_at")
      .eq("tenant_id", invoice.tenant_id)
      .is("disconnected_at", null)
      .maybeSingle();

    if (!acct || !acct.charges_enabled) {
      return new Response(
        JSON.stringify({
          error: "Stripe account not ready to accept charges",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const origin =
      return_origin ?? "https://fieldflow-customer-connect.lovable.app";
    const successUrl = `${origin}/invoice/${share_token}?paid=1`;
    const cancelUrl = `${origin}/invoice/${share_token}`;

    const amountCents = Math.round(Number(invoice.total_amount) * 100);

    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        payment_method_types: ["card", "us_bank_account"],
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: `Invoice ${invoice.invoice_number}`,
                description: `Payment for ${invoice.customer_name}`,
              },
              unit_amount: amountCents,
            },
            quantity: 1,
          },
        ],
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          invoice_id: invoice.id,
          tenant_id: invoice.tenant_id,
          share_token,
        },
        payment_intent_data: {
          metadata: {
            invoice_id: invoice.id,
            tenant_id: invoice.tenant_id,
            share_token,
          },
        },
      },
      { stripeAccount: acct.stripe_account_id }
    );

    // Best-effort: store session id on invoice
    await admin
      .from("invoices")
      .update({ stripe_checkout_session_id: session.id })
      .eq("id", invoice.id);

    return new Response(JSON.stringify({ url: session.url }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("create-invoice-checkout error:", err);
    return new Response(JSON.stringify({ error: err.message ?? "Error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
