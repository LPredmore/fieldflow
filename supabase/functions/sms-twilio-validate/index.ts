// Wizard helper: list Twilio numbers, check campaign status, verify credentials.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/twilio";
const VERIFY_URL = "https://connector-gateway.lovable.dev/api/v1/verify_credentials";

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

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await supabase.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { action } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const TWILIO_API_KEY = Deno.env.get("TWILIO_API_KEY");
    if (!LOVABLE_API_KEY || !TWILIO_API_KEY) {
      return new Response(
        JSON.stringify({ error: "twilio_not_connected" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const baseHeaders = {
      "Authorization": `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": TWILIO_API_KEY,
    };

    if (action === "verify") {
      const res = await fetch(VERIFY_URL, {
        method: "POST",
        headers: baseHeaders,
      });
      const data = await res.json();
      return new Response(JSON.stringify(data), {
        status: res.ok ? 200 : res.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "list_numbers") {
      const res = await fetch(`${GATEWAY_URL}/IncomingPhoneNumbers.json`, {
        headers: baseHeaders,
      });
      const data = await res.json();
      if (!res.ok) {
        return new Response(
          JSON.stringify({ error: "twilio_error", details: data }),
          {
            status: res.status,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      const numbers = (data.incoming_phone_numbers || []).map(
        (n: { phone_number: string; friendly_name: string; sid: string }) => ({
          phone_number: n.phone_number,
          friendly_name: n.friendly_name,
          sid: n.sid,
        }),
      );
      return new Response(JSON.stringify({ numbers }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "unknown_action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("sms-twilio-validate error:", message);
    return new Response(JSON.stringify({ error: "internal", message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
