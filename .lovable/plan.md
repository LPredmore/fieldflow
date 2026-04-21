

## Route Optimization & Dispatch Board

### What changes for the user

A new **Dispatch** page (`/dispatch`) for business admins, designed for "morning planning" of one day at a time:

- **Left rail**: a day picker, contractor list (one swimlane per contractor + an "Unassigned" lane), and an "Optimize day" button per lane.
- **Center**: a day timeline with each contractor's jobs as draggable cards. Drag a card vertically to change its time, drag horizontally between lanes to **reassign to a different contractor**. Each card shows ETA from previous stop and a small drive-time pill.
- **Right**: a **map** of all of today's jobs, color-coded by contractor, with numbered pins matching the timeline order. Selecting a card highlights its pin (and vice versa).
- **Per-lane "Optimize"**: re-sequences that contractor's day by nearest-neighbor from their start location, recomputes start times honoring duration + drive-time + a configurable buffer, and lets the admin **Preview → Apply** before any DB write.
- Customers and contractors get **geocoded once** when their address changes; a banner shows how many addresses still need geocoding and offers a "Geocode all" action.
- ETAs are computed from a real routing service (driving distance, not straight line) and cached so we don't re-bill the API on every render.

The existing `/calendar` page remains untouched — Dispatch is the day-planning tool, Calendar is the week/month overview.

### Definitive technical decision

**Build a tenant-installable Mapbox-backed dispatch board: store lat/lng on `customers` and `profiles`, use Mapbox Geocoding + Mapbox Directions Matrix for ETAs, render with `react-map-gl` + `mapbox-gl`, and run the optimizer client-side as nearest-neighbor with 2-opt polish. No new edge function for the optimizer; one new edge function for geocoding/matrix proxying so the Mapbox token never ships to the browser.**

Why this and not the alternatives:

1. **Mapbox over Google Maps / OpenStreetMap+OSRM.**
   - Google Maps: best data, but its Terms of Service forbid persisting geocoded results, which makes the "geocode once, cache forever" pattern non-compliant. It also requires a billing account up front and a much heavier JS bundle.
   - OSRM/Nominatim (free OSM): no per-call cost, but Nominatim's usage policy caps at ~1 req/sec and forbids bulk geocoding without a self-hosted instance — a non-starter for a dispatch board where an admin may geocode 200 customers in one go. OSRM also has no first-class React bindings.
   - **Mapbox**: explicitly permits caching geocoding results indefinitely for paying customers, has a generous free tier (100k geocodes/mo, 100k matrix elements/mo), an official `react-map-gl` binding, a single Matrix API call returns an N×N drive-time grid (perfect for nearest-neighbor), and a single token model that's easy to gate behind an edge function. It is the right fit.

2. **Persist `lat`/`lng` on `customers` (and `profiles` for contractors), don't geocode on the fly.** Geocoding is rate-limited and metered. Storing the coordinates means the dispatch board, optimizer, map markers, and ETA matrix all read from the database with zero external calls in the steady state. We re-geocode only when the address text actually changes (detected in a trigger).

3. **Edge function proxy for Mapbox, not a public token in the browser.** A public `pk.*` Mapbox token can be domain-restricted but still leaks tenant-level usage to anyone who views source. A short-lived proxy through `mapbox-proxy` edge function lets us (a) keep one secret server-side, (b) per-tenant rate-limit using the existing `enhanced_rate_limit_check` function, (c) log usage, and (d) swap providers later without touching the client. The map *tiles* still need a token in the browser — we'll mint a temporary, scoped public token via the proxy on session start so it's never hard-coded.

4. **Client-side optimizer (nearest-neighbor + 2-opt) over a server-side TSP solver.** A typical contractor's day is 4–12 stops. NN+2-opt on ≤15 nodes runs in microseconds in the browser, lets the admin see "what if I reassign job X to Bob?" instantly, and avoids a network round-trip per drag. The Mapbox Matrix call (one per lane, on demand) provides the drive-time distances; the optimizer is pure TypeScript. A real OR-tools server-side solver would be overkill at this scale and would block the snappy drag UX.

5. **Single new "Dispatch" page, NOT a new view inside FullCalendar.** FullCalendar resource-timeline (the swimlane view) is a paid Premium plugin (~$480/yr per dev) and FullCalendar has no concept of a side-by-side map. Building a purpose-made grid (CSS grid + `@dnd-kit/core`) is cheaper, fully owned, and matches the bespoke dispatch UIs in ServiceTitan / Jobber that the user is implicitly modeling against.

