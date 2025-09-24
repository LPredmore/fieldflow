import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { RRule } from 'https://esm.sh/rrule@2.8.1'
import { DateTime } from 'https://esm.sh/luxon@3.4.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface CalendarRequest {
  startDate?: string;
  endDate?: string;
  timezone?: string; // Add timezone parameter
  tenantId?: string;
}

interface CalendarEvent {
  id: string;
  title: string;
  start_at: string;
  end_at: string;
  status: string;
  priority: string;
  customer_name: string;
  service_type: string;
  estimated_cost?: number;
  actual_cost?: number;
  series_id?: string;
  job_type: 'single' | 'occurrence';
  description?: string;
  additional_info?: string;
  completion_notes?: string;
  customer_id?: string;
  assigned_to_user_id?: string;
  created_at: string;
  updated_at?: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Starting unified calendar data fetch');
    
    // Create Supabase client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Parse request body if it's a POST, otherwise handle as GET with URL params
    let calendarParams: CalendarRequest = {};
    if (req.method === 'POST') {
      calendarParams = await req.json();
    } else {
      const url = new URL(req.url);
      calendarParams = {
        startDate: url.searchParams.get('startDate') || undefined,
        endDate: url.searchParams.get('endDate') || undefined,
        timezone: url.searchParams.get('timezone') || 'America/New_York',
        tenantId: url.searchParams.get('tenantId') || undefined,
      };
    }

    // Get tenant ID from JWT if not provided
    let tenantId = calendarParams.tenantId;
    if (!tenantId) {
      const authHeader = req.headers.get('Authorization')?.replace('Bearer ', '');
      if (!authHeader) {
        throw new Error('No authorization header');
      }

      const { data: { user }, error: userError } = await supabase.auth.getUser(authHeader);
      if (userError || !user) {
        throw new Error('Authentication failed');
      }

      // Get tenant ID
      const { data: profile } = await supabase
        .from('profiles')
        .select('parent_admin_id, role')
        .eq('id', user.id)
        .single();

      tenantId = profile?.role === 'business_admin' ? user.id : profile?.parent_admin_id;
      if (!tenantId) {
        throw new Error('Tenant ID not found');
      }
    }

    // Default date range: 7 months from now
    const userTimezone = calendarParams.timezone || 'America/New_York';
    const now = DateTime.now().setZone(userTimezone);
    const defaultStart = now.minus({ days: 30 });
    const defaultEnd = now.plus({ months: 7 });

    const startDate = calendarParams.startDate ? DateTime.fromISO(calendarParams.startDate, { zone: userTimezone }) : defaultStart;
    const endDate = calendarParams.endDate ? DateTime.fromISO(calendarParams.endDate, { zone: userTimezone }) : defaultEnd;

    // Convert to UTC for database queries
    const startDateUTC = startDate.toUTC().toISO();
    const endDateUTC = endDate.toUTC().toISO();

    console.log(`Fetching calendar data for: {
  tenantId: "${tenantId}",
  startDate: "${startDateUTC}",
  endDate: "${endDateUTC}",
  timezone: "${userTimezone}"
}`);

    // 1. Fetch materialized jobs from the jobs_calendar_upcoming view
    const { data: materializedJobs, error: jobsError } = await supabase
      .from('jobs_calendar_upcoming')
      .select('*')
      .eq('tenant_id', tenantId)
      .gte('start_at', startDateUTC)
      .lte('start_at', endDateUTC);

    if (jobsError) {
      console.error('Error fetching jobs:', jobsError);
      throw jobsError;
    }

    console.log(`Found ${materializedJobs?.length || 0} materialized events`);

    // 2. Fetch active job series
    const { data: activeSeries, error: seriesError } = await supabase
      .from('job_series')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('active', true);

    if (seriesError) {
      console.error('Error fetching series:', seriesError);
      throw seriesError;
    }

    console.log(`Found ${activeSeries?.length || 0} active series to check for virtuals`);

    // 3. Generate virtual occurrences for series
    const virtualEvents: CalendarEvent[] = [];

