// Daily worker.
// 1. Per-tenant: flips invoices to 'overdue' when due_date < today (tenant local)
//    AND status='sent', skipping tenants whose notifications are entirely off.
// 2. Sends overdue nudges on day 1, 7, 14, 30 past due via the shared dispatcher.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { dispatchNotification, ianaTimezone } from "../_shared/notification-dispatcher.ts";
import { resolvePortalBaseUrl } from "../_shared/portal-url.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const NUDGE_DAYS = [1, 7, 14, 30];

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

    // Per-tenant processing so overdue flip + nudges respect each tenant's
    // timezone and notification preferences.
    const { data: allTenants } = await admin
      .from("settings")
      .select("tenant_id, time_zone, business_name, notification_settings");

    let totalFlipped = 0;
    let totalSent = 0;
    let totalSkipped = 0;

    for (const t of (allTenants || []) as Array<{
      tenant_id: string;
      time_zone: string | null;
      business_name: string | null;
      notification_settings: Record<string, boolean> | null;
    }>) {
      const todayStr = tenantLocalDate(t.time_zone, new Date());
      const notif = t.notification_settings || {};
      const businessName = t.business_name || "Your service provider";

      // Step 1: flip past-due 'sent' invoices for this tenant
      const { data: flipped } = await admin
        .from("invoices")
        .update({ status: "overdue" })
        .eq("tenant_id", t.tenant_id)
        .lt("due_date", todayStr)
        .eq("status", "sent")
        .select("id");
      totalFlipped += flipped?.length ?? 0;

      // Step 2: load SMS prefs once per tenant
      const { data: smsSettings } = await admin
        .from("sms_settings")
        .select("enabled, notification_events")
        .eq("tenant_id", t.tenant_id)
        .maybeSingle();
      const smsEvents = (smsSettings?.notification_events || {}) as Record<string, boolean>;
      const wantSmsAny = smsSettings?.enabled && smsEvents.invoice_overdue !== false;
      const wantEmailAny = notif.invoice_overdue_email !== false;
      if (!wantSmsAny && !wantEmailAny) continue; // tenant opted out of overdue notifications

      const portalBase = await resolvePortalBaseUrl(admin, t.tenant_id);

      // Step 3: send nudges
      for (const days of NUDGE_DAYS) {
        const target = new Date();
        target.setUTCDate(target.getUTCDate() - days);
        const targetStr = tenantLocalDate(t.time_zone, target);

        const { data: invoices } = await admin
          .from("invoices")
          .select("id, invoice_number, customer_id, customer_name, total_amount, due_date, status, share_token")
          .eq("tenant_id", t.tenant_id)
          .eq("status", "overdue")
          .eq("due_date", targetStr);

        if (!invoices || invoices.length === 0) continue;

        for (const inv of invoices) {
          const { data: customer } = await admin
            .from("customers")
            .select("phone_e164, email")
            .eq("id", inv.customer_id)
            .maybeSingle();

          const wantSms = wantSmsAny && !!customer?.phone_e164;
          const wantEmail = wantEmailAny && !!customer?.email;
          if (!wantSms && !wantEmail) {
            totalSkipped++;
            continue;
          }

          const link = inv.share_token ? `${portalBase}/public-invoice/${inv.share_token}` : "";
          const total = `$${Number(inv.total_amount).toFixed(2)}`;
          const dayLabel = days === 1 ? "1 day" : days === 7 ? "1 week" : `${days} days`;

          const result = await dispatchNotification(admin, {
            tenantId: t.tenant_id,
            eventKey: `invoice_overdue:${inv.id}:day${days}`,
            sms: wantSms
              ? {
                  to: customer!.phone_e164!,
                  body: `Reminder: invoice ${inv.invoice_number} for ${total} from ${businessName} is now ${dayLabel} past due.${link ? ` Pay here: ${link}` : ""}`,
                  triggeredBy: "invoice_overdue",
                  relatedEntityType: "invoice",
                  relatedEntityId: inv.id,
                  bypassBusinessHours: true,
                }
              : null,
            email: wantEmail
              ? {
                  to: customer!.email!,
                  subject: `Invoice ${inv.invoice_number} is ${dayLabel} past due`,
                  html: `<p>Hi ${inv.customer_name},</p><p>This is a friendly reminder that invoice <b>${inv.invoice_number}</b> for <b>${total}</b> is now <b>${dayLabel} past due</b>.</p>${link ? `<p><a href="${link}">View and pay your invoice</a></p>` : ""}<p>Please get in touch if you have any questions.</p><p>— ${businessName}</p>`,
                  triggeredBy: "invoice_overdue",
                  relatedEntityType: "invoice",
                  relatedEntityId: inv.id,
                }
              : null,
          });
          if (result.sms?.ok) totalSent++;
          if (result.email?.ok) totalSent++;
        }
      }
    }

    return json({ ok: true, flipped: totalFlipped, sent: totalSent, skipped: totalSkipped });
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
