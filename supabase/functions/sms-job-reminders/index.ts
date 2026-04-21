// Hourly cron — sends 24h job reminders for jobs starting between 23-25h from now.
// Uses the shared dispatcher (no JWT round-trip; service role direct).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { dispatchNotification, ianaTimezone } from "../_shared/notification-dispatcher.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: tenants } = await admin
      .from("sms_settings")
      .select("tenant_id, enabled, notification_events")
      .eq("enabled", true);

    if (!tenants || tenants.length === 0) {
      return new Response(JSON.stringify({ ok: true, processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = new Date();
    const windowStart = new Date(now.getTime() + 23 * 60 * 60 * 1000);
    const windowEnd = new Date(now.getTime() + 25 * 60 * 60 * 1000);

    let totalSent = 0;
    let totalSkipped = 0;

    for (const t of tenants as Array<{
      tenant_id: string;
      enabled: boolean;
      notification_events: Record<string, boolean> | null;
    }>) {
      const events = t.notification_events || {};
      if (events.job_reminder_24h === false) continue;

      const { data: occurrences } = await admin
        .from("job_occurrences")
        .select("id, customer_id, customer_name, start_at, series_id")
        .eq("tenant_id", t.tenant_id)
        .gte("start_at", windowStart.toISOString())
        .lt("start_at", windowEnd.toISOString())
        .eq("status", "scheduled");

      if (!occurrences || occurrences.length === 0) continue;

      const { data: tenantSettings } = await admin
        .from("settings")
        .select("business_name, time_zone")
        .eq("tenant_id", t.tenant_id)
        .maybeSingle();
      const businessName = tenantSettings?.business_name || "Your service provider";
      const tz = ianaTimezone(tenantSettings?.time_zone);

      for (const occ of occurrences) {
        const { data: customer } = await admin
          .from("customers")
          .select("phone_e164, name")
          .eq("id", occ.customer_id)
          .maybeSingle();
        if (!customer?.phone_e164) {
          totalSkipped++;
          continue;
        }

        const localTime = new Intl.DateTimeFormat("en-US", {
          timeZone: tz,
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        }).format(new Date(occ.start_at));

        const body = `Reminder: ${businessName} is scheduled to visit you tomorrow at ${localTime}.`;

        const result = await dispatchNotification(admin, {
          tenantId: t.tenant_id,
          eventKey: `job_reminder_24h:${occ.id}`,
          sms: {
            to: customer.phone_e164,
            body,
            triggeredBy: "job_reminder",
            relatedEntityType: "job_occurrence",
            relatedEntityId: occ.id,
            // 24h reminders fire from cron — respect business hours
          },
        });
        if (result.sms?.ok) totalSent++;
        else totalSkipped++;
      }
    }

    return new Response(
      JSON.stringify({ ok: true, sent: totalSent, skipped: totalSkipped }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("sms-job-reminders error:", message);
    return new Response(JSON.stringify({ error: "internal", message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
