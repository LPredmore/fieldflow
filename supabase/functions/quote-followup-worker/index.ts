// Daily worker. For each tenant, find sent quotes that are now day 3 or day 7
// past their sent_date in the TENANT's local timezone (not UTC) and dispatch
// follow-up SMS+email through the shared dispatcher.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { dispatchNotification, ianaTimezone } from "../_shared/notification-dispatcher.ts";
import { resolvePortalBaseUrl } from "../_shared/portal-url.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const FOLLOWUP_DAYS = [3, 7];

function tenantLocalDate(tz: string | null | undefined, utc: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ianaTimezone(tz),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(utc);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let totalSent = 0;
    let totalSkipped = 0;

    // Pull a wide UTC window (last 10 days) once, then bucket per tenant locally
    const lookback = new Date();
    lookback.setUTCDate(lookback.getUTCDate() - 10);

    const { data: quotes } = await admin
      .from("quotes")
      .select("id, tenant_id, quote_number, customer_id, customer_name, total_amount, status, sent_date, share_token")
      .eq("status", "sent")
      .gte("sent_date", lookback.toISOString());

    if (!quotes || quotes.length === 0) {
      return json({ ok: true, sent: 0, skipped: 0 });
    }

    // Group by tenant for one settings lookup per tenant
    const byTenant = new Map<string, typeof quotes>();
    for (const q of quotes) {
      if (!byTenant.has(q.tenant_id)) byTenant.set(q.tenant_id, []);
      byTenant.get(q.tenant_id)!.push(q);
    }

    const now = new Date();

    for (const [tenantId, tenantQuotes] of byTenant) {
      const [{ data: settings }, { data: smsSettings }] = await Promise.all([
        admin.from("settings").select("business_name, notification_settings, time_zone").eq("tenant_id", tenantId).maybeSingle(),
        admin.from("sms_settings").select("enabled, notification_events").eq("tenant_id", tenantId).maybeSingle(),
      ]);

      const businessName = settings?.business_name || "your service provider";
      const notif = (settings?.notification_settings || {}) as Record<string, boolean>;
      const smsEvents = (smsSettings?.notification_events || {}) as Record<string, boolean>;
      const tz = settings?.time_zone;
      const portalBase = await resolvePortalBaseUrl(admin, tenantId);
      const todayLocal = tenantLocalDate(tz, now);

      for (const q of tenantQuotes) {
        if (!q.sent_date) continue;
        const sentLocal = tenantLocalDate(tz, new Date(q.sent_date));
        const sentDateObj = new Date(sentLocal + "T00:00:00Z");
        const todayObj = new Date(todayLocal + "T00:00:00Z");
        const daysSince = Math.round((todayObj.getTime() - sentDateObj.getTime()) / 86400000);
        if (!FOLLOWUP_DAYS.includes(daysSince)) continue;

        const { data: customer } = await admin
          .from("customers")
          .select("phone_e164, email")
          .eq("id", q.customer_id)
          .maybeSingle();

        const wantSms = smsSettings?.enabled
          && smsEvents.quote_followup === true
          && !!customer?.phone_e164;
        const wantEmail = notif.quote_followup_email !== false && !!customer?.email;
        if (!wantSms && !wantEmail) {
          totalSkipped++;
          continue;
        }

        const link = q.share_token ? `${portalBase}/public-quote/${q.share_token}` : "";
        const total = `$${Number(q.total_amount).toFixed(2)}`;

        const result = await dispatchNotification(admin, {
          tenantId,
          eventKey: `quote_followup:${q.id}:day${daysSince}`,
          sms: wantSms
            ? {
                to: customer!.phone_e164!,
                body: `Just checking in — your ${businessName} quote ${q.quote_number} for ${total} is still available.${link ? ` View: ${link}` : ""}`,
                triggeredBy: "quote_followup",
                relatedEntityType: "quote",
                relatedEntityId: q.id,
                bypassBusinessHours: true,
              }
            : null,
          email: wantEmail
            ? {
                to: customer!.email!,
                subject: `Following up on your quote ${q.quote_number}`,
                html: `<p>Hi ${q.customer_name},</p><p>Just a friendly follow-up on the quote we sent you${daysSince === 7 ? " a week ago" : " a few days ago"}.</p><p><b>Quote ${q.quote_number}</b> — Total: <b>${total}</b></p>${link ? `<p><a href="${link}">View your quote</a></p>` : ""}<p>Let us know if you have any questions.</p><p>— ${businessName}</p>`,
                triggeredBy: "quote_followup",
                relatedEntityType: "quote",
                relatedEntityId: q.id,
              }
            : null,
        });

        if (result.sms?.ok) totalSent++;
        if (result.email?.ok) totalSent++;
        if (result.sms?.status === "skipped" && result.email?.status === "skipped") totalSkipped++;
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
