// Daily worker.
// 1. Flips invoices to 'overdue' when due_date < today AND status='sent'.
// 2. Sends overdue nudges on day 1, 7, 14, 30 past due (SMS + email per tenant settings).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const NUDGE_DAYS = [1, 7, 14, 30];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const todayStr = today.toISOString().slice(0, 10);

    // Step 1: flip past-due 'sent' invoices to 'overdue'
    const { data: flipped } = await admin
      .from("invoices")
      .update({ status: "overdue" })
      .lt("due_date", todayStr)
      .eq("status", "sent")
      .select("id");

    let totalSent = 0;

    // Step 2: send nudges
    for (const days of NUDGE_DAYS) {
      const target = new Date(today.getTime() - days * 24 * 60 * 60 * 1000);
      const targetStr = target.toISOString().slice(0, 10);

      const { data: invoices } = await admin
        .from("invoices")
        .select("id, tenant_id, invoice_number, customer_id, customer_name, total_amount, due_date, status, share_token")
        .eq("status", "overdue")
        .eq("due_date", targetStr);

      if (!invoices || invoices.length === 0) continue;

      for (const inv of invoices) {
        const eventKey = `invoice_overdue:${inv.id}:day${days}`;
        const { data: prior } = await admin
          .from("notification_dispatches")
          .select("id")
          .eq("tenant_id", inv.tenant_id)
          .eq("event_key", eventKey)
          .limit(1);
        if (prior && prior.length > 0) continue;

        const [{ data: customer }, { data: settings }, { data: smsSettings }] = await Promise.all([
          admin.from("customers").select("phone_e164, email").eq("id", inv.customer_id).maybeSingle(),
          admin.from("settings").select("business_name, notification_settings").eq("tenant_id", inv.tenant_id).maybeSingle(),
          admin.from("sms_settings").select("enabled, notification_events").eq("tenant_id", inv.tenant_id).maybeSingle(),
        ]);

        const businessName = settings?.business_name || "Your service provider";
        const notif = (settings?.notification_settings || {}) as Record<string, boolean>;
        const smsEvents = (smsSettings?.notification_events || {}) as Record<string, boolean>;
        const smsOn = smsSettings?.enabled && smsEvents.invoice_overdue !== false && customer?.phone_e164;
        const emailOn = notif.invoice_overdue_email !== false && customer?.email;
        if (!smsOn && !emailOn) continue;

        const link = inv.share_token ? `https://fieldflow.flo-pro.org/invoice/${inv.share_token}` : "";
        const total = `$${Number(inv.total_amount).toFixed(2)}`;
        const dayLabel =
          days === 1 ? "1 day" : days === 7 ? "1 week" : `${days} days`;

        if (smsOn) {
          const body = `Reminder: invoice ${inv.invoice_number} for ${total} from ${businessName} is now ${dayLabel} past due.${link ? ` Pay here: ${link}` : ""} Reply STOP to opt out.`;
          const r = await admin.functions.invoke("send-sms", {
            body: {
              to: customer!.phone_e164,
              body,
              triggered_by: "invoice_overdue",
              related_entity_type: "invoice",
              related_entity_id: inv.id,
              bypass_business_hours: true,
            },
            headers: { Authorization: `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}` },
          });
          if (!r.error && (r.data as { ok?: boolean })?.ok) {
            await admin.from("notification_dispatches").insert({
              tenant_id: inv.tenant_id,
              event_key: eventKey,
              channel: "sms",
            });
            totalSent++;
          }
        }
        if (emailOn) {
          const subject = `Invoice ${inv.invoice_number} is ${dayLabel} past due`;
          const html = `<p>Hi ${inv.customer_name},</p><p>This is a friendly reminder that invoice <b>${inv.invoice_number}</b> for <b>${total}</b> is now <b>${dayLabel} past due</b>.</p>${link ? `<p><a href="${link}">View and pay your invoice</a></p>` : ""}<p>Please get in touch if you have any questions.</p><p>— ${businessName}</p>`;
          const r = await admin.functions.invoke("send-notification-email", {
            body: {
              to: customer!.email,
              subject,
              html,
              triggered_by: "invoice_overdue",
              related_entity_type: "invoice",
              related_entity_id: inv.id,
              tenant_id: inv.tenant_id,
            },
          });
          if (!r.error && (r.data as { ok?: boolean })?.ok) {
            await admin.from("notification_dispatches").insert({
              tenant_id: inv.tenant_id,
              event_key: eventKey,
              channel: "email",
            });
            totalSent++;
          }
        }
      }
    }

    return json({ ok: true, flipped: flipped?.length ?? 0, sent: totalSent });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "unknown";
    console.error("invoice-overdue-worker error:", msg);
    return json({ ok: false, error: "internal", message: msg }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
