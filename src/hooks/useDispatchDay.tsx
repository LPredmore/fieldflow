import { useEffect, useMemo, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';

export interface DispatchContractor {
  id: string;
  full_name: string | null;
  email: string | null;
  home_base_lat: number | null;
  home_base_lng: number | null;
  last_known_lat?: number | null;
  last_known_lng?: number | null;
  last_known_at?: string | null;
}

export interface DispatchJob {
  id: string;
  series_id: string;
  customer_id: string;
  customer_name: string;
  start_at: string;
  end_at: string;
  assigned_to_user_id: string | null;
  status: string;
  dispatch_sequence: number | null;
  drive_minutes_from_prev: number | null;
  // resolved customer info
  customer_lat: number | null;
  customer_lng: number | null;
  customer_address?: Record<string, string | null> | null;
  override_title?: string | null;
  series_title?: string | null;
}

interface UseDispatchDayResult {
  loading: boolean;
  error: string | null;
  date: string;
  setDate: (d: string) => void;
  contractors: DispatchContractor[];
  jobs: DispatchJob[];
  needsGeocodingCount: number;
  refresh: () => Promise<void>;
}

const ymd = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export function useDispatchDay(): UseDispatchDayResult {
  const { user } = useAuth();
  const [date, setDate] = useState<string>(ymd(new Date()));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contractors, setContractors] = useState<DispatchContractor[]>([]);
  const [jobs, setJobs] = useState<DispatchJob[]>([]);
  const [needsGeocodingCount, setNeedsGeocodingCount] = useState(0);

  const dayBounds = useMemo(() => {
    const start = new Date(`${date}T00:00:00`);
    const end = new Date(`${date}T23:59:59`);
    return { startISO: start.toISOString(), endISO: end.toISOString() };
  }, [date]);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      // Contractors in tenant (admin + admin's contractors)
      const { data: contractorRows, error: cErr } = await supabase
        .from('profiles')
        .select(
          'id, full_name, email, role, parent_admin_id, home_base_lat, home_base_lng'
        )
        .or(`id.eq.${user.id},parent_admin_id.eq.${user.id}`);
      if (cErr) throw cErr;
      const contractorList: DispatchContractor[] = (contractorRows || [])
        .filter((p) => p.role === 'contractor' || p.id === user.id)
        .map((p) => ({
          id: p.id,
          full_name: p.full_name,
          email: p.email,
          home_base_lat: p.home_base_lat,
          home_base_lng: p.home_base_lng,
        }));

      // Day occurrences with series and customer joined
      const { data: occs, error: oErr } = await supabase
        .from('job_occurrences')
        .select(
          `id, series_id, customer_id, customer_name, start_at, end_at,
           assigned_to_user_id, status, dispatch_sequence, drive_minutes_from_prev,
           override_title,
           job_series:series_id ( title ),
           customers:customer_id ( lat, lng, address )`
        )
        .gte('start_at', dayBounds.startISO)
        .lte('start_at', dayBounds.endISO)
        .order('start_at', { ascending: true });
      if (oErr) throw oErr;

      const dispatchJobs: DispatchJob[] = (occs || []).map((o: {
        id: string;
        series_id: string;
        customer_id: string;
        customer_name: string;
        start_at: string;
        end_at: string;
        assigned_to_user_id: string | null;
        status: string;
        dispatch_sequence: number | null;
        drive_minutes_from_prev: number | null;
        override_title: string | null;
        job_series?: { title?: string } | null;
        customers?: { lat: number | null; lng: number | null; address: Record<string, string | null> | null } | null;
      }) => ({
        id: o.id,
        series_id: o.series_id,
        customer_id: o.customer_id,
        customer_name: o.customer_name,
        start_at: o.start_at,
        end_at: o.end_at,
        assigned_to_user_id: o.assigned_to_user_id,
        status: o.status,
        dispatch_sequence: o.dispatch_sequence,
        drive_minutes_from_prev: o.drive_minutes_from_prev,
        override_title: o.override_title,
        series_title: o.job_series?.title ?? null,
        customer_lat: o.customers?.lat ?? null,
        customer_lng: o.customers?.lng ?? null,
        customer_address: o.customers?.address ?? null,
      }));

      // Last known location per contractor (most recent clock_in_at with coords)
      const ids = contractorList.map((c) => c.id);
      if (ids.length) {
        const { data: tes } = await supabase
          .from('time_entries')
          .select('user_id, clock_in_at, clock_in_lat, clock_in_lng')
          .in('user_id', ids)
          .not('clock_in_lat', 'is', null)
          .order('clock_in_at', { ascending: false })
          .limit(200);
        const seen = new Set<string>();
        for (const t of tes || []) {
          if (seen.has(t.user_id)) continue;
          seen.add(t.user_id);
          const c = contractorList.find((x) => x.id === t.user_id);
          if (c) {
            c.last_known_lat = t.clock_in_lat;
            c.last_known_lng = t.clock_in_lng;
            c.last_known_at = t.clock_in_at;
          }
        }
      }

      // Geocoding banner count
      const { data: geoTargets } = await supabase.rpc(
        'get_unbatched_geocoding_targets',
        { _limit: 200 }
      );

      setContractors(contractorList);
      setJobs(dispatchJobs);
      setNeedsGeocodingCount((geoTargets || []).length);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load dispatch';
      console.error(e);
      setError(msg);
      toast({ title: 'Dispatch load failed', description: msg, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [user, dayBounds.startISO, dayBounds.endISO]);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    loading,
    error,
    date,
    setDate,
    contractors,
    jobs,
    needsGeocodingCount,
    refresh: load,
  };
}
