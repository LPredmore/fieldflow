// Twilio inbound webhook — handles STOP/HELP keywords for TCPA compliance.
// verify_jwt = false (configured in supabase/config.toml). Twilio signs the request; we verify.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { createHmac } from "node:crypto";

function twiml(message: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${message}</Message></Response>`;
}
function emptyTwiml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`;
}

// Twilio signature verification per https://www.twilio.com/docs/usage/webhooks/webhooks-security
function verifyTwilioSignature(
  authToken: string,
  signature: string,
  url: string,
  params: Record<string, string>,
): boolean {
  const sortedKeys = Object.keys(params).sort();
  let data = url;
  for (const key of sortedKeys) {
    data += key + params[key];
  }
  const hmac = createHmac("sha1", authToken);
  hmac.update(data);
  const expected = hmac.digest("base64");
  return expected === signature;
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const formText = await req.text();
    const formData = new URLSearchParams(formText);
    const params: Record<string, string> = {};
    for (const [k, v] of formData.entries()) params[k] = v;

    const fromNumber = params["From"] || "";
    const toNumber = params["To"] || ""; // our Twilio number
    const messageBody = (params["Body"] || "").trim();
    const messageSid = params["MessageSid"] || "";

    // Verify Twilio signature when an auth token is present.
    // The connector gateway model means we may not always have TWILIO_AUTH_TOKEN — fall back to
    // tenant lookup-only mode but log a warning.
    const twilioAuthToken = Deno.env.get("TWILIO_AUTH_TOKEN");
    const signature = req.headers.get("x-twilio-signature");
    if (twilioAuthToken && signature) {
      // Reconstruct full URL Twilio used
      const proto = req.headers.get("x-forwarded-proto") || "https";
      const host = req.headers.get("host") || "";
      const url = `${proto}://${host}${new URL(req.url).pathname}`;
      const ok = verifyTwilioSignature(twilioAuthToken, signature, url, params);
      if (!ok) {
        await adminClient.from("audit_logs").insert({
          tenant_id: "00000000-0000-0000-0000-000000000000",
          user_id: "00000000-0000-0000-0000-000000000000",
          action: "twilio_inbound_signature_failed",
          resource_type: "sms_messages",
          new_values: { from: fromNumber, to: toNumber, sid: messageSid },
        });
        return new Response("Forbidden", { status: 403 });
      }
    }

    // Resolve tenant by from_number_e164 (matches the *To* field, which is our Twilio number)
    const { data: settings } = await adminClient
      .from("sms_settings")
      .select("tenant_id")
      .eq("from_number_e164", toNumber)
      .maybeSingle();

    const tenantId = settings?.tenant_id;

    const stopRegex = /^(STOP|UNSUBSCRIBE|END|QUIT|CANCEL|STOPALL)\b/i;
    const helpRegex = /^(HELP|INFO)\b/i;

    if (stopRegex.test(messageBody)) {
      if (tenantId) {
        await adminClient
          .from("sms_opt_outs")
          .upsert(
            {
              tenant_id: tenantId,
              phone_e164: fromNumber,
              reason: "stop_keyword",
            },
            { onConflict: "tenant_id,phone_e164" },
          );
        await adminClient.from("sms_messages").insert({
          tenant_id: tenantId,
          direction: "inbound",
          to_number_e164: toNumber,
          from_number_e164: fromNumber,
          body: messageBody,
          twilio_sid: messageSid,
          status: "received",
          triggered_by: "stop_keyword",
        });
      }
      // Twilio auto-replies to STOP itself; return empty TwiML to avoid duplicate.
      return new Response(emptyTwiml(), {
        headers: { "Content-Type": "text/xml" },
      });
    }

    if (helpRegex.test(messageBody)) {
      let businessName = "Support";
      let businessPhone = "";
      if (tenantId) {
        const { data: tenantSettings } = await adminClient
          .from("settings")
          .select("business_name, business_phone")
          .eq("tenant_id", tenantId)
          .maybeSingle();
        businessName = tenantSettings?.business_name || "Support";
        businessPhone = tenantSettings?.business_phone || "";
        await adminClient.from("sms_messages").insert({
          tenant_id: tenantId,
          direction: "inbound",
          to_number_e164: toNumber,
          from_number_e164: fromNumber,
          body: messageBody,
          twilio_sid: messageSid,
          status: "received",
          triggered_by: "help_request",
        });
      }
      const helpMsg = `${businessName}: For help${businessPhone ? `, call ${businessPhone}` : ""}. Reply STOP to opt out. Msg&data rates may apply.`;
      return new Response(twiml(helpMsg), {
        headers: { "Content-Type": "text/xml" },
      });
    }

    // Generic inbound — log only
    if (tenantId) {
      await adminClient.from("sms_messages").insert({
        tenant_id: tenantId,
        direction: "inbound",
        to_number_e164: toNumber,
        from_number_e164: fromNumber,
        body: messageBody,
        twilio_sid: messageSid,
        status: "received",
        triggered_by: "inbound_message",
      });
    }

    return new Response(emptyTwiml(), {
      headers: { "Content-Type": "text/xml" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("twilio-inbound error:", message);
    return new Response(emptyTwiml(), {
      headers: { "Content-Type": "text/xml" },
      status: 200, // Always 200 to Twilio so it doesn't retry
    });
  }
});
