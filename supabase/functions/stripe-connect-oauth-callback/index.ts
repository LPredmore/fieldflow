import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import Stripe from "https://esm.sh/stripe@17.5.0?target=deno";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: "2024-12-18.acacia",
  httpClient: Stripe.createFetchHttpClient(),
});

const enc = new TextEncoder();

function b64urlDecode(s: string): Uint8Array {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function b64url(bytes: Uint8Array): string {
  let s = btoa(String.fromCharCode(...bytes));
  return s.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function hmacSign(payload: string, key: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(payload));
  return b64url(new Uint8Array(sig));
}

async function verifyState(
  state: string,
  key: string
): Promise<{ tenant_id: string; user_id: string; exp: number } | null> {
  const [body, sig] = state.split(".");
  if (!body || !sig) return null;
  const expected = await hmacSign(body, key);
  if (expected !== sig) return null;
  const json = new TextDecoder().decode(b64urlDecode(body));
  const payload = JSON.parse(json);
  if (payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

function htmlRedirect(url: string): Response {
  return new Response(null, {
    status: 302,
    headers: { Location: url },
  });
}

function getAppOrigin(req: Request): string {
  const referer = req.headers.get("referer");
  if (referer) {
    try {
      return new URL(referer).origin;
    } catch {}
  }
  // fallback to common production guess - user can override via state if needed
  return "https://fieldflow-customer-connect.lovable.app";
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const errorParam = url.searchParams.get("error");
  const appOrigin = getAppOrigin(req);

  if (errorParam) {
    return htmlRedirect(
      `${appOrigin}/settings?tab=financial&stripe=error&reason=${encodeURIComponent(errorParam)}`
    );
  }

  if (!code || !state) {
    return htmlRedirect(
      `${appOrigin}/settings?tab=financial&stripe=error&reason=missing_params`
    );
  }

  try {
    const verified = await verifyState(state, STRIPE_SECRET_KEY);
    if (!verified) {
      return htmlRedirect(
        `${appOrigin}/settings?tab=financial&stripe=error&reason=invalid_state`
      );
    }

    const { tenant_id, user_id } = verified;

    // Exchange code for stripe_user_id
    const tokenResponse = await stripe.oauth.token({
      grant_type: "authorization_code",
      code,
    });

    const stripeAccountId = tokenResponse.stripe_user_id!;

    // Retrieve account details
    const account = await stripe.accounts.retrieve(stripeAccountId);

    // Service-role upsert
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Re-verify role server-side
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", user_id)
      .eq("role", "business_admin")
      .maybeSingle();
    let isAdmin = !!roleRow;
    if (!isAdmin) {
      const { data: profile } = await admin
        .from("profiles")
        .select("role")
        .eq("id", user_id)
        .maybeSingle();
      isAdmin = profile?.role === "business_admin";
    }
    if (!isAdmin) {
      return htmlRedirect(
        `${appOrigin}/settings?tab=financial&stripe=error&reason=forbidden`
      );
    }

    // Upsert (one row per tenant)
    const { data: existing } = await admin
      .from("stripe_connected_accounts")
      .select("id")
      .eq("tenant_id", tenant_id)
      .maybeSingle();

    const row = {
      tenant_id,
      created_by_user_id: user_id,
      stripe_account_id: stripeAccountId,
      account_email: account.email ?? null,
      display_name:
        (account as any).business_profile?.name ??
        (account as any).settings?.dashboard?.display_name ??
        null,
      charges_enabled: account.charges_enabled ?? false,
      payouts_enabled: account.payouts_enabled ?? false,
      connected_at: new Date().toISOString(),
      disconnected_at: null,
      updated_at: new Date().toISOString(),
    };

    if (existing) {
      await admin
        .from("stripe_connected_accounts")
        .update(row)
        .eq("id", existing.id);
    } else {
      await admin.from("stripe_connected_accounts").insert(row);
    }

    return htmlRedirect(`${appOrigin}/settings?tab=financial&stripe=connected`);
  } catch (err: any) {
    console.error("oauth-callback error:", err);
    return htmlRedirect(
      `${appOrigin}/settings?tab=financial&stripe=error&reason=${encodeURIComponent(err.message ?? "exception")}`
    );
  }
});
