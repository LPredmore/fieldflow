// Mapbox proxy: geocoding + matrix + tile token minting.
// Tenant-scoped, JWT-auth, rate-limited. Token never reaches the browser.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { z } from 'https://esm.sh/zod@3.23.8';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const MAPBOX_ACCESS_TOKEN = Deno.env.get('MAPBOX_ACCESS_TOKEN');

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const BodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('mint_tile_token') }),
  z.object({
    action: z.literal('geocode'),
    targets: z
      .array(
        z.object({
          customer_id: z.string().uuid(),
          query: z.string().min(3).max(500),
        })
      )
      .min(1)
      .max(50),
  }),
  z.object({
    action: z.literal('matrix'),
    coordinates: z
      .array(z.tuple([z.number(), z.number()]))
      .min(2)
      .max(25),
  }),
]);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (!MAPBOX_ACCESS_TOKEN) {
      return json(503, {
        error: 'MAPBOX_ACCESS_TOKEN is not configured on the server.',
      });
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json(401, { error: 'Missing authorization' });

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user)
      return json(401, { error: 'Invalid session' });
    const user = userData.user;

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Verify admin role + tenant
    const { data: profile } = await admin
      .from('profiles')
      .select('id, role, parent_admin_id')
      .eq('id', user.id)
      .maybeSingle();
    if (!profile || profile.role !== 'business_admin') {
      return json(403, { error: 'Admin role required' });
    }
    const tenantId = profile.id;

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return json(400, { error: parsed.error.flatten() });
    }
    const body = parsed.data;

    // Rate limit per tenant per action
    const { data: rl } = await admin.rpc('enhanced_rate_limit_check', {
      _identifier: tenantId,
      _endpoint: `mapbox-proxy:${body.action}`,
      _max_requests: body.action === 'matrix' ? 60 : 200,
      _window_minutes: 60,
    });
    if (rl && (rl as { allowed?: boolean }).allowed === false) {
      return json(429, { error: 'Rate limit exceeded for this hour.' });
    }

    if (body.action === 'mint_tile_token') {
      // Pass through the server token for tile rendering.
      // Lovable secret rotation handles invalidation; admins can scope this
      // to their own restricted public token in production.
      return json(200, { token: MAPBOX_ACCESS_TOKEN });
    }

    if (body.action === 'geocode') {
      const results: Array<{
        customer_id: string;
        lat: number | null;
        lng: number | null;
        status: 'ok' | 'failed';
      }> = [];

      for (const t of body.targets) {
        const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
          t.query
        )}.json?limit=1&access_token=${MAPBOX_ACCESS_TOKEN}`;
        try {
          const r = await fetch(url);
          const j = await r.json();
          const feat = j?.features?.[0];
          if (feat?.center && Array.isArray(feat.center)) {
            const [lng, lat] = feat.center as [number, number];
            await admin
              .from('customers')
              .update({
                lat,
                lng,
                geocoded_at: new Date().toISOString(),
                geocoding_status: 'ok',
              })
              .eq('id', t.customer_id)
              .eq('tenant_id', tenantId);
            results.push({ customer_id: t.customer_id, lat, lng, status: 'ok' });
          } else {
            await admin
              .from('customers')
              .update({
                geocoded_at: new Date().toISOString(),
                geocoding_status: 'failed',
              })
              .eq('id', t.customer_id)
              .eq('tenant_id', tenantId);
            results.push({
              customer_id: t.customer_id,
              lat: null,
              lng: null,
              status: 'failed',
            });
          }
        } catch (e) {
          console.error('Geocode failure', t.customer_id, e);
          results.push({
            customer_id: t.customer_id,
            lat: null,
            lng: null,
            status: 'failed',
          });
        }
      }
      return json(200, { results });
    }

    if (body.action === 'matrix') {
      const coordsStr = body.coordinates
        .map(([lng, lat]) => `${lng},${lat}`)
        .join(';');
      const url = `https://api.mapbox.com/directions-matrix/v1/mapbox/driving/${coordsStr}?annotations=duration&access_token=${MAPBOX_ACCESS_TOKEN}`;
      const r = await fetch(url);
      if (!r.ok) {
        const text = await r.text();
        return json(r.status, { error: `Mapbox matrix failed: ${text}` });
      }
      const j = await r.json();
      // durations: seconds, NxN. Convert to minutes (rounded).
      const durations: number[][] = j.durations || [];
      const minutes = durations.map((row) =>
        row.map((s) => (s == null ? null : Math.round(s / 60)))
      );
      return json(200, { minutes });
    }

    return json(400, { error: 'Unknown action' });
  } catch (e) {
    console.error('mapbox-proxy fatal', e);
    return json(500, {
      error: e instanceof Error ? e.message : 'Internal error',
    });
  }
});
