// Hourly worker. For each tenant where it's currently 6pm tenant-local,
// SMS+email each contractor a list of tomorrow's assigned jobs.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const TZ_MAP: Record<string, string> = {
  Eastern: "America/New_York",
  Central: "America/Chicago",
  Mountain: "America/Denver",
  Pacific: "America/Los_Angeles",
  Arizona: "America/Phoenix",
  Alaska: "America/Anchorage",
  "Hawaii Aleutian": "Pacific/Honolulu",
};

function tenantLocalHour(tz: string, now: Date): number {
  const ianaTz = TZ_MAP[tz] || "America/New_York";
  return parseInt(
    new Intl.DateTimeFormat("en-US", { timeZone: ianaTz, hour: "2-digit", hour12: false }).format(now),
    10,
  );
}

function tenantLocalDateString(tz: string, d: Date): string {
  const ianaTz = TZ_MAP[tz] || "America/New_York";
  // returns YYYY-MM-DD
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ianaTz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
  return parts;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const now = new Date();

    // Pull all tenants with settings; filter by 6pm local
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
      const hour = tenantLocalHour(t.time_zone || "Eastern", now);
      if (hour !== 18) continue; // 6pm local

      const { data: smsSettings } = await admin
        .from("sms_settings")
        .select("enabled, notification_events")
        .eq("tenant_id", t.tenant_id)
        .maybeSingle();
      const smsEvents = (smsSettings?.notification_events || {}) as Record<string, boolean>;
      const smsEnabled = smsSettings?.enabled && smsEvents.job_reminder_crew !== false;
      const emailEnabled = (t.notification_settings || {}).job_reminder_crew_email !== false;
      if (!smsEnabled && !emailEnabled) continue;

      // Tomorrow in tenant local
      const tomorrowLocal = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const tomorrowKey = tenantLocalDateString(t.time_zone || "Eastern", tomorrowLocal);

      // Find tomorrow's occurrences grouped by contractor
      // Window: cover any UTC slice that maps to tomorrow's local date — a 36h window comfortably covers all US zones.
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

      // Filter to tenant-local "tomorrow"
      const ianaTz = TZ_MAP[t.time_zone || "Eastern"] || "America/New_York";
      const tomorrowOccs = occs.filter((o) => {
        const localDay = tenantLocalDateString(t.time_zone || "Eastern", new Date(o.start_at));
        return localDay === tomorrowKey;
      });
      if (tomorrowOccs.length === 0) continue;

      // Group by contractor
      const byContractor = new Map<string, typeof tomorrowOccs>();
      for (const o of tomorrowOccs) {
        const k = o.assigned_to_user_id as string;
        if (!byContractor.has(k)) byContractor.set(k, []);
        byContractor.get(k)!.push(o);
      }

      for (const [contractorId, jobs] of byContractor) {
        const eventKey = `crew_reminder:${contractorId}:${tomorrowKey}`;

        // Skip if already dispatched today
        const { data: prior } = await admin
          .from("notification_dispatches")
          .select("id")
          .eq("tenant_id", t.tenant_id)
          .eq("event_key", eventKey)
          .limit(1);
        if (prior && prior.length > 0) continue;

        // Resolve contractor contact
        const { data: profile } = await admin
          .from("profiles")
          .select("full_name, email, phone")
          .eq("id", contractorId)
          .maybeSingle();
        if (!profile) continue;

        const sortedJobs = jobs.sort((a, b) => a.start_at.localeCompare(b.start_at));
        const lines = sortedJobs.map((o) => {
          const time = new Intl.DateTimeFormat("en-US", {
            timeZone: ianaTz,
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
          }).format(new Date(o.start_at));
          return `${time} — ${o.customer_name}`;
        });

        const body = `Tomorrow's schedule (${jobs.length} ${jobs.length === 1 ? "job" : "jobs"}):\n${lines.join("\n")}`;
        const subject = `Tomorrow: ${jobs.length} ${jobs.length === 1 ? "job" : "jobs"} — ${t.business_name || "your schedule"}`;
        const html = `<p>Hi ${profile.full_name || "there"},</p><p>Your schedule for tomorrow (${tomorrowKey}):</p><ul>${lines.map((l) => `<li>${l}</li>`).join("")}</ul>`;

        // Normalize phone: profile.phone is free-text; rely on db function via admin
        if (smsEnabled && profile.phone) {
          const { data: e164 } = await admin.rpc("normalize_phone_e164", { _phone: profile.phone });
          if (e164) {
            const r = await admin.functions.invoke("send-sms", {
              body: {
                to: e164,
                body,
                triggered_by: "job_reminder",
                bypass_business_hours: true,
              },
              headers: { Authorization: `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}` },
            });
            if (!r.error && (r.data as { ok?: boolean })?.ok) {
              await admin.from("notification_dispatches").insert({
                tenant_id: t.tenant_id,
                event_key: eventKey,
                channel: "sms",
              });
              totalSent++;
            }
          }
        }
        if (emailEnabled && profile.email) {
          const r = await admin.functions.invoke("send-notification-email", {
            body: {
              to: profile.email,
              subject,
              html,
              triggered_by: "job_reminder_crew",
              tenant_id: t.tenant_id,
            },
          });
          if (!r.error && (r.data as { ok?: boolean })?.ok) {
            await admin.from("notification_dispatches").insert({
              tenant_id: t.tenant_id,
              event_key: eventKey,
              channel: "email",
            });
            totalSent++;
          }
        }
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
