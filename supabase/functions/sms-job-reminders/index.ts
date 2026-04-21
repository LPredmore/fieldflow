// Hourly cron — sends 24h job reminders for jobs starting between 23-25h from now.
// Skips occurrences already reminded; respects sms_settings.notification_events.job_reminder_24h.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/twilio";

interface TenantSettings {
  tenant_id: string;
  from_number_e164: string | null;
  messaging_service_sid: string | null;
  enabled: boolean;
  notification_events: Record<string, boolean>;
  daily_send_cap: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const TWILIO_API_KEY = Deno.env.get("TWILIO_API_KEY");

    const { data: tenants } = await adminClient
      .from("sms_settings")
      .select(
        "tenant_id, from_number_e164, messaging_service_sid, enabled, notification_events, daily_send_cap",
      )
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

    for (const t of tenants as TenantSettings[]) {
      if (!t.notification_events?.job_reminder_24h) continue;
      if (!LOVABLE_API_KEY || !TWILIO_API_KEY) {
        totalSkipped++;
        continue;
      }
      if (!t.from_number_e164 && !t.messaging_service_sid) continue;

      // Find candidate occurrences
      const { data: occurrences } = await adminClient
        .from("job_occurrences")
        .select(
          "id, customer_id, customer_name, start_at, series_id, tenant_id",
        )
        .eq("tenant_id", t.tenant_id)
        .gte("start_at", windowStart.toISOString())
        .lt("start_at", windowEnd.toISOString())
        .eq("status", "scheduled");

      if (!occurrences || occurrences.length === 0) continue;

      // Tenant business name for personalisation
      const { data: tenantSettings } = await adminClient
        .from("settings")
        .select("business_name, time_zone")
        .eq("tenant_id", t.tenant_id)
        .maybeSingle();
      const businessName = tenantSettings?.business_name || "Your service provider";
      const tz = mapTimeZone(tenantSettings?.time_zone || "Eastern");

      for (const occ of occurrences) {
        // Skip if already reminded
        const { data: prior } = await adminClient
          .from("sms_messages")
          .select("id")
          .eq("tenant_id", t.tenant_id)
          .eq("related_entity_type", "job_occurrence")
          .eq("related_entity_id", occ.id)
          .eq("triggered_by", "job_reminder")
          .limit(1);
        if (prior && prior.length > 0) continue;

        // Resolve customer phone (E.164)
        const { data: customer } = await adminClient
          .from("customers")
          .select("phone_e164, name")
          .eq("id", occ.customer_id)
          .maybeSingle();
        if (!customer?.phone_e164) continue;

        // Opt-out check
        const { data: optedOut } = await adminClient
          .from("sms_opt_outs")
          .select("id")
          .eq("tenant_id", t.tenant_id)
          .eq("phone_e164", customer.phone_e164)
          .maybeSingle();
        if (optedOut) {
          totalSkipped++;
          continue;
        }

        // Daily cap
        const startOfDay = new Date();
        startOfDay.setUTCHours(0, 0, 0, 0);
        const { count: todayCount } = await adminClient
          .from("sms_messages")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", t.tenant_id)
          .eq("direction", "outbound")
          .gte("created_at", startOfDay.toISOString());
        if ((todayCount ?? 0) >= t.daily_send_cap) break; // skip rest of tenant

        const localTime = new Intl.DateTimeFormat("en-US", {
          timeZone: tz,
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        }).format(new Date(occ.start_at));

        const body = `Reminder: ${businessName} is scheduled to visit you tomorrow at ${localTime}. Reply STOP to opt out.`;

        // Send via Twilio
        const params = new URLSearchParams({
          To: customer.phone_e164,
          Body: body,
        });
        if (t.messaging_service_sid) {
          params.append("MessagingServiceSid", t.messaging_service_sid);
        } else {
          params.append("From", t.from_number_e164!);
        }
        const twilioRes = await fetch(`${GATEWAY_URL}/Messages.json`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${LOVABLE_API_KEY}`,
            "X-Connection-Api-Key": TWILIO_API_KEY,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: params,
        });
        const twilioData = await twilioRes.json();

        await adminClient.from("sms_messages").insert({
          tenant_id: t.tenant_id,
          direction: "outbound",
          to_number_e164: customer.phone_e164,
          from_number_e164: t.from_number_e164,
          body,
          twilio_sid: twilioRes.ok ? twilioData.sid : null,
          status: twilioRes.ok ? (twilioData.status ?? "queued") : "failed",
          error_code: twilioRes.ok ? null : String(twilioData?.code ?? twilioRes.status),
          triggered_by: "job_reminder",
          related_entity_type: "job_occurrence",
          related_entity_id: occ.id,
        });
        if (twilioRes.ok) totalSent++;
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

function mapTimeZone(tz: string): string {
  const map: Record<string, string> = {
    Eastern: "America/New_York",
    Central: "America/Chicago",
    Mountain: "America/Denver",
    Pacific: "America/Los_Angeles",
    Arizona: "America/Phoenix",
    Alaska: "America/Anchorage",
    "Hawaii Aleutian": "Pacific/Honolulu",
  };
  return map[tz] || "America/New_York";
}
