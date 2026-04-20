import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import Stripe from "https://esm.sh/stripe@17.5.0?target=deno";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY")!;
const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: "2024-12-18.acacia",
  httpClient: Stripe.createFetchHttpClient(),
});

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function markInvoicePaid(
  invoiceId: string,
  paymentIntentId: string | null,
  paymentMethod: string
) {
  const { error } = await admin
    .from("invoices")
    .update({
      status: "paid",
      paid_date: new Date().toISOString(),
      payment_method_used: paymentMethod,
      stripe_payment_intent_id: paymentIntentId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", invoiceId);
  if (error) console.error("Failed to mark invoice paid:", error);
  else console.log(`Invoice ${invoiceId} marked paid via ${paymentMethod}`);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return new Response("Missing stripe-signature", { status: 400 });
  }
  if (!STRIPE_WEBHOOK_SECRET) {
    console.error("STRIPE_WEBHOOK_SECRET not configured");
    return new Response("Webhook secret not configured", { status: 500 });
  }

  let event: Stripe.Event;
  try {
    const rawBody = await req.text();
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      sig,
      STRIPE_WEBHOOK_SECRET
    );
  } catch (err: any) {
    console.error("Signature verification failed:", err.message);
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }

  console.log(`Stripe event: ${event.type}`);

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const invoiceId = session.metadata?.invoice_id;
      const paymentIntentId =
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : session.payment_intent?.id ?? null;
      if (invoiceId) {
        // Determine method from payment_intent
        let method = "stripe_card";
        if (paymentIntentId) {
          try {
            const pi = await stripe.paymentIntents.retrieve(
              paymentIntentId,
              { expand: ["payment_method"] },
              { stripeAccount: event.account }
            );
            const pmType = (pi.payment_method as any)?.type;
            if (pmType === "us_bank_account") method = "stripe_ach";
            else if (pmType === "card") method = "stripe_card";
          } catch (e) {
            console.warn("Could not retrieve PI:", e);
          }
        }
        await markInvoicePaid(invoiceId, paymentIntentId, method);
      }
    } else if (event.type === "payment_intent.succeeded") {
      const pi = event.data.object as Stripe.PaymentIntent;
      const invoiceId = pi.metadata?.invoice_id;
      if (invoiceId) {
        const pmType =
          typeof pi.payment_method !== "string"
            ? (pi.payment_method as any)?.type
            : null;
        const method = pmType === "us_bank_account" ? "stripe_ach" : "stripe_card";
        await markInvoicePaid(invoiceId, pi.id, method);
      }
    }
  } catch (err: any) {
    console.error("Webhook handler error:", err);
    // Still 200 so Stripe doesn't retry forever; we logged it
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
