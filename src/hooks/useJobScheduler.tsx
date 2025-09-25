import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useUserTimezone } from "./useUserTimezone";
import { useToast } from "@/hooks/use-toast";
import {
  combineDateTimeToUTC,
  convertFromUTC,
} from "@/lib/timezoneUtils";

/**
 * Unified scheduler hook:
 * - Source of truth for the calendar is `job_occurrences` (one-off + recurring instances)
 * - Creates a `job_series` for every job (is_recurring controls RRULE)
 * - For one-off jobs: also inserts exactly one row in `job_occurrences`
 * - For recurring jobs: calls the `generate-job-occurrences` Edge Function to (re)materialize a horizon
 *
 * NOTE: Calendar components should use `useCalendarJobs` for calendar display functionality.
 */

export type JobStatus = "scheduled" | "in_progress" | "completed" | "cancelled";
export type JobPriority = "low" | "medium" | "high" | "urgent";

export interface ScheduledJob {
  id: string; // occurrence id
  series_id: string;
  tenant_id: string;
  customer_id: string;
  customer_name: string;
  assigned_to_user_id?: string | null;
  title: string;
  description?: string | null;
  start_at: string; // UTC ISO
  end_at: string;   // UTC ISO
  status: JobStatus;
  priority: JobPriority;
  estimated_cost?: number | null;
  actual_cost?: number | null;
  completion_notes?: string | null;
  job_type: "one_time" | "recurring_instance";
  created_at?: string;
  updated_at?: string;
  // convenience for non-calendar displays:
  local_start?: string;
  local_end?: string;
  service_type?: string | null;
}

export interface CreateJobInput {
  // shared
  title: string;
  customer_id: string;
  customer_name: string;
  description?: string;
  priority?: JobPriority;
  duration_minutes?: number;
  assigned_to_user_id?: string | null;
  estimated_cost?: number;
  service_type?: string;

  // times supplied from UI (local)
  // we accept either (date,time) or (scheduled_date,start_time)
  date?: string;           // "YYYY-MM-DD"
  time?: string;           // "HH:mm"
  scheduled_date?: string; // alias of date
  start_time?: string;     // alias of time

  // non-recurring
  is_recurring?: boolean;
  // recurring
  rrule?: string | null;
  until_date?: string | null; // optional end date in UI schema
}