6. **`@dnd-kit/core` over `react-beautiful-dnd` or HTML5 native DnD.** `react-beautiful-dnd` is unmaintained (Atlassian archived it Apr 2024) and conflicts with React 18 strict mode. HTML5 native DnD has terrible mobile support and no keyboard accessibility. `@dnd-kit` is actively maintained, accessible, mobile-friendly, ~10kb, and is what the rest of the modern React ecosystem is converging on.

7. **Reassignment writes through existing `job_occurrences.assigned_to_user_id`.** The RLS policy already allows admins to update any tenant occurrence ("Allow authenticated users to update within their tenant" + role check via profiles join). No schema change needed for the reassignment path itself — drag-and-drop calls the same `useCalendarJobs.updateJob` already used elsewhere, plus a time shift via `start_at` / `end_at`.

### Data model

```text
customers:
  + lat                 numeric  null
  + lng                 numeric  null
  + geocoded_at         timestamptz null
  + geocoding_status    text     null   ('ok' | 'failed' | 'manual' | null)
  + address_hash        text     null   (md5 of normalized address; trigger sets this)

profiles:
  + home_base_address   jsonb    null   (contractor "start of day" location)
  + home_base_lat       numeric  null
  + home_base_lng       numeric  null
  + geocoded_at         timestamptz null

job_occurrences:
  + dispatch_sequence   integer  null   (1-based order within day for the assignee)
  + drive_minutes_from_prev integer null  (cached ETA for display; recomputed on optimize)

settings.system_settings (jsonb):
  + dispatch: { default_buffer_minutes: 10, day_start_hour: 8 }
```

Triggers:
- `customers_address_hash_trigger` — on insert/update, normalize street+city+state+zip, hash, and if the hash changed clear `lat/lng/geocoded_at` so the worker re-geocodes.
- Same for `profiles.home_base_address`.

RPC: `get_unbatched_geocoding_targets(_limit int)` returns rows where `lat is null` for the caller's tenant — used by the geocoding worker so we never ship the customer list to the edge function.

### Edge functions

```text
mapbox-proxy/index.ts        single function with three actions:
  - { action: 'mint_tile_token' }     -> short-lived public token for map tiles
  - { action: 'geocode', addresses }  -> server-side Mapbox Geocoding, writes lat/lng back
  - { action: 'matrix', coordinates } -> Mapbox Directions Matrix, returns N×N minutes

  All three: JWT-auth, tenant-scoped, rate-limited via enhanced_rate_limit_check,
  CORS via @supabase/supabase-js/cors, Zod-validated input.
```

No cron is needed: geocoding is invoked from the UI (Dispatch banner "Geocode 12 customers") or implicitly from the customer form when an admin saves a new address. Matrix is invoked on demand when the user clicks Optimize or first opens the dispatch board for a day.

### UI surface

```text
src/pages/Dispatch.tsx                     new page, admin-only
src/components/Dispatch/
  DispatchBoard.tsx                        layout shell
  ContractorLane.tsx                       one row per contractor + Unassigned
  JobCard.tsx                              draggable job, shows time + drive ETA
  DispatchMap.tsx                          react-map-gl wrapper
  GeocodingBanner.tsx                      "12 customers need geocoding"
  OptimizeButton.tsx                       per-lane "Optimize" with preview dialog
src/hooks/
  useDispatchDay.tsx                       loads jobs + contractors + lat/lng for a date
  useMapboxProxy.tsx                       wraps the edge function (mint, geocode, matrix)
  useRouteOptimizer.tsx                    pure TS NN + 2-opt; takes Matrix output
src/lib/
  geocoding.ts                             address normalization + hash helpers
  routeOptimizer.ts                        nearest-neighbor + 2-opt, fully unit-testable
```

