// Centralized server-to-server notification dispatch.
// Used by every cron worker and DB-trigger function so the rules
// (opt-out, daily cap, business hours, idempotency, logging) are enforced
// in exactly one place — no duplicated branches, no JWT confusion.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { resolveEmailSender, logEmailMessage } from "./email-sender.ts";

const TWILIO_GATEWAY = "https://connector-gateway.lovable.dev/twilio";
const RESEND_BASE = "https://api.resend.com";

const TZ_MAP: Record<string, string> = {
  Eastern: "America/New_York",
  Central: "America/Chicago",
  Mountain: "America/Denver",
  Pacific: "America/Los_Angeles",
  Arizona: "America/Phoenix",
  Alaska: "America/Anchorage",
  "Hawaii Aleutian": "Pacific/Honolulu",
};

function ianaTimezone(tz: string | null | undefined): string {
  if (!tz) return "America/New_York";
  if (tz.includes("/")) return tz; // already IANA
  return TZ_MAP[tz] || "America/New_York";
}

function tenantLocalHour(tz: string | null | undefined, now = new Date()): number {
  return parseInt(
    new Intl.DateTimeFormat("en-US", {
      timeZone: ianaTimezone(tz),
      hour: "2-digit",
      hour12: false,
    }).format(now),
    10,
  );
}

export interface SmsSendInput {
  to: string;            // E.164
  body: string;
  triggeredBy: string;   // 'job_reminder' | 'on_the_way' | 'quote_followup' | 'invoice_overdue' | etc.
  relatedEntityType?: string | null;
  relatedEntityId?: string | null;
  bypassBusinessHours?: boolean;
  skipOptInPrefix?: boolean;
}

export interface EmailSendInput {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  triggeredBy: string;
  relatedEntityType?: string | null;
  relatedEntityId?: string | null;
  replyTo?: string;
}

export interface SmsSendResult {
  ok: boolean;
  status: "sent" | "skipped" | "failed";
  reason?: string;
  messageId?: string;
  twilioSid?: string;
}

export interface EmailSendResult {
  ok: boolean;
  status: "sent" | "skipped" | "failed";
  reason?: string;
  messageId?: string;
  resendId?: string;
}

/**
 * Send an SMS server-side. No JWT required (uses service role key directly).
 * Enforces opt-out, business hours, daily cap, first-contact disclosure, and
 * writes the audit row in sms_messages.
 */