export function useJobScheduler() {
  const [jobs, setJobs] = useState<ScheduledJob[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const { user, tenantId } = useAuth();
  const userTimezone = useUserTimezone();
  const { toast } = useToast();

  /**
   * Internal helper to map DB rows (occurrence + series) -> ScheduledJob
   */
  const mapRowToJob = useCallback(
    (row: any): ScheduledJob => {
      const title = row.job_series?.title ?? "Untitled Job";
      const description = row.job_series?.description ?? null;
      const job_type = row.job_series?.is_recurring ? "recurring_instance" : "one_time";

      const local_start = convertFromUTC(row.start_at, userTimezone);
      const local_end = convertFromUTC(row.end_at, userTimezone);

      return {
        id: row.id,
        series_id: row.series_id,
        tenant_id: row.tenant_id,
        customer_id: row.customer_id,
        customer_name: row.customer_name,
        assigned_to_user_id: row.assigned_to_user_id,
        title,
        description,
        start_at: row.start_at,
        end_at: row.end_at,
        status: row.status as JobStatus,
        priority: (row.priority ?? "medium") as JobPriority,
        estimated_cost: row.job_series?.estimated_cost ?? null,
        actual_cost: row.actual_cost ?? null,
        completion_notes: row.completion_notes ?? null,
        job_type,
        created_at: row.created_at,
        updated_at: row.updated_at,
        local_start: local_start.toISOString(),
        local_end: local_end.toISOString(),
        service_type: row.job_series?.service_type ?? null,
      };
    },
    [userTimezone]
  );

  /**
   * Fetch jobs for the default rolling window:
   * past 7 days .. next 90 days
   * (Calendar components should prefer useCalendarJobs with explicit range)
   */
  const fetchJobs = useCallback(async () => {
    if (!user || !tenantId) return;
    setLoading(true);
    setError(null);

    try {
      const now = new Date();
      const from = new Date(now);
      from.setDate(from.getDate() - 7);
      const to = new Date(now);
      to.setDate(to.getDate() + 90);

      const fromISO = from.toISOString();
      const toISO = to.toISOString();

      const { data, error: qErr } = await supabase
        .from("job_occurrences")
        .select(
          `
          id,
          series_id,
          tenant_id,
          customer_id,
          customer_name,
          assigned_to_user_id,
          start_at,
          end_at,
          status,
          priority,
          actual_cost,
          completion_notes,
          created_at,
          updated_at,
          job_series!inner(
            is_recurring,
            title,
            description,
            estimated_cost,
            service_type
          )
        `
        )
        .eq("tenant_id", tenantId)
        .gte("start_at", fromISO)
        .lt("start_at", toISO)
        .order("start_at", { ascending: true });

      if (qErr) throw qErr;

      setJobs((data ?? []).map(mapRowToJob));
    } catch (e: any) {
      console.error("fetchJobs error", e);
      setError(e.message ?? "Failed to load jobs");
      toast({
        title: "Error loading jobs",
        description: e.message ?? String(e),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [user, tenantId, toast, mapRowToJob]);

  /**
   * Create a job (one-off or recurring).
   * Always creates a series row; then creates either one occurrence (one-off)
   * or invokes the generator to materialize a horizon (recurring).
   */
  const createJob = useCallback(
    async (jobData: CreateJobInput) => {
      if (!user || !tenantId) {
        toast({
          title: "Not signed in",
          description: "Please sign in to create jobs.",
          variant: "destructive",
        });
        return { ok: false, error: "Not authenticated" as const };
      }

      // Normalize time inputs
      const uiDate = jobData.scheduled_date ?? jobData.date;
      const uiTime = jobData.start_time ?? jobData.time;

      if (!uiDate || !uiTime) {
        return {
          ok: false as const,
          error: "Missing date/time for job creation",
        };
      }

      const duration = jobData.duration_minutes ?? 60;
      let utcStart: Date;
      try {
        utcStart = combineDateTimeToUTC(uiDate, uiTime, userTimezone);
      } catch (e: any) {
        toast({
          title: "Invalid date/time",
          description: e.message ?? "Please check the values",
          variant: "destructive",
        });
        return { ok: false as const, error: "Invalid date/time" as const };
      }
      const utcEnd = new Date(utcStart.getTime() + duration * 60 * 1000);

      const isRecurring = !!jobData.is_recurring && !!jobData.rrule;

      // Prepare series payload
      const seriesPayload: Record<string, any> = {
        tenant_id: tenantId,
        created_by_user_id: user.id,
        customer_id: jobData.customer_id,
        customer_name: jobData.customer_name,
        title: jobData.title,
        description: jobData.description ?? null,
        priority: jobData.priority ?? "medium",
        duration_minutes: duration,
        // local / tz / rrule fields (support existing schema)
        start_date: uiDate,
        local_start_time: uiTime.length === 5 ? `${uiTime}:00` : uiTime, // HH:mm -> HH:mm:ss
        timezone: userTimezone,
        is_recurring: isRecurring,
        rrule: isRecurring ? jobData.rrule : null,
        until_date: jobData.until_date ?? null,
        estimated_cost: jobData.estimated_cost ?? null,
        service_type: jobData.service_type ?? null,
        // precomputed UTC for convenience/perf
        scheduled_time_utc: utcStart.toISOString(),
        scheduled_end_time_utc: utcEnd.toISOString(),
        status: "scheduled",
        active: true,
      };

      // Insert series
      const { data: series, error: sErr } = await supabase
        .from("job_series")
        .insert(seriesPayload as any)
        .select()
        .single();

      if (sErr) {
        console.error("create series error", sErr);
        toast({
          title: "Failed to create job",
          description: sErr.message ?? String(sErr),
          variant: "destructive",
        });
        return { ok: false as const, error: sErr.message ?? "Insert failed" };
      }

      if (isRecurring) {
        // Recurring: invoke generator to materialize occurrences
        const { data: fnRes, error: fnErr } = await supabase.functions.invoke(
          "generate-job-occurrences",
          {
            body: {
              seriesId: series.id,
              monthsAhead: 3,
              maxOccurrences: 200,
            },
          }
        );

        if (fnErr) {
          console.error("generator error", fnErr, fnRes);
          toast({
            title: "Job created, but failed to generate occurrences",
            description: fnErr.message ?? String(fnErr),
            variant: "destructive",
          });
          // still return ok because the series exists; a follow-up horizon task can repair
          await fetchJobs();
          return { ok: true as const, seriesId: series.id };
        }

        toast({
          title: "Recurring job created",
          description: `Generated ${fnRes?.generated?.created ?? 0} occurrences`,
        });
        await fetchJobs();
        return { ok: true as const, seriesId: series.id };
      } else {
        // One-off: insert exactly one occurrence
        const occurrencePayload: Record<string, any> = {
          tenant_id: tenantId,
          series_id: series.id,
          customer_id: jobData.customer_id,
          customer_name: jobData.customer_name,
          start_at: utcStart.toISOString(),
          end_at: utcEnd.toISOString(),
          status: "scheduled",
          priority: jobData.priority ?? "medium",
          assigned_to_user_id: jobData.assigned_to_user_id ?? null,
          series_timezone: userTimezone,
          series_local_start_time:
            uiTime.length === 5 ? `${uiTime}:00` : uiTime,
        };

        const { error: oErr } = await supabase
          .from("job_occurrences")
          .insert(occurrencePayload as any);

        if (oErr) {
          console.error("insert occurrence error", oErr);
          toast({
            title: "Failed to create job occurrence",
            description: oErr.message ?? String(oErr),
            variant: "destructive",
          });
          return { ok: false as const, error: oErr.message ?? "Insert failed" };
        }

        toast({ title: "Job created" });
        await fetchJobs();
        return { ok: true as const, seriesId: series.id };
      }
    },
    [user, tenantId, userTimezone, toast, fetchJobs]
  );

  /**
   * Update a single occurrence row (calendar-level edit).
   * To update the SERIES template, use the dedicated series hook/screen.
   */
  const updateJob = useCallback(
    async (occurrenceId: string, updates: Partial<ScheduledJob> & Record<string, any>) => {
      if (!user || !tenantId) return { ok: false as const, error: "Not authenticated" };

      const payload: Record<string, any> = { ...updates };

      // If UI passes local date/time updates, convert to UTC
      if (updates?.local_start && updates?.local_end) {
        // assume ISO-like strings in user's tz, but for safety the UI should pass (date,time)
        // here we prefer start_at/end_at updates directly; keeping for compatibility
        // No-op: convertFromUTC is the reverse. We'll rely on start_at/end_at when provided.
      }

      if (updates?.start_at && updates?.end_at) {
        // Ensure ISO strings
        payload.start_at = new Date(updates.start_at).toISOString();
        payload.end_at = new Date(updates.end_at).toISOString();
      }

      const { error: uErr } = await supabase
        .from("job_occurrences")
        .update(payload)
        .eq("id", occurrenceId)
        .eq("tenant_id", tenantId);

      if (uErr) {
        console.error("update occurrence error", uErr);
        toast({
          title: "Failed to update job",
          description: uErr.message ?? String(uErr),
          variant: "destructive",
        });
        return { ok: false as const, error: uErr.message ?? "Update failed" };
      }

      toast({ title: "Job updated" });
      await fetchJobs();
      return { ok: true as const };
    },
    [user, tenantId, toast, fetchJobs]
  );

  /**
   * Delete a single occurrence row (calendar-level delete).
   * Series-level deletion should be done via series screens.
   */
  const deleteJob = useCallback(
    async (occurrenceId: string) => {
      if (!user || !tenantId) return { ok: false as const, error: "Not authenticated" };

      const { error: dErr } = await supabase
        .from("job_occurrences")
        .delete()
        .eq("id", occurrenceId)
        .eq("tenant_id", tenantId);

      if (dErr) {
        console.error("delete occurrence error", dErr);
        toast({
          title: "Failed to delete job",
          description: dErr.message ?? String(dErr),
          variant: "destructive",
        });
        return { ok: false as const, error: dErr.message ?? "Delete failed" };
      }

      toast({ title: "Job deleted" });
      await fetchJobs();
      return { ok: true as const };
    },
    [user, tenantId, toast, fetchJobs]
  );

  /**
   * Convenience mapper for FullCalendar-like components.
   * Returns events with UTC start/end; rendering layer can convert if desired.
   */
  const getCalendarEvents = useCallback(() => {
    return jobs.map((j) => ({
      id: j.id,
      title: j.title,
      start: j.start_at, // UTC ISO
      end: j.end_at,     // UTC ISO
      extendedProps: {
        status: j.status,
        priority: j.priority,
        customer_name: j.customer_name,
        series_id: j.series_id,
        job_type: j.job_type,
      },
    }));
  }, [jobs]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  return {
    jobs,
    loading,
    error,
    createJob,
    updateJob,
    deleteJob,
    refreshJobs: fetchJobs,
    getCalendarEvents,
    // convenience derived data
    upcomingJobs: jobs
      .filter((job) => new Date(job.start_at) > new Date() && job.status === "scheduled")
      .slice(0, 5),
    todaysJobs: jobs.filter((job) => {
      const today = new Date();
      const jobDate = new Date(job.start_at);
      return jobDate.toDateString() === today.toDateString();
    }),
  };
}
