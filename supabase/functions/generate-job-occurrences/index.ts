import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.3';
import { RRule } from 'https://esm.sh/rrule@2.8.1';
import { DateTime } from 'https://esm.sh/luxon@3.4.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GenerateOccurrencesRequest {
  seriesId: string;
  monthsAhead?: number;
  fromDate?: string; // ISO date string, defaults to now
  maxOccurrences?: number; // Cap per run, defaults to 400
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

    const { 
      seriesId, 
      monthsAhead = 3, 
      fromDate,
      maxOccurrences = 400 
    }: GenerateOccurrencesRequest = await req.json();
    
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

    // Create the base datetime in the series timezone using Luxon
    const localStart = DateTime.fromISO(
      `${series.start_date}T${series.local_start_time}`, 
      { zone: series.timezone }
    );
    
    // Convert to UTC for RRULE processing
    const startDateTime = new Date(localStart.toUTC().toISO());
    
    // Parse the RRULE
    let rule: RRule;
    try {
      // Parse RRULE and set the dtstart
      rule = RRule.fromString(series.rrule);
      // Override the dtstart with our timezone-corrected start time
      rule.options.dtstart = startDateTime;
    } catch (rruleError) {
      console.error('Invalid RRULE:', rruleError);
      return new Response(
        JSON.stringify({ error: 'Invalid recurrence rule' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Calculate window for generation
    const windowStart = fromDate ? new Date(fromDate) : new Date();
    if (!fromDate) {
      windowStart.setHours(0, 0, 0, 0); // Start of today if no fromDate
    }
    
    // Use the last_generated_until as starting point if provided and later than windowStart
    if (series.last_generated_until) {
      const lastGenerated = new Date(series.last_generated_until);
      if (lastGenerated > windowStart) {
        windowStart.setTime(lastGenerated.getTime() + 1000); // Start 1 second after last generated
      }
    }
    
    const windowEnd = new Date(windowStart);
    windowEnd.setMonth(windowEnd.getMonth() + monthsAhead);
    windowEnd.setHours(23, 59, 59, 999);
    
    // Hard ceiling: never generate beyond 365 days from now
    const hardCeiling = new Date();
    hardCeiling.setFullYear(hardCeiling.getFullYear() + 1);
    if (windowEnd > hardCeiling) {
      windowEnd.setTime(hardCeiling.getTime());
    }

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

    // Generate occurrences with cap
    let occurrences = rule.between(windowStart, effectiveEnd, true);
    
    // Apply max occurrences cap
    if (occurrences.length > maxOccurrences) {
      console.log(`Capping occurrences from ${occurrences.length} to ${maxOccurrences}`);
      occurrences = occurrences.slice(0, maxOccurrences);
    }
    
    console.log(`Generated ${occurrences.length} occurrences`);

    const generatedCount = {
      created: 0,
      skipped: 0
    };

    // Insert each occurrence
    for (const occurrence of occurrences) {
      // Convert the occurrence back to UTC timestamps for storage
      const startUTC = DateTime.fromJSDate(occurrence).toUTC();
      const endUTC = startUTC.plus({ minutes: series.duration_minutes });

      const occurrenceData = {
        tenant_id: series.tenant_id,
        series_id: series.id,
        customer_id: series.customer_id,
        customer_name: series.customer_name,
        start_at: startUTC.toISO(),
        end_at: endUTC.toISO(),
        status: 'scheduled',
        priority: series.priority || 'medium',
        assigned_to_user_id: series.assigned_to_user_id
      };

      // Use upsert with select to get accurate counts
      const { data: insertedData, error: insertError } = await supabase
        .from('job_occurrences')
        .upsert(occurrenceData, { 
          onConflict: 'series_id,start_at',
          ignoreDuplicates: true
        })
        .select();

      if (insertError) {
        console.error('Error inserting occurrence:', insertError);
        generatedCount.skipped++;
      } else {
        // Count actual insertions (data will be empty for duplicates with ignoreDuplicates)
        generatedCount.created += (insertedData?.length ?? 0);
        if (!insertedData?.length) {
          generatedCount.skipped++;
        }
      }
    }

    console.log('Generation completed:', generatedCount);

    // Update last_generated_until if we generated any occurrences
    if (generatedCount.created > 0 && occurrences.length > 0) {
      const lastOccurrence = occurrences[occurrences.length - 1];
      const updateResult = await supabase
        .from('job_series')
        .update({ last_generated_until: lastOccurrence.toISOString() })
        .eq('id', seriesId);
      
      if (updateResult.error) {
        console.error('Failed to update last_generated_until:', updateResult.error);
      } else {
        console.log('Updated last_generated_until to:', lastOccurrence.toISOString());
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        message: `Generated ${generatedCount.created} occurrences, skipped ${generatedCount.skipped} duplicates`,
        generated: generatedCount,
        lastGeneratedUntil: occurrences.length > 0 ? occurrences[occurrences.length - 1].toISOString() : null
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