// useCalendarJobs.tsx
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useUserTimezone } from './useUserTimezone';
import { convertFromUTC } from '@/lib/timezoneUtils';
import { useToast } from '@/hooks/use-toast';

export interface CalendarJob {
  id: string;
  series_id: string;
  title: string;
  description?: string;
  start_at: string; // UTC timestamp
  end_at: string;   // UTC timestamp
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  customer_id: string;
  customer_name: string;
  assigned_to_user_id?: string;
  estimated_cost?: number;
  actual_cost?: number;
  completion_notes?: string;
  created_at: string;
  updated_at?: string;
  tenant_id: string;
  // Derived fields for display (local timezone Date objects)
  local_start?: Date;
  local_end?: Date;
}

// Inclusive start (fromISO) and exclusive end (toISO)
type CalendarRange = { fromISO: string; toISO: string };

function iso(d: Date) {
  return new Date(d.getTime() - (d.getMilliseconds())).toISOString();
}

function defaultRange(): CalendarRange {
  const now = new Date();
  const from = new Date(now);
  from.setDate(from.getDate() - 7);        // show 1 week back
  const to = new Date(now);
  to.setDate(to.getDate() + 90);           // and ~3 months ahead
  return { fromISO: iso(from), toISO: iso(to) };
}

/**
 * Hook to fetch calendar jobs from job_occurrences only.
 * All jobs (single and recurring) are materialized in job_occurrences.
 */
