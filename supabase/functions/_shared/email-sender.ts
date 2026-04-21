// Shared resolver for the "From" header used by every outgoing email.
// Per-tenant: uses settings.email_from_address / email_from_name when set,
// falls back to onboarding@resend.dev (Resend's universally-allowed sender).

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

// We don't import the generated Database type here because edge functions can't
// reach into src/. SupabaseClient<any> is sufficient and locks the surface to
// the supabase-js client API rather than `any`.
type AdminClient = SupabaseClient;

export interface ResolvedSender {
  from: string;          // formatted "Display Name <email@domain>" for Resend
  fromAddress: string;   // bare email — for logging
  fromName: string;      // display name — for logging
  isCustomDomain: boolean;
  replyTo?: string;      // tenant business_email if available
}

const FALLBACK_ADDRESS = "onboarding@resend.dev";

export async function resolveEmailSender(
  admin: AdminClient,
  tenantId: string,
): Promise<ResolvedSender> {
  const { data: settings } = await admin
    .from("settings")
    .select("email_from_address, email_from_name, business_name, business_email")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  const address = settings?.email_from_address?.trim() || null;
  const businessName = settings?.business_name?.trim() || null;
  const replyTo = settings?.business_email?.trim() || undefined;

  if (address) {
    const name = settings?.email_from_name?.trim() || businessName || "Notifications";
    return {
      from: `${name} <${address}>`,
      fromAddress: address,
      fromName: name,
      isCustomDomain: true,
      replyTo,
    };
  }

  const name = businessName || "Notifications";
  return {
    from: `${name} <${FALLBACK_ADDRESS}>`,
    fromAddress: FALLBACK_ADDRESS,
    fromName: name,
    isCustomDomain: false,
    replyTo,
  };
}

/**
 * Append-only audit log for every email send attempt across all functions.
 * Use this from send-notification-email, send-quote-email, and send-invoice-email
 * so the email log accurately reflects every outbound message.
 */
export interface EmailLogPayload {
  tenantId: string;
  to: string;
  fromAddress: string;
  subject: string;
  html?: string | null;
  text?: string | null;
  resendId?: string | null;
  status: "sent" | "failed";
  errorCode?: string | null;
  triggeredBy: string;
  relatedEntityType?: string | null;
  relatedEntityId?: string | null;
  triggeredByUserId?: string | null;
}

export async function logEmailMessage(
  admin: AdminClient,
  payload: EmailLogPayload,
): Promise<string | null> {
  const { data, error } = await admin
    .from("email_messages")
    .insert({
      tenant_id: payload.tenantId,
      to_email: payload.to,
      from_email: payload.fromAddress,
      subject: payload.subject,
      body_html: payload.html ?? null,
      body_text: payload.text ?? null,
      resend_id: payload.resendId ?? null,
      status: payload.status,
      error_code: payload.errorCode ?? null,
      triggered_by: payload.triggeredBy,
      related_entity_type: payload.relatedEntityType ?? null,
      related_entity_id: payload.relatedEntityId ?? null,
      triggered_by_user_id: payload.triggeredByUserId ?? null,
    })
    .select("id")
    .single();
  if (error) {
    console.error("logEmailMessage failed:", error.message);
    return null;
  }
  return data?.id ?? null;
}
