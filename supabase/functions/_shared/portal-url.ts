// Resolves the public-portal base URL for customer-facing share links.
// Order of precedence:
//   1. settings.public_portal_base_url (per-tenant override)
//   2. PUBLIC_PORTAL_BASE_URL env var (platform default if set)
//   3. Hardcoded fallback to the published Lovable URL (works for any tenant)

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const HARD_FALLBACK = "https://fieldflow-customer-connect.lovable.app";

export async function resolvePortalBaseUrl(
  admin: SupabaseClient,
  tenantId: string,
): Promise<string> {
  try {
    const { data } = await admin
      .from("settings")
      .select("public_portal_base_url")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    const tenantUrl = data?.public_portal_base_url?.trim();
    if (tenantUrl) return stripTrailing(tenantUrl);
  } catch (err) {
    console.warn("resolvePortalBaseUrl: settings lookup failed", err);
  }
  const envUrl = Deno.env.get("PUBLIC_PORTAL_BASE_URL")?.trim();
  if (envUrl) return stripTrailing(envUrl);
  return HARD_FALLBACK;
}

function stripTrailing(url: string): string {
  return url.replace(/\/+$/, "");
}