export async function sendSmsServer(
  admin: SupabaseClient,
  tenantId: string,
  input: SmsSendInput,
): Promise<SmsSendResult> {
  const toE164 = normalizeE164(input.to);
  if (!toE164) return skip("no_valid_phone");

  // Opt-out
  const { data: optOut } = await admin
    .from("sms_opt_outs")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("phone_e164", toE164)
    .maybeSingle();
  if (optOut) return skip("recipient_opted_out");

  // Tenant SMS settings
  const { data: smsSettings } = await admin
    .from("sms_settings")
    .select("enabled, from_number_e164, messaging_service_sid, daily_send_cap")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!smsSettings) return skip("sms_not_configured");
  if (!smsSettings.enabled) return skip("sms_disabled");
  if (!smsSettings.from_number_e164 && !smsSettings.messaging_service_sid) {
    return skip("no_from_number");
  }

  // Business hours (7am-9pm tenant local) unless explicitly bypassed
  if (!input.bypassBusinessHours) {
    const { data: tenantSettings } = await admin
      .from("settings")
      .select("time_zone")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    const hour = tenantLocalHour(tenantSettings?.time_zone);
    if (hour < 7 || hour >= 21) return skip("outside_business_hours");
  }

  // Daily cap
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const { count } = await admin
    .from("sms_messages")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("direction", "outbound")
    .gte("created_at", startOfDay.toISOString());
  if ((count ?? 0) >= (smsSettings.daily_send_cap ?? 500)) {
    return skip("daily_cap_exceeded");
  }

  // First-contact disclosure
  let finalBody = input.body;
  if (!input.skipOptInPrefix) {
    const { data: prior } = await admin
      .from("sms_messages")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("to_number_e164", toE164)
      .eq("direction", "outbound")
      .limit(1);
    if (!prior || prior.length === 0) {
      const { data: tenantSettings } = await admin
        .from("settings")
        .select("business_name")
        .eq("tenant_id", tenantId)
        .maybeSingle();
      const businessName = tenantSettings?.business_name || "your service provider";
      finalBody = `${input.body}\n\nYou're receiving this from ${businessName}. Reply STOP to opt out, HELP for help.`;
    }
  }

  // Twilio gateway send
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const TWILIO_API_KEY = Deno.env.get("TWILIO_API_KEY");
  if (!LOVABLE_API_KEY || !TWILIO_API_KEY) {
    await admin.from("sms_messages").insert({
      tenant_id: tenantId,
      direction: "outbound",
      to_number_e164: toE164,
      from_number_e164: smsSettings.from_number_e164,
      body: finalBody,
      status: "failed",
      error_code: "twilio_not_connected",
      triggered_by: input.triggeredBy,
      related_entity_type: input.relatedEntityType ?? null,
      related_entity_id: input.relatedEntityId ?? null,
    });
    return { ok: false, status: "failed", reason: "twilio_not_connected" };
  }

  const params = new URLSearchParams({ To: toE164, Body: finalBody });
  if (smsSettings.messaging_service_sid) {
    params.append("MessagingServiceSid", smsSettings.messaging_service_sid);
  } else {
    params.append("From", smsSettings.from_number_e164!);
  }

  const twilioRes = await fetch(`${TWILIO_GATEWAY}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": TWILIO_API_KEY,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  });
  const twilioData = await twilioRes.json().catch(() => ({}));

  const { data: row } = await admin
    .from("sms_messages")
    .insert({
      tenant_id: tenantId,
      direction: "outbound",
      to_number_e164: toE164,
      from_number_e164: smsSettings.from_number_e164,
      body: finalBody,
      twilio_sid: twilioRes.ok ? twilioData?.sid ?? null : null,
      status: twilioRes.ok ? (twilioData?.status ?? "queued") : "failed",
      error_code: twilioRes.ok ? null : String(twilioData?.code ?? twilioRes.status),
      triggered_by: input.triggeredBy,
      related_entity_type: input.relatedEntityType ?? null,
      related_entity_id: input.relatedEntityId ?? null,
    })
    .select("id")
    .single();

  if (!twilioRes.ok) {
    return {
      ok: false,
      status: "failed",
      reason: String(twilioData?.code ?? twilioRes.status),
      messageId: row?.id,
    };
  }
  return {
    ok: true,
    status: "sent",
    messageId: row?.id,
    twilioSid: twilioData?.sid,
  };
}

/**
 * Send an email server-side via Resend. Uses the per-tenant verified sender,
 * always logs to email_messages, returns structured result.
 */
export async function sendEmailServer(
  admin: SupabaseClient,
  tenantId: string,
  input: EmailSendInput,
): Promise<EmailSendResult> {
  if (!isValidEmail(input.to)) return skipEmail("invalid_email");

  const sender = await resolveEmailSender(admin, tenantId);
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  if (!RESEND_API_KEY) {
    const id = await logEmailMessage(admin, {
      tenantId,
      to: input.to,
      fromAddress: sender.fromAddress,
      subject: input.subject,
      html: input.html,
      text: input.text,
      status: "failed",
      errorCode: "resend_not_configured",
      triggeredBy: input.triggeredBy,
      relatedEntityType: input.relatedEntityType,
      relatedEntityId: input.relatedEntityId,
    });
    return { ok: false, status: "failed", reason: "resend_not_configured", messageId: id ?? undefined };
  }

  const resendRes = await fetch(`${RESEND_BASE}/emails`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: sender.from,
      to: [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
      reply_to: input.replyTo || sender.replyTo || undefined,
    }),
  });
  const resendData = await resendRes.json().catch(() => ({}));

  const id = await logEmailMessage(admin, {
    tenantId,
    to: input.to,
    fromAddress: sender.fromAddress,
    subject: input.subject,
    html: input.html,
    text: input.text,
    resendId: resendRes.ok ? resendData?.id : null,
    status: resendRes.ok ? "sent" : "failed",
    errorCode: resendRes.ok ? null : String(resendData?.name ?? resendData?.message ?? resendRes.status),
    triggeredBy: input.triggeredBy,
    relatedEntityType: input.relatedEntityType,
    relatedEntityId: input.relatedEntityId,
  });

  if (!resendRes.ok) {
    return {
      ok: false,
      status: "failed",
      reason: String(resendData?.name ?? resendData?.message ?? resendRes.status),
      messageId: id ?? undefined,
    };
  }
  return { ok: true, status: "sent", messageId: id ?? undefined, resendId: resendData?.id };
}

/**
 * High-level helper: dispatch one notification event across allowed channels
 * with per-channel idempotency. Workers call this once per event/recipient.
 *
 * channelToggles indicates which channels the tenant has enabled for this event.
 * Idempotency key is (tenant_id, event_key, channel) — so a successful SMS does
 * not block a later email retry.
 */
export interface DispatchInput {
  tenantId: string;
  eventKey: string; // unique per event (e.g. "on_the_way:occ_id")
  sms?: SmsSendInput | null;
  email?: EmailSendInput | null;
}

export interface DispatchResult {
  sms?: SmsSendResult;
  email?: EmailSendResult;
}

export async function dispatchNotification(
  admin: SupabaseClient,
  input: DispatchInput,
): Promise<DispatchResult> {
  const result: DispatchResult = {};

  if (input.sms) {
    const { data: prior } = await admin
      .from("notification_dispatches")
      .select("id")
      .eq("tenant_id", input.tenantId)
      .eq("event_key", input.eventKey)
      .eq("channel", "sms")
      .limit(1);
    if (prior && prior.length > 0) {
      result.sms = { ok: false, status: "skipped", reason: "already_dispatched" };
    } else {
      const r = await sendSmsServer(admin, input.tenantId, input.sms);
      result.sms = r;
      if (r.ok) {
        await admin.from("notification_dispatches").insert({
          tenant_id: input.tenantId,
          event_key: input.eventKey,
          channel: "sms",
          sms_message_id: r.messageId ?? null,
        });
      }
    }
  }

  if (input.email) {
    const { data: prior } = await admin
      .from("notification_dispatches")
      .select("id")
      .eq("tenant_id", input.tenantId)
      .eq("event_key", input.eventKey)
      .eq("channel", "email")
      .limit(1);
    if (prior && prior.length > 0) {
      result.email = { ok: false, status: "skipped", reason: "already_dispatched" };
    } else {
      const r = await sendEmailServer(admin, input.tenantId, input.email);
      result.email = r;
      if (r.ok) {
        await admin.from("notification_dispatches").insert({
          tenant_id: input.tenantId,
          event_key: input.eventKey,
          channel: "email",
          email_message_id: r.messageId ?? null,
        });
      }
    }
  }

  return result;
}

// --- helpers ---

function skip(reason: string): SmsSendResult {
  return { ok: false, status: "skipped", reason };
}
function skipEmail(reason: string): EmailSendResult {
  return { ok: false, status: "skipped", reason };
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

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export { ianaTimezone, tenantLocalHour };
