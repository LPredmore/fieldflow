import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.3';
import { RRule } from 'https://esm.sh/rrule@2.8.1';
import { DateTime } from 'https://esm.sh/luxon@3.4.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CalendarRequest {
  startDate: string; // ISO date string
  endDate: string;   // ISO date string
  tenantId: string;
}

interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  job_type: string;
  status: string;
  priority: string;
  customer_name: string;
  service_type: string;
  estimated_cost?: number;
  actual_cost?: number;
  is_virtual?: boolean; // Flag for virtual occurrences
  series_id?: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Starting unified calendar data fetch');
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { startDate, endDate, tenantId }: CalendarRequest = await req.json();
    
    const requestStart = new Date(startDate);
    const requestEnd = new Date(endDate);
    
    console.log('Fetching calendar data for:', {
      tenantId,
      startDate,
      endDate
    });

    // Fetch materialized jobs and occurrences
    const { data: materializedJobs, error: jobsError } = await supabase
      .from('jobs_calendar_upcoming')
      .select('*')
      .eq('tenant_id', tenantId)
      .gte('start_at', startDate)
      .lte('start_at', endDate);

    if (jobsError) {
      console.error('Error fetching materialized jobs:', jobsError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch calendar events' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${materializedJobs?.length || 0} materialized events`);

    // Find series that might need virtual occurrences
    const { data: activeSeries, error: seriesError } = await supabase
      .from('job_series')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('active', true)
      .or(`last_generated_until.is.null,last_generated_until.lt.${endDate}`);

    if (seriesError) {
      console.error('Error fetching active series:', seriesError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch series data' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${activeSeries?.length || 0} active series to check for virtuals`);

    const virtualEvents: CalendarEvent[] = [];

    // Generate virtual occurrences for each series with gaps
    for (const series of activeSeries || []) {
      try {
        // Determine the gap start date
        const gapStart = series.last_generated_until 
          ? new Date(Math.max(new Date(series.last_generated_until).getTime() + 1000, requestStart.getTime()))
          : requestStart;

        // Skip if no gap in requested window
        if (gapStart >= requestEnd) continue;

        // Apply until_date limit if present
        let gapEnd = requestEnd;
        if (series.until_date) {
          const untilDate = new Date(series.until_date);
          if (untilDate < gapEnd) {
            gapEnd = untilDate;
          }
        }

        // Skip if gap end is before gap start
        if (gapEnd <= gapStart) continue;

        console.log(`Generating virtual occurrences for series ${series.id} from ${gapStart.toISOString()} to ${gapEnd.toISOString()}`);

        // Create the base datetime in the series timezone
        const localStart = DateTime.fromISO(
          `${series.start_date}T${series.local_start_time}`, 
          { zone: series.timezone }
        );
        
        const startDateTime = new Date(localStart.toUTC().toISO());

        // Parse and generate virtual occurrences
        const rule = RRule.fromString(series.rrule);
        rule.options.dtstart = startDateTime;

        const virtualOccurrences = rule.between(gapStart, gapEnd, true);
        
        console.log(`Generated ${virtualOccurrences.length} virtual occurrences for series ${series.id}`);

        // Convert to calendar events
        for (const occurrence of virtualOccurrences) {
          const startUTC = DateTime.fromJSDate(occurrence).toUTC();
          const endUTC = startUTC.plus({ minutes: series.duration_minutes });

          virtualEvents.push({
            id: `virtual-${series.id}-${occurrence.getTime()}`,
            title: series.title,
            start: startUTC.toISO()!,
            end: endUTC.toISO()!,
            job_type: 'recurring',
            status: 'scheduled',
            priority: series.priority,
            customer_name: series.customer_name,
            service_type: series.service_type,
            estimated_cost: series.estimated_cost,
            is_virtual: true,
            series_id: series.id
          });
        }

      } catch (error: any) {
        console.error(`Error generating virtual occurrences for series ${series.id}:`, error);
        // Continue with other series
      }
    }

    // Combine materialized and virtual events
    const materializedEvents: CalendarEvent[] = (materializedJobs || []).map(job => ({
      id: job.id,
      title: job.title || 'Untitled Job',
      start: job.start_at,
      end: job.end_at,
      job_type: job.job_type || 'single',
      status: job.status,
      priority: job.priority,
      customer_name: job.customer_name,
      service_type: job.service_type,
      estimated_cost: job.estimated_cost,
      actual_cost: job.actual_cost,
      is_virtual: false,
      series_id: job.series_id
    }));

    const allEvents = [...materializedEvents, ...virtualEvents];
    
    // Sort by start time
    allEvents.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

    console.log(`Returning ${allEvents.length} total events (${materializedEvents.length} materialized, ${virtualEvents.length} virtual)`);

    return new Response(
      JSON.stringify({
        success: true,
        events: allEvents,
        summary: {
          total: allEvents.length,
          materialized: materializedEvents.length,
          virtual: virtualEvents.length,
          dateRange: { startDate, endDate }
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in calendar-unified function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});