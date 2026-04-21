// Shared resolver for the "From" header used by every outgoing email.
// Per-tenant: uses settings.email_from_address / email_from_name when set,
// falls back to onboarding@resend.dev (Resend's universally-allowed sender).

// deno-lint-ignore no-explicit-any
type AdminClient = any;

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