export function useCalendarJobs() {
  const [jobs, setJobs] = useState<CalendarJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<CalendarRange>(() => {
    const initialRange = defaultRange();
    console.log('🚀 Initial calendar range:', initialRange);
    return initialRange;
  });
  const { user, tenantId } = useAuth();
  const userTimezone = useUserTimezone();
  const { toast } = useToast();
  const fetchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastFetchRangeRef = useRef<string>('');

  const fetchJobs = useCallback(async () => {
    if (!user || !tenantId) {
      setJobs([]);
      setLoading(false);
      return;
    }

    const rangeKey = `${range.fromISO}-${range.toISO}`;
    
    // Prevent duplicate fetches for the same range
    if (rangeKey === lastFetchRangeRef.current) {
      console.log('🔄 Skipping duplicate fetch for range:', rangeKey);
      return;
    }
    
    lastFetchRangeRef.current = rangeKey;

    console.log('📊 fetchJobs called with range:', {
      fromISO: range.fromISO,
      toISO: range.toISO,
      tenantId,
      rangeSpanDays: Math.ceil((new Date(range.toISO).getTime() - new Date(range.fromISO).getTime()) / (1000 * 60 * 60 * 24))
    });

    try {
      setLoading(true);

      // Pull occurrences for the tenant, bounded by date range
      const { data, error } = await supabase
        .from('job_occurrences')
        .select(`
          id,
          series_id,
          start_at,
          end_at,
          status,
          priority,
          customer_id,
          customer_name,
          assigned_to_user_id,
          completion_notes,
          actual_cost,
          override_title,
          override_description,
          override_estimated_cost,
          created_at,
          updated_at,
          tenant_id,
          job_series!inner(
            title,
            description,
            estimated_cost,
            service_type
          )
        `)
        .eq('tenant_id', tenantId)
        .gte('start_at', range.fromISO)
        .lt('start_at', range.toISO)
        .order('start_at', { ascending: true });

      if (error) {
        console.error('Error fetching calendar jobs:', error);
        toast({
          variant: 'destructive',
          title: 'Error loading calendar',
          description: error.message,
        });
        setJobs([]);
        return;
      }

      console.log('✅ Supabase query returned:', {
        recordCount: data?.length || 0,
        queryWindow: { from: range.fromISO, to: range.toISO },
        sampleDates: data?.slice(0, 3).map(job => ({ id: job.id, start_at: job.start_at })) || []
      });

      // Keep UTC for the calendar component; add local Date objects for other displays
      const transformed: CalendarJob[] = (data || []).map((row: any) => {
        const series = row.job_series;
        const localStart = convertFromUTC(row.start_at, userTimezone);
        const localEnd = convertFromUTC(row.end_at, userTimezone);

        return {
          id: row.id,
          series_id: row.series_id,
          title: row.override_title || series?.title || 'Untitled Job',
          description: row.override_description || series?.description,
          start_at: row.start_at,
          end_at: row.end_at,
          status: row.status,
          priority: row.priority,
          customer_id: row.customer_id,
          customer_name: row.customer_name,
          assigned_to_user_id: row.assigned_to_user_id,
          estimated_cost: row.override_estimated_cost ?? series?.estimated_cost,
          actual_cost: row.actual_cost,
          completion_notes: row.completion_notes,
          created_at: row.created_at,
          updated_at: row.updated_at,
          tenant_id: row.tenant_id,
          local_start: localStart,
          local_end: localEnd,
        };
      });

      setJobs(transformed);
      
      console.log('🎯 Jobs state updated:', {
        jobCount: transformed.length,
        dateRange: transformed.length > 0 ? {
          earliest: Math.min(...transformed.map(j => new Date(j.start_at).getTime())),
          latest: Math.max(...transformed.map(j => new Date(j.start_at).getTime()))
        } : 'no jobs',
        currentRange: { from: range.fromISO, to: range.toISO }
      });
    } catch (err: any) {
      console.error('Error in fetchJobs:', err);
      toast({
        variant: 'destructive',
        title: 'Error loading calendar',
        description: err.message ?? String(err),
      });
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }, [user, tenantId, userTimezone, range.fromISO, range.toISO, toast]);

  // Step 5: Debug range updates
  useEffect(() => {
    console.log('📏 Range state updated:', {
      fromISO: range.fromISO,
      toISO: range.toISO,
      spanDays: Math.ceil((new Date(range.toISO).getTime() - new Date(range.fromISO).getTime()) / (1000 * 60 * 60 * 24))
    });
  }, [range.fromISO, range.toISO]);

  const updateJob = useCallback(
    async (jobId: string, updates: Partial<CalendarJob>) => {
      if (!user || !tenantId) throw new Error('User not authenticated');

      // Strip display-only fields
      const { local_start, local_end, ...dbUpdates } = updates;

      const { data, error } = await supabase
        .from('job_occurrences')
        .update(dbUpdates)
        .eq('id', jobId)
        .eq('tenant_id', tenantId)
        .select()
        .single();

      if (error) {
        console.error('Error updating job:', error);
        throw error;
      }

      toast({ title: 'Job updated', description: 'The job has been successfully updated.' });
      await fetchJobs();
      return data;
    },
    [user, tenantId, toast, fetchJobs]
  );

  const deleteJob = useCallback(
    async (jobId: string) => {
      if (!user || !tenantId) throw new Error('User not authenticated');

      const { error } = await supabase
        .from('job_occurrences')
        .delete()
        .eq('id', jobId)
        .eq('tenant_id', tenantId);

      if (error) {
        console.error('Error deleting job:', error);
        throw error;
      }

      toast({ title: 'Job deleted', description: 'The job has been successfully deleted.' });
      await fetchJobs();
    },
    [user, tenantId, toast, fetchJobs]
  );

  // Debounced effect to prevent rapid-fire fetches
  useEffect(() => {
    // Clear any existing timeout
    if (fetchTimeoutRef.current) {
      clearTimeout(fetchTimeoutRef.current);
    }
    
    // Set a new timeout to debounce the fetch
    fetchTimeoutRef.current = setTimeout(() => {
      fetchJobs();
    }, 300); // 300ms debounce
    
    // Cleanup timeout on unmount
    return () => {
      if (fetchTimeoutRef.current) {
        clearTimeout(fetchTimeoutRef.current);
      }
    };
  }, [fetchJobs]);

  // Enhanced setRange with duplicate prevention
  const setRangeDebounced = useCallback((newRange: CalendarRange) => {
    const newRangeKey = `${newRange.fromISO}-${newRange.toISO}`;
    const currentRangeKey = `${range.fromISO}-${range.toISO}`;
    
    if (newRangeKey === currentRangeKey) {
      console.log('🔄 Ignoring duplicate range update:', newRangeKey);
      return;
    }
    
    console.log('📏 Range update accepted:', {
      from: currentRangeKey,
      to: newRangeKey
    });
    
    setRange(newRange);
  }, [range.fromISO, range.toISO]);

  return {
    jobs,
    loading,
    refetch: fetchJobs,
    updateJob,
    deleteJob,
    // Optional range control for callers (e.g., wire to calendar visible window)
    range,
    setRange: setRangeDebounced,
  };
}
