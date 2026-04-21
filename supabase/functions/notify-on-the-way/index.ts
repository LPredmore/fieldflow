// Triggered by db trigger on time_entries clock-in.
// Sends "on the way" SMS + email to the customer via the shared dispatcher.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { dispatchNotification } from "../_shared/notification-dispatcher.ts";

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
    const { tenant_id, job_occurrence_id } = payload;

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
      `Hi ${customerName}, your technician from ${businessName} is on the way for ${jobTitle}.`;
    const emailSubject = `Your ${businessName} technician is on the way`;
    const emailHtml =
      `<p>Hi ${customerName},</p><p>Your technician from <b>${businessName}</b> is on their way for <b>${jobTitle}</b>.</p><p>You'll see them shortly.</p>`;

    const eventKey = `on_the_way:${job_occurrence_id}`;
    const wantSms = smsSettings?.enabled
      && smsEvents.on_the_way !== false
      && !!customer?.phone_e164;
    const wantEmail = notif.on_the_way_email !== false && !!customer?.email;

    const result = await dispatchNotification(admin, {
      tenantId: tenant_id,
      eventKey,
      sms: wantSms
        ? {
            to: customer!.phone_e164!,
            body: smsBody,
            triggeredBy: "on_the_way",
            relatedEntityType: "job_occurrence",
            relatedEntityId: job_occurrence_id,
            bypassBusinessHours: true,
          }
        : null,
      email: wantEmail
        ? {
            to: customer!.email!,
            subject: emailSubject,
            html: emailHtml,
            triggeredBy: "on_the_way",
            relatedEntityType: "job_occurrence",
            relatedEntityId: job_occurrence_id,
          }
        : null,
    });

    return json({
      ok: true,
      sms: result.sms?.status ?? "not_attempted",
      email: result.email?.status ?? "not_attempted",
    });
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
