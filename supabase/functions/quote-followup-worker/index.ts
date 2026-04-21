// Daily worker. For each tenant, find sent quotes at day 3 and day 7 (since sent_date)
// that are still in 'sent' status, and dispatch follow-up SMS+email.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const FOLLOWUP_DAYS = [3, 7];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let totalSent = 0;
    let totalSkipped = 0;

    for (const days of FOLLOWUP_DAYS) {
      const target = new Date();
      target.setUTCDate(target.getUTCDate() - days);
      const dayStart = new Date(target);
      dayStart.setUTCHours(0, 0, 0, 0);
      const dayEnd = new Date(target);
      dayEnd.setUTCHours(23, 59, 59, 999);

      const { data: quotes } = await admin
        .from("quotes")
        .select("id, tenant_id, quote_number, customer_id, customer_name, total_amount, status, sent_date, share_token")
        .eq("status", "sent")
        .gte("sent_date", dayStart.toISOString())
        .lte("sent_date", dayEnd.toISOString());

      if (!quotes || quotes.length === 0) continue;

      for (const q of quotes) {
        const eventKey = `quote_followup:${q.id}:day${days}`;
        const { data: prior } = await admin
          .from("notification_dispatches")
          .select("id")
          .eq("tenant_id", q.tenant_id)
          .eq("event_key", eventKey)
          .limit(1);
        if (prior && prior.length > 0) {
          totalSkipped++;
          continue;
        }

        const [{ data: customer }, { data: settings }, { data: smsSettings }] = await Promise.all([
          admin.from("customers").select("phone_e164, email").eq("id", q.customer_id).maybeSingle(),
          admin.from("settings").select("business_name, notification_settings").eq("tenant_id", q.tenant_id).maybeSingle(),
          admin.from("sms_settings").select("enabled, notification_events").eq("tenant_id", q.tenant_id).maybeSingle(),
        ]);

        const businessName = settings?.business_name || "your service provider";
        const notif = (settings?.notification_settings || {}) as Record<string, boolean>;
        const smsEvents = (smsSettings?.notification_events || {}) as Record<string, boolean>;

        const smsOn = smsSettings?.enabled && smsEvents.quote_followup === true && customer?.phone_e164;
        const emailOn = notif.quote_followup_email !== false && customer?.email;
        if (!smsOn && !emailOn) {
          totalSkipped++;
          continue;
        }

        const link = q.share_token
          ? `https://fieldflow.flo-pro.org/quote/${q.share_token}`
          : "";
        const total = `$${Number(q.total_amount).toFixed(2)}`;

        if (smsOn) {
          const body = `Just checking in — your ${businessName} quote ${q.quote_number} for ${total} is still available.${link ? ` View: ${link}` : ""} Reply STOP to opt out.`;
          const r = await admin.functions.invoke("send-sms", {
            body: {
              to: customer!.phone_e164,
              body,
              triggered_by: "quote_followup",
              related_entity_type: "quote",
              related_entity_id: q.id,
              bypass_business_hours: true,
            },
            headers: { Authorization: `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}` },
          });
          if (!r.error && (r.data as { ok?: boolean })?.ok) {
            await admin.from("notification_dispatches").insert({
              tenant_id: q.tenant_id,
              event_key: eventKey,
              channel: "sms",
            });
            totalSent++;
          }
        }
        if (emailOn) {
          const subject = `Following up on your quote ${q.quote_number}`;
          const html = `<p>Hi ${q.customer_name},</p><p>Just a friendly follow-up on the quote we sent you${days === 7 ? " a week ago" : " a few days ago"}.</p><p><b>Quote ${q.quote_number}</b> — Total: <b>${total}</b></p>${link ? `<p><a href="${link}">View your quote</a></p>` : ""}<p>Let us know if you have any questions.</p><p>— ${businessName}</p>`;
          const r = await admin.functions.invoke("send-notification-email", {
            body: {
              to: customer!.email,
              subject,
              html,
              triggered_by: "quote_followup",
              related_entity_type: "quote",
              related_entity_id: q.id,
              tenant_id: q.tenant_id,
            },
          });
          if (!r.error && (r.data as { ok?: boolean })?.ok) {
            await admin.from("notification_dispatches").insert({
              tenant_id: q.tenant_id,
              event_key: eventKey,
              channel: "email",
            });
            totalSent++;
          }
        }
      }
    }

    return json({ ok: true, sent: totalSent, skipped: totalSkipped });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "unknown";
    console.error("quote-followup-worker error:", msg);
    return json({ ok: false, error: "internal", message: msg }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
