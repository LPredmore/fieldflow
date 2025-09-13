import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.3';
import { RRule } from 'https://esm.sh/rrule@2.8.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GenerateOccurrencesRequest {
  seriesId: string;
  monthsAhead?: number;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Starting job occurrence generation');
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { seriesId, monthsAhead = 6 }: GenerateOccurrencesRequest = await req.json();
    
    console.log('Generating occurrences for series:', seriesId);

    // Fetch the job series
    const { data: series, error: seriesError } = await supabase
      .from('job_series')
      .select('*')
      .eq('id', seriesId)
      .single();

    if (seriesError || !series) {
      console.error('Series not found:', seriesError);
      return new Response(
        JSON.stringify({ error: 'Job series not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!series.active) {
      console.log('Series is inactive, skipping generation');
      return new Response(
        JSON.stringify({ message: 'Series is inactive' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Series details:', {
      title: series.title,
      rrule: series.rrule,
      start_date: series.start_date,
      local_start_time: series.local_start_time,
      timezone: series.timezone
    });

    // Create the base datetime in the series timezone
    const startDateTime = new Date(`${series.start_date}T${series.local_start_time}:00`);
    
    // Parse the RRULE
    let rule: RRule;
    try {
      // Parse RRULE and set the dtstart
      rule = RRule.fromString(series.rrule);
      // Override the dtstart with our calculated start time
      rule.options.dtstart = startDateTime;
    } catch (rruleError) {
      console.error('Invalid RRULE:', rruleError);
      return new Response(
        JSON.stringify({ error: 'Invalid recurrence rule' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Calculate window for generation (today to X months ahead)
    const windowStart = new Date();
    windowStart.setHours(0, 0, 0, 0); // Start of today
    
    const windowEnd = new Date();
    windowEnd.setMonth(windowEnd.getMonth() + monthsAhead);
    windowEnd.setHours(23, 59, 59, 999); // End of the future day

    // Apply until_date limit if specified
    let effectiveEnd = windowEnd;
    if (series.until_date) {
      const untilDate = new Date(series.until_date);
      untilDate.setHours(23, 59, 59, 999);
      effectiveEnd = untilDate < windowEnd ? untilDate : windowEnd;
    }

    console.log('Generation window:', {
      start: windowStart.toISOString(),
      end: effectiveEnd.toISOString()
    });

    // Generate occurrences
    const occurrences = rule.between(windowStart, effectiveEnd, true);
    
    console.log(`Generated ${occurrences.length} occurrences`);

    const generatedCount = {
      created: 0,
      skipped: 0
    };

    // Insert each occurrence
    for (const occurrence of occurrences) {
      const startAt = new Date(occurrence);
      const endAt = new Date(startAt.getTime() + (series.duration_minutes * 60 * 1000));

      const occurrenceData = {
        tenant_id: series.tenant_id,
        series_id: series.id,
        customer_id: series.customer_id,
        customer_name: series.customer_name,
        start_at: startAt.toISOString(),
        end_at: endAt.toISOString(),
        status: 'scheduled',
        priority: series.priority || 'medium',
        assigned_to_user_id: series.assigned_to_user_id
      };

      // Use upsert to handle duplicates gracefully
      const { error: insertError } = await supabase
        .from('job_occurrences')
        .upsert(occurrenceData, { 
          onConflict: 'series_id,start_at',
          ignoreDuplicates: true
        });

      if (insertError) {
        console.error('Error inserting occurrence:', insertError);
        generatedCount.skipped++;
      } else {
        generatedCount.created++;
      }
    }

    console.log('Generation completed:', generatedCount);

    return new Response(
      JSON.stringify({ 
        success: true,
        message: `Generated ${generatedCount.created} occurrences, skipped ${generatedCount.skipped} duplicates`,
        generated: generatedCount
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in generate-job-occurrences function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});