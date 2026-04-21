// Browser-initiated SMS dispatch for quote_sent / invoice_sent events.
// Routes through the centralized notification dispatcher so per-channel
// idempotency, opt-outs, and daily caps are honored — preventing the
// double-send that was possible from rapid button clicks.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { dispatchNotification } from "../_shared/notification-dispatcher.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type EntityKind = "quote" | "invoice";

interface DispatchRequest {
  kind: EntityKind;
  entity_id: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate user JWT — this endpoint is user-initiated only
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return json({ error: "Unauthorized" }, 401);
    }
    const userId = userData.user.id;

    const body = (await req.json()) as DispatchRequest;
    if (!body?.kind || !body?.entity_id) {
      return json({ error: "kind and entity_id are required" }, 400);
    }
    if (body.kind !== "quote" && body.kind !== "invoice") {
      return json({ error: "kind must be 'quote' or 'invoice'" }, 400);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);

    // Resolve tenant from caller's profile (defense in depth alongside RLS)
    const { data: profile } = await admin
      .from("profiles")
      .select("id, role, parent_admin_id")
      .eq("id", userId)
      .maybeSingle();
    const tenantId =
      profile?.role === "business_admin" ? profile.id : profile?.parent_admin_id;
    if (!tenantId) {
      return json({ error: "Tenant not resolved" }, 403);
    }

    // Load entity + verify tenant ownership + extract phone target
    const eventKey =
      body.kind === "quote" ? `quote_sent:${body.entity_id}` : `invoice_sent:${body.entity_id}`;
    const category = body.kind === "quote" ? "quote_sent" : "invoice_sent";

    let smsBody = "";
    let toPhone: string | null = null;
    let customerName = "Customer";

    if (body.kind === "quote") {
      const { data: q } = await admin
        .from("quotes")
        .select("id, tenant_id, customer_id, customer_name, quote_number")
        .eq("id", body.entity_id)
        .maybeSingle();
      if (!q || q.tenant_id !== tenantId) {
        return json({ error: "Quote not found" }, 404);
      }
      const { data: c } = await admin
        .from("customers")
        .select("phone_e164")
        .eq("id", q.customer_id)
        .maybeSingle();
      toPhone = c?.phone_e164 ?? null;
      customerName = q.customer_name || "Customer";
      smsBody = `Hi ${customerName}, your quote #${q.quote_number} is ready. Check your email for details.`;
    } else {
      const { data: inv } = await admin
        .from("invoices")
        .select("id, tenant_id, customer_id, customer_name, invoice_number, total_amount")
        .eq("id", body.entity_id)
        .maybeSingle();
      if (!inv || inv.tenant_id !== tenantId) {
        return json({ error: "Invoice not found" }, 404);
      }
      const { data: c } = await admin
        .from("customers")
        .select("phone_e164")
        .eq("id", inv.customer_id)
        .maybeSingle();
      toPhone = c?.phone_e164 ?? null;
      customerName = inv.customer_name || "Customer";
      const amt = `$${Number(inv.total_amount).toFixed(2)} `;
      smsBody = `Hi ${customerName}, invoice #${inv.invoice_number} ${amt}is ready. Check your email to view & pay.`;
    }

    if (!toPhone) {
      return json({ ok: true, sms: "skipped:no_phone" });
    }

    const result = await dispatchNotification({
      admin,
      tenantId,
      eventKey,
      eventCategory: category,
      channels: { sms: true, email: false },
      smsBody,
      toPhone,
      relatedEntityType: body.kind,
      relatedEntityId: body.entity_id,
      triggeredByUserId: userId,
      triggeredBy: category,
    });

    return json({ ok: true, ...result });
  } catch (err) {
    console.error("dispatch-entity-sms error:", err);
    return json({ error: (err as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
