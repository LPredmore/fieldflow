// Send SMS via Twilio (gateway). Single entry point — enforces opt-out, rate limit, daily cap.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/twilio";

interface SendSmsRequest {
  to: string;                       // E.164
  body: string;
  triggered_by: string;             // 'job_reminder' | 'on_the_way' | 'quote_sent' | 'invoice_sent' | 'invoice_overdue' | 'test' | 'first_contact' | 'manual'
  related_entity_type?: "job_occurrence" | "invoice" | "quote" | null;
  related_entity_id?: string | null;
  bypass_business_hours?: boolean;  // admin one-off sends only
  skip_opt_in_prefix?: boolean;     // for test sends
}

function normalizeE164(raw: string): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (trimmed.startsWith("+")) {
    const digits = trimmed.slice(1).replace(/\D/g, "");
    if (digits.length >= 8 && digits.length <= 15) return "+" + digits;
    return null;
  }
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) return "+1" + digits;
  if (digits.length === 11 && digits.startsWith("1")) return "+" + digits;
  if (digits.length >= 8 && digits.length <= 15) return "+" + digits;
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await supabase.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub as string;

    const body: SendSmsRequest = await req.json();
    if (!body.to || !body.body || !body.triggered_by) {
      return new Response(JSON.stringify({ error: "missing_fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (body.body.length > 1600) {
      return new Response(JSON.stringify({ error: "body_too_long" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const toE164 = normalizeE164(body.to);
    if (!toE164) {
      return new Response(JSON.stringify({ error: "no_valid_phone" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve tenant via profile lookup
    const { data: profile, error: profileErr } = await adminClient
      .from("profiles")
      .select("id, role, parent_admin_id")
      .eq("id", userId)
      .maybeSingle();
    if (profileErr || !profile) {
      return new Response(JSON.stringify({ error: "no_profile" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const tenantId =
      profile.role === "business_admin" ? profile.id : profile.parent_admin_id;
    if (!tenantId) {
      return new Response(JSON.stringify({ error: "no_tenant" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load sms_settings
    const { data: settings } = await adminClient
      .from("sms_settings")
      .select("*")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (!settings) {
      return new Response(JSON.stringify({ error: "sms_not_configured" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // For test sends we allow even when not enabled (wizard step 4).
    const isTestOrManual =
      body.triggered_by === "test" || body.triggered_by === "manual";
    if (!settings.enabled && !isTestOrManual) {
      return new Response(JSON.stringify({ error: "sms_disabled" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!settings.from_number_e164 && !settings.messaging_service_sid) {
      return new Response(JSON.stringify({ error: "no_from_number" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Opt-out check
    const { data: optedOut } = await adminClient
      .from("sms_opt_outs")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("phone_e164", toE164)
      .maybeSingle();
    if (optedOut) {
      return new Response(JSON.stringify({ error: "recipient_opted_out" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Business hours check (7am-9pm tenant local) for non-admin-bypass paths
    if (!body.bypass_business_hours && body.triggered_by !== "test") {
      const { data: tenantSettings } = await adminClient
        .from("settings")
        .select("time_zone")
        .eq("tenant_id", tenantId)
        .maybeSingle();
      const tz = mapTimeZone(tenantSettings?.time_zone || "Eastern");
      const now = new Date();
      const localHour = parseInt(
        new Intl.DateTimeFormat("en-US", {
          timeZone: tz,
          hour: "2-digit",
          hour12: false,
        }).format(now),
        10,
      );
      if (localHour < 7 || localHour >= 21) {
        return new Response(
          JSON.stringify({ error: "outside_business_hours" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
    }

    // Rate limit
    const { data: rl } = await adminClient.rpc("enhanced_rate_limit_check", {
      _identifier: tenantId,
      _endpoint: "send-sms",
      _max_requests: 200,
      _window_minutes: 60,
    });
    if (rl && typeof rl === "object" && (rl as Record<string, unknown>).allowed === false) {
      return new Response(JSON.stringify({ error: "rate_limit" }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Daily cap
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const { count: todayCount } = await adminClient
      .from("sms_messages")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("direction", "outbound")
      .gte("created_at", startOfDay.toISOString());
    if ((todayCount ?? 0) >= settings.daily_send_cap) {
      return new Response(JSON.stringify({ error: "daily_cap_exceeded" }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // First-contact opt-in prefix logic
    let finalBody = body.body;
    if (!body.skip_opt_in_prefix && body.triggered_by !== "test") {
      const { data: prior } = await adminClient
        .from("sms_messages")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("to_number_e164", toE164)
        .eq("direction", "outbound")
        .limit(1);
      const isFirstContact = !prior || prior.length === 0;
      if (isFirstContact) {
        const { data: tenantSettings } = await adminClient
          .from("settings")
          .select("business_name")
          .eq("tenant_id", tenantId)
          .maybeSingle();
        const businessName = tenantSettings?.business_name || "your service provider";
        finalBody =
          `${body.body}\n\nYou're receiving this from ${businessName}. Reply STOP to opt out, HELP for help.`;
      }
    }

    // Send via Twilio gateway
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const TWILIO_API_KEY = Deno.env.get("TWILIO_API_KEY");
    if (!LOVABLE_API_KEY || !TWILIO_API_KEY) {
      // Log failure so the admin sees what happened
      await adminClient.from("sms_messages").insert({
        tenant_id: tenantId,
        direction: "outbound",
        to_number_e164: toE164,
        from_number_e164: settings.from_number_e164,
        body: finalBody,
        status: "failed",
        error_code: "twilio_not_connected",
        triggered_by: body.triggered_by,
        related_entity_type: body.related_entity_type ?? null,
        related_entity_id: body.related_entity_id ?? null,
        triggered_by_user_id: userId,
      });
      return new Response(
        JSON.stringify({ error: "twilio_not_connected" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const params = new URLSearchParams({
      To: toE164,
      Body: finalBody,
    });
    if (settings.messaging_service_sid) {
      params.append("MessagingServiceSid", settings.messaging_service_sid);
    } else {
      params.append("From", settings.from_number_e164!);
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

    if (!twilioRes.ok) {
      const { data: failedRow } = await adminClient
        .from("sms_messages")
        .insert({
          tenant_id: tenantId,
          direction: "outbound",
          to_number_e164: toE164,
          from_number_e164: settings.from_number_e164,
          body: finalBody,
          status: "failed",
          error_code: String(twilioData?.code ?? twilioRes.status),
          triggered_by: body.triggered_by,
          related_entity_type: body.related_entity_type ?? null,
          related_entity_id: body.related_entity_id ?? null,
          triggered_by_user_id: userId,
        })
        .select("id")
        .single();
      return new Response(
        JSON.stringify({
          error: "twilio_error",
          code: twilioData?.code,
          message: twilioData?.message,
          message_id: failedRow?.id,
        }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const { data: insertedRow } = await adminClient
      .from("sms_messages")
      .insert({
        tenant_id: tenantId,
        direction: "outbound",
        to_number_e164: toE164,
        from_number_e164: settings.from_number_e164,
        body: finalBody,
        twilio_sid: twilioData.sid,
        status: twilioData.status === "queued" ? "queued" : (twilioData.status ?? "sent"),
        triggered_by: body.triggered_by,
        related_entity_type: body.related_entity_type ?? null,
        related_entity_id: body.related_entity_id ?? null,
        triggered_by_user_id: userId,
      })
      .select("id")
      .single();

    // For test sends, mark settings.test_message_sent_at
    if (body.triggered_by === "test") {
      await adminClient
        .from("sms_settings")
        .update({ test_message_sent_at: new Date().toISOString() })
        .eq("tenant_id", tenantId);
    }

    return new Response(
      JSON.stringify({ ok: true, message_id: insertedRow?.id, twilio_sid: twilioData.sid }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("send-sms error:", message);
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
