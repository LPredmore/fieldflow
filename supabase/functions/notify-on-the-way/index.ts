// Triggered by db trigger on time_entries clock-in.
// Sends "on the way" SMS + email to the customer.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface Payload {
  time_entry_id: string;
  job_occurrence_id: string;
  tenant_id: string;
  contractor_id: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const payload: Payload = await req.json();
    const { tenant_id, job_occurrence_id, contractor_id } = payload;

    // Idempotency
    const eventKey = `on_the_way:${job_occurrence_id}`;
    const { data: existing } = await admin
      .from("notification_dispatches")
      .select("id")
      .eq("tenant_id", tenant_id)
      .eq("event_key", eventKey)
      .limit(1);
    if (existing && existing.length > 0) {
      return json({ ok: true, skipped: "already_dispatched" });
    }

    // Load occurrence + customer + job + tenant
    const { data: occ } = await admin
      .from("job_occurrences")
      .select("id, customer_id, customer_name, series_id")
      .eq("id", job_occurrence_id)
      .maybeSingle();
    if (!occ) return json({ ok: false, error: "occurrence_not_found" }, 404);

    const { data: series } = await admin
      .from("job_series")
      .select("title")
      .eq("id", occ.series_id)
      .maybeSingle();

    const { data: customer } = await admin
      .from("customers")
      .select("name, phone_e164, email")
      .eq("id", occ.customer_id)
      .maybeSingle();

    const { data: settings } = await admin
      .from("settings")
      .select("business_name, notification_settings")
      .eq("tenant_id", tenant_id)
      .maybeSingle();
    const businessName = settings?.business_name || "Your service provider";
    const notif = (settings?.notification_settings || {}) as Record<string, boolean>;

    const { data: smsSettings } = await admin
      .from("sms_settings")
      .select("enabled, notification_events")
      .eq("tenant_id", tenant_id)
      .maybeSingle();
    const smsEvents = (smsSettings?.notification_events || {}) as Record<string, boolean>;

    const jobTitle = series?.title || "your service appointment";
    const customerName = customer?.name || occ.customer_name;
    const smsBody =
      `Hi ${customerName}, your technician from ${businessName} is on the way for ${jobTitle}. Reply STOP to opt out.`;
    const emailSubject = `Your ${businessName} technician is on the way`;
    const emailHtml =
      `<p>Hi ${customerName},</p><p>Your technician from <b>${businessName}</b> is on their way for <b>${jobTitle}</b>.</p><p>You'll see them shortly.</p>`;

    let smsSent = false;
    let emailSent = false;

    // SMS path
    if (
      smsSettings?.enabled &&
      smsEvents.on_the_way !== false &&
      customer?.phone_e164
    ) {
      const r = await admin.functions.invoke("send-sms", {
        body: {
          to: customer.phone_e164,
          body: smsBody,
          triggered_by: "on_the_way",
          related_entity_type: "job_occurrence",
          related_entity_id: job_occurrence_id,
          bypass_business_hours: true,
        },
        headers: {
          Authorization: `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
        },
      });
      smsSent = !r.error && (r.data as { ok?: boolean })?.ok === true;
      if (smsSent) {
        await admin.from("notification_dispatches").insert({
          tenant_id,
          event_key: eventKey,
          channel: "sms",
        });
      }
    }

    // Email path
    if (notif.on_the_way_email !== false && customer?.email) {
      const r = await admin.functions.invoke("send-notification-email", {
        body: {
          to: customer.email,
          subject: emailSubject,
          html: emailHtml,
          triggered_by: "on_the_way",
          related_entity_type: "job_occurrence",
          related_entity_id: job_occurrence_id,
        },
      });
      emailSent = !r.error && (r.data as { ok?: boolean })?.ok === true;
      if (emailSent) {
        await admin.from("notification_dispatches").insert({
          tenant_id,
          event_key: eventKey,
          channel: "email",
        });
      }
    }

    return json({ ok: true, sms_sent: smsSent, email_sent: emailSent });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "unknown";
    console.error("notify-on-the-way error:", msg);
    return json({ ok: false, error: "internal", message: msg }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
