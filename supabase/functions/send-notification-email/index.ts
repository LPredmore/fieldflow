// Single entry point for transactional notification emails (Resend).
// Mirrors send-sms: tenant-scoped, logged, deduped, status-tracked.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { resolveEmailSender } from "../_shared/email-sender.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface SendEmailRequest {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  triggered_by: string;
  related_entity_type?: "job_occurrence" | "invoice" | "quote" | null;
  related_entity_id?: string | null;
  tenant_id?: string; // required when invoked from server-side (cron, trigger)
  reply_to?: string;
}

const RESEND_BASE = "https://api.resend.com";

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
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

    const body: SendEmailRequest = await req.json();
    if (!body.to || !body.subject || (!body.html && !body.text) || !body.triggered_by) {
      return json({ ok: false, error: "missing_fields" }, 400);
    }
    if (!isValidEmail(body.to)) {
      return json({ ok: false, error: "invalid_email" }, 400);
    }

    // Resolve tenant: explicit (server-side) or via auth (user-initiated)
    let tenantId = body.tenant_id || null;
    let userId: string | null = null;
    if (!tenantId) {
      const auth = req.headers.get("Authorization");
      if (!auth?.startsWith("Bearer ")) {
        return json({ ok: false, error: "no_tenant_or_auth" }, 401);
      }
      const userClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: auth } } },
      );
      const { data: claims } = await userClient.auth.getClaims(auth.replace("Bearer ", ""));
      if (!claims?.claims) return json({ ok: false, error: "unauthorized" }, 401);
      userId = claims.claims.sub as string;
      const { data: profile } = await admin
        .from("profiles")
        .select("id, role, parent_admin_id")
        .eq("id", userId)
        .maybeSingle();
      tenantId = profile?.role === "business_admin" ? profile.id : profile?.parent_admin_id ?? null;
      if (!tenantId) return json({ ok: false, error: "no_tenant" }, 400);
    }

    // Resolve per-tenant sender (custom verified domain or fallback)
    const sender = await resolveEmailSender(admin, tenantId);

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      await admin.from("email_messages").insert({
        tenant_id: tenantId,
        to_email: body.to,
        from_email: sender.fromAddress,
        subject: body.subject,
        body_html: body.html ?? null,
        body_text: body.text ?? null,
        status: "failed",
        error_code: "resend_not_configured",
        triggered_by: body.triggered_by,
        related_entity_type: body.related_entity_type ?? null,
        related_entity_id: body.related_entity_id ?? null,
        triggered_by_user_id: userId,
      });
      return json({ ok: false, error: "resend_not_configured" }, 400);
    }

    const resendRes = await fetch(`${RESEND_BASE}/emails`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: sender.from,
        to: [body.to],
        subject: body.subject,
        html: body.html,
        text: body.text,
        reply_to: body.reply_to || sender.replyTo || undefined,
      }),
    });
    const resendData = await resendRes.json();

    const { data: row } = await admin
      .from("email_messages")
      .insert({
        tenant_id: tenantId,
        to_email: body.to,
        from_email: sender.fromAddress,
        subject: body.subject,
        body_html: body.html ?? null,
        body_text: body.text ?? null,
        resend_id: resendRes.ok ? resendData.id : null,
        status: resendRes.ok ? "sent" : "failed",
        error_code: resendRes.ok ? null : String(resendData?.name ?? resendData?.message ?? resendRes.status),
        triggered_by: body.triggered_by,
        related_entity_type: body.related_entity_type ?? null,
        related_entity_id: body.related_entity_id ?? null,
        triggered_by_user_id: userId,
      })
      .select("id")
      .single();

    // Track successful test sends so the UI can show a "verified" badge
    if (resendRes.ok && body.triggered_by === "sender_test" && sender.isCustomDomain) {
      await admin.from("settings")
        .update({ updated_at: new Date().toISOString() })
        .eq("tenant_id", tenantId);
    }

    if (!resendRes.ok) {
      return json({
        ok: false,
        error: "resend_error",
        message: resendData?.message ?? "Resend rejected the send",
        error_code: resendData?.name ?? null,
        is_custom_domain: sender.isCustomDomain,
        from_address: sender.fromAddress,
        message_id: row?.id,
      }, 502);
    }
    return json({
      ok: true,
      message_id: row?.id,
      resend_id: resendData.id,
      is_custom_domain: sender.isCustomDomain,
      from_address: sender.fromAddress,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "unknown";
    console.error("send-notification-email error:", msg);
    return json({ ok: false, error: "internal", message: msg }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
