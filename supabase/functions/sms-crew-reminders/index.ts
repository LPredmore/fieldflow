// Hourly worker. For each tenant where it's currently 6pm tenant-local,
// SMS+email each contractor a list of tomorrow's assigned jobs.
// Uses the shared notification dispatcher for both channels.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { dispatchNotification, ianaTimezone, tenantLocalHour } from "../_shared/notification-dispatcher.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function tenantLocalDateString(tz: string | null | undefined, d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ianaTimezone(tz),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const now = new Date();

    const { data: tenants } = await admin
      .from("settings")
      .select("tenant_id, business_name, time_zone, notification_settings");

    let totalSent = 0;
    for (const t of (tenants || []) as Array<{
      tenant_id: string;
      business_name: string | null;
      time_zone: string | null;
      notification_settings: Record<string, boolean> | null;
    }>) {
      if (tenantLocalHour(t.time_zone, now) !== 18) continue;

      const { data: smsSettings } = await admin
        .from("sms_settings")
        .select("enabled, notification_events")
        .eq("tenant_id", t.tenant_id)
        .maybeSingle();
      const smsEvents = (smsSettings?.notification_events || {}) as Record<string, boolean>;
      const smsEnabled = smsSettings?.enabled && smsEvents.job_reminder_crew !== false;
      const emailEnabled = (t.notification_settings || {}).job_reminder_crew_email !== false;
      if (!smsEnabled && !emailEnabled) continue;

      const tomorrowKey = tenantLocalDateString(
        t.time_zone,
        new Date(now.getTime() + 24 * 60 * 60 * 1000),
      );

      // Wide window covers any UTC slice mapping to tomorrow's local date
      const startWin = new Date(now.getTime() + 6 * 60 * 60 * 1000).toISOString();
      const endWin = new Date(now.getTime() + 42 * 60 * 60 * 1000).toISOString();

      const { data: occs } = await admin
        .from("job_occurrences")
        .select("id, assigned_to_user_id, customer_name, start_at, series_id")
        .eq("tenant_id", t.tenant_id)
        .eq("status", "scheduled")
        .gte("start_at", startWin)
        .lt("start_at", endWin)
        .not("assigned_to_user_id", "is", null);

      if (!occs || occs.length === 0) continue;

      const tomorrowOccs = occs.filter((o) =>
        tenantLocalDateString(t.time_zone, new Date(o.start_at)) === tomorrowKey
      );
      if (tomorrowOccs.length === 0) continue;

      const byContractor = new Map<string, typeof tomorrowOccs>();
      for (const o of tomorrowOccs) {
        const k = o.assigned_to_user_id as string;
        if (!byContractor.has(k)) byContractor.set(k, []);
        byContractor.get(k)!.push(o);
      }

      for (const [contractorId, jobs] of byContractor) {
        const eventKey = `crew_reminder:${contractorId}:${tomorrowKey}`;

        const { data: profile } = await admin
          .from("profiles")
          .select("full_name, email, phone")
          .eq("id", contractorId)
          .maybeSingle();
        if (!profile) continue;

        const sortedJobs = jobs.sort((a, b) => a.start_at.localeCompare(b.start_at));
        const lines = sortedJobs.map((o) => {
          const time = new Intl.DateTimeFormat("en-US", {
            timeZone: ianaTimezone(t.time_zone),
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
          }).format(new Date(o.start_at));
          return `${time} — ${o.customer_name}`;
        });

        const body = `Tomorrow's schedule (${jobs.length} ${jobs.length === 1 ? "job" : "jobs"}):\n${lines.join("\n")}`;
        const subject = `Tomorrow: ${jobs.length} ${jobs.length === 1 ? "job" : "jobs"} — ${t.business_name || "your schedule"}`;
        const html = `<p>Hi ${profile.full_name || "there"},</p><p>Your schedule for tomorrow (${tomorrowKey}):</p><ul>${lines.map((l) => `<li>${l}</li>`).join("")}</ul>`;

        // Normalize phone via DB function (profiles.phone is free-text)
        let phoneE164: string | null = null;
        if (smsEnabled && profile.phone) {
          const { data: e164 } = await admin.rpc("normalize_phone_e164", { _phone: profile.phone });
          phoneE164 = (e164 as string | null) ?? null;
        }

        const result = await dispatchNotification(admin, {
          tenantId: t.tenant_id,
          eventKey,
          sms: smsEnabled && phoneE164
            ? {
                to: phoneE164,
                body,
                triggeredBy: "job_reminder",
                bypassBusinessHours: true,
              }
            : null,
          email: emailEnabled && profile.email
            ? {
                to: profile.email,
                subject,
                html,
                triggeredBy: "job_reminder_crew",
              }
            : null,
        });
        if (result.sms?.ok) totalSent++;
        if (result.email?.ok) totalSent++;
      }
    }

    return json({ ok: true, sent: totalSent });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "unknown";
    console.error("sms-crew-reminders error:", msg);
    return json({ ok: false, error: "internal", message: msg }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