Navigation: add **Dispatch** item between Jobs and Calendar in `Navigation.tsx`, gated by `canAccessSettings(userRole)` (admin-only — contractors don't dispatch other contractors).

### "Other route-optimization improvements" found in the review

These come out of reading the existing system and are folded into the same feature so we don't make a half-step:

1. **Customer form: capture lat/lng at entry.** Add a "Verify address on map" mini-map to `CustomerForm.tsx` that calls the geocoder and shows a draggable pin. Stops bad addresses from polluting the dispatch board later.
2. **Job creation: show drive distance from previously-scheduled job for the same contractor on the same day.** Tiny line in `JobForm.tsx`: "Adds ~14 min drive from prior job."
3. **Calendar (existing): color jobs by contractor**, not by status. Status is already conveyed by an icon; contractor color is the dispatch signal an admin needs at a glance. Behind a toggle so today's behavior is preserved.
4. **`time_entries.clock_in_lat/lng` is already collected — surface "last known location" of each contractor on the dispatch map** as a faded marker, so an admin can see where each crew currently is. Free reuse of existing data, no new ingestion.
5. **Customer search by proximity.** With lat/lng populated, the Customers page gains a "near address X" filter (uses Haversine in SQL via a simple RPC; no Mapbox call). Useful when scheduling a new request near an existing route.
6. **Per-tenant Mapbox usage cap in `settings`.** Surface a small counter ("8.4k of 100k geocodes used this month") on the Dispatch page so a busy tenant isn't surprised by an overage; the proxy enforces the cap.

### Edge cases handled

- **No Mapbox key configured for the project.** Dispatch page renders, but map area shows "Add a Mapbox token in Settings → System to enable map view and ETAs." The drag-and-drop reassignment swimlane still works (it doesn't need the map). This keeps the feature functional for tenants who haven't onboarded the integration yet.
- **Customer with no address.** Pin omitted from map; card shows "📍 No address — won't be optimized" and is excluded from the matrix call. Admin can still drag it.
- **Geocoding fails for an address.** `geocoding_status='failed'` is stored; banner offers manual pin-drop on the verify-address mini-map.
- **Contractor with no `home_base_*`.** Optimizer falls back to "start at the first scheduled job's location"; admin sees a one-time tooltip suggesting they set a home base in their profile for better ETAs.
- **>15 stops in one lane.** Optimizer caps NN+2-opt at 15 nodes; for larger days it greedy-batches by region (k-means on coords with k = ceil(n/12)) then optimizes within each batch. This is rare and the cap message tells the admin.
- **Reassignment crosses tenants/roles.** Impossible by RLS — the swimlanes only render contractors in `get_user_tenant_id()`, and the update goes through the existing tenant-scoped policy.
- **Time-zone correctness.** All scheduling math uses Luxon with `job_series.timezone`, identical to `useCalendarJobs`. Optimizer outputs `start_at` in UTC.
- **Concurrent edits.** The Optimize "Preview → Apply" dialog re-fetches the day right before applying; if anything changed (other admin moved a job) we abort and show a diff. Cheap, prevents lost updates.
- **Mapbox quota exhausted.** Proxy returns 429; UI degrades to "ETAs unavailable, drag to manually re-time" and disables Optimize for the rest of the billing cycle. Reassignment still works.

### Files to create / change

```text
supabase/migrations/<ts>_dispatch_geocoding.sql        new (columns, triggers, RPC, RLS unchanged)
supabase/functions/mapbox-proxy/index.ts               new (geocode + matrix + tile token)

src/pages/Dispatch.tsx                                 new
src/components/Dispatch/*.tsx                          new (6 files listed above)
src/hooks/useDispatchDay.tsx                           new
src/hooks/useMapboxProxy.tsx                           new
src/lib/routeOptimizer.ts                              new
src/lib/geocoding.ts                                   new

src/App.tsx                                            add /dispatch route, lazy-loaded, admin-gated
src/components/Layout/Navigation.tsx                   add Dispatch nav item (admin-only)
src/components/Customers/CustomerForm.tsx              add mini-map address verifier
src/components/Jobs/JobForm.tsx                        add "drive from prior job" hint
src/components/Calendar/EnhancedCalendar.tsx           optional "color by contractor" toggle
src/components/Settings/SystemSettings.tsx             add Mapbox token field + dispatch defaults
package.json                                           add mapbox-gl, react-map-gl, @dnd-kit/core, @dnd-kit/sortable
```

### Required user action before this works

The user will need to provide a **`MAPBOX_ACCESS_TOKEN`** secret (a server-side `sk.*` token with Geocoding, Directions Matrix, and Tilesets:Read scopes). I'll request it via the secrets tool as the first step of implementation, before deploying `mapbox-proxy`. No other external accounts are needed — Stripe, Resend, OpenAI, etc. remain untouched.

### Explicitly NOT included (and why)

- **Live GPS tracking of contractors mid-route.** Requires a mobile app or background-geolocation web flow (battery, permissions, privacy review). The "last clock-in location" surfacing gives 80% of the value for 0% of the new infrastructure.
- **Customer-facing "your tech is N minutes away" notifications.** Requires the live tracking above, plus SMS/Resend integration design. Belongs in a follow-up.
- **Multi-day route planning / week-view optimization.** Out of scope; the dispatch board is explicitly a one-day morning-planning tool, which is the dominant SMB-trade workflow.
- **Skill-based assignment constraints** (e.g., "only HVAC-certified contractors can take HVAC jobs). The data model doesn't yet have skills/certifications; tackle when that's introduced.