    for (const series of activeSeries || []) {
      try {
        if (!series.rrule) continue;

        // Parse the RRule
        const rrule = RRule.fromString(series.rrule);
        
        // Determine generation window
        const seriesTimezone = series.timezone || 'America/New_York';
        const seriesStartDate = DateTime.fromISO(series.start_date, { zone: seriesTimezone });
        
        // Use last_generated_until or series start date as starting point
        let windowStart = startDate;
        if (series.last_generated_until) {
          const lastGenerated = DateTime.fromISO(series.last_generated_until, { zone: 'utc' }).setZone(seriesTimezone);
          windowStart = DateTime.max(windowStart, lastGenerated.plus({ days: 1 }));
        } else {
          windowStart = DateTime.max(windowStart, seriesStartDate);
        }

        // Apply generation cap if set
        let effectiveEnd = endDate;
        if (series.generation_cap_days) {
          const capEnd = now.plus({ days: series.generation_cap_days });
          effectiveEnd = DateTime.min(effectiveEnd, capEnd);
        }

        // Apply until_date if set
        if (series.until_date) {
          const untilDate = DateTime.fromISO(series.until_date, { zone: seriesTimezone });
          effectiveEnd = DateTime.min(effectiveEnd, untilDate);
        }

        if (windowStart >= effectiveEnd) {
          console.log(`Series ${series.id}: No generation needed, window start >= end`);
          continue;
        }

        // Generate occurrences in the series timezone, then convert to UTC
        const occurrences = rrule.between(windowStart.toJSDate(), effectiveEnd.toJSDate(), true);

        for (const occurrence of occurrences) {
          const occurrenceDateTime = DateTime.fromJSDate(occurrence, { zone: seriesTimezone });
          
          // Combine with local start time
          const [hours, minutes] = (series.local_start_time || '08:00:00').split(':').map(Number);
          const startDateTime = occurrenceDateTime.set({ hour: hours, minute: minutes, second: 0 });
          const endDateTime = startDateTime.plus({ minutes: series.duration_minutes || 60 });

          // Convert to UTC
          const startUTC = startDateTime.toUTC().toISO();
          const endUTC = endDateTime.toUTC().toISO();

          // Check if this occurrence already exists in materialized jobs
          const existsInMaterialized = materializedJobs?.some(job => 
            job.series_id === series.id &&
            startUTC && Math.abs(new Date(job.start_at).getTime() - new Date(startUTC).getTime()) < 60000 // 1 minute tolerance
          );

          if (!existsInMaterialized && startUTC && endUTC) {
            virtualEvents.push({
              id: `virtual-${series.id}-${startUTC}`,
              title: series.title,
              start_at: startUTC,
              end_at: endUTC,
              status: 'scheduled',
              priority: series.priority || 'medium',
              customer_name: series.customer_name,
              service_type: series.service_type || 'general_maintenance',
              estimated_cost: series.estimated_cost,
              actual_cost: undefined,
              series_id: series.id,
              job_type: 'occurrence',
              description: series.description,
              additional_info: series.notes,
              completion_notes: undefined,
              customer_id: series.customer_id,
              assigned_to_user_id: series.assigned_to_user_id,
              created_at: series.created_at,
              updated_at: series.updated_at,
            });
          }
        }
      } catch (error) {
        console.error(`Error processing series ${series.id}:`, error);
        continue;
      }
    }

    // 4. Combine and sort all events
    const allEvents: CalendarEvent[] = [
      ...(materializedJobs?.map(job => ({ ...job, job_type: job.job_type || 'single' })) || []),
      ...virtualEvents,
    ].sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());

    console.log(`Returning ${allEvents.length} total events (${materializedJobs?.length || 0} materialized, ${virtualEvents.length} virtual)`);

    return new Response(JSON.stringify(allEvents), {
      headers: { 
        ...corsHeaders, 
        'Content-Type': 'application/json' 
      },
    });

  } catch (error: any) {
    console.error('Calendar fetch error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    );
  }
});