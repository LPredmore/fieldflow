import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.3';
import { RRule } from 'https://esm.sh/rrule@2.8.1';
import { DateTime } from 'https://esm.sh/luxon@3.7.2';

interface GenerateOccurrencesRequest {
  seriesId: string;
  fromDate?: string; // YYYY-MM-DD
  monthsAhead?: number;
  maxOccurrences?: number;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  console.log(`🚀 Enhanced generate-job-occurrences called: ${req.method}`);
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request body
    const { seriesId, fromDate, monthsAhead = 3, maxOccurrences = 50 } = await req.json() as GenerateOccurrencesRequest;
    console.log(`📋 Processing series: ${seriesId}, fromDate: ${fromDate}, monthsAhead: ${monthsAhead}`);

    // Fetch job series with enhanced data
    const { data: series, error: seriesError } = await supabase
      .from('job_series')
      .select('*')
      .eq('id', seriesId)
      .single();

    if (seriesError) {
      console.error('❌ Error fetching job series:', seriesError);
      throw seriesError;
    }

    if (!series) {
      throw new Error(`Job series ${seriesId} not found`);
    }

    if (!series.active) {
      console.log(`⏸️ Series ${seriesId} is inactive, skipping generation`);
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'Series is inactive',
        generated: 0,
        skipped: 0 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`✅ Loaded series: ${series.title}, recurring: ${series.is_recurring}`);

    // Use enhanced UTC times if available, fallback to calculated times
    let dtstart: DateTime;
    if (series.scheduled_time_utc) {
      console.log(`🎯 Using pre-calculated UTC time: ${series.scheduled_time_utc}`);
      dtstart = DateTime.fromISO(series.scheduled_time_utc);
    } else {
      console.log(`⚠️ No pre-calculated UTC time, calculating from local time`);
      // Fallback calculation
      const localDateTime = `${series.start_date}T${series.local_start_time}`;
      dtstart = DateTime.fromISO(localDateTime, { zone: series.timezone });
    }

    if (!dtstart.isValid) {
      throw new Error(`Invalid start date/time for series ${seriesId}: ${dtstart.invalidReason}`);
    }

    console.log(`⏰ Series start time: ${dtstart.toISO()} (${series.timezone})`);

    // Parse RRULE if recurring
    let rrule: RRule;
    if (series.is_recurring && series.rrule) {
      try {
        rrule = RRule.fromString(series.rrule);
        rrule.options.dtstart = dtstart.toJSDate();
        console.log(`🔄 Parsed RRULE: ${series.rrule}`);
      } catch (error) {
        console.error('❌ Error parsing RRULE:', error);
        throw new Error(`Invalid RRULE: ${series.rrule}`);
      }
    } else {
      console.log(`📋 Non-recurring series, single occurrence only`);
      // For one-time jobs, create single occurrence
      const startTimeUTC = dtstart.toUTC();
      const endTimeUTC = startTimeUTC.plus({ minutes: series.duration_minutes });
      
      const occurrence = {
        tenant_id: series.tenant_id,
        series_id: series.id,
        customer_id: series.customer_id,
        assigned_to_user_id: series.assigned_to_user_id,
        start_at: startTimeUTC.toISO(),
        end_at: endTimeUTC.toISO(),
        status: 'scheduled',
        priority: series.priority,
        series_timezone: series.timezone,
        series_local_start_time: series.local_start_time,
      };

      const { error: insertError } = await supabase
        .from('job_occurrences')
        .upsert(occurrence, { onConflict: 'series_id,start_at' });

      if (insertError) {
        console.error('❌ Error inserting single occurrence:', insertError);
        throw insertError;
      }

      console.log(`✅ Created single occurrence for ${series.title}`);
      
      return new Response(JSON.stringify({ 
        success: true, 
        generated: 1,
        skipped: 0,
        message: 'Single occurrence created'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Calculate generation window for recurring jobs
    const startDate = fromDate ? DateTime.fromISO(fromDate) : dtstart;
    const endDate = startDate.plus({ months: monthsAhead });
    
    // Cap at series until_date if specified
    const finalEndDate = series.until_date 
      ? DateTime.min(endDate, DateTime.fromISO(series.until_date))
      : endDate;

    console.log(`📅 Generation window: ${startDate.toISODate()} to ${finalEndDate.toISODate()}`);

    // Generate occurrences
    const occurrences = rrule.between(
      startDate.toJSDate(),
      finalEndDate.toJSDate(),
      true // inclusive
    ).slice(0, maxOccurrences);

    console.log(`🎯 Generated ${occurrences.length} occurrences (max: ${maxOccurrences})`);

    if (occurrences.length === 0) {
      console.log(`⚠️ No occurrences generated for series ${seriesId}`);
      return new Response(JSON.stringify({ 
        success: true, 
        generated: 0,
        skipped: 0,
        message: 'No occurrences in date range'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Insert occurrences in batches
    const batchSize = 10;
    let totalGenerated = 0;
    let totalSkipped = 0;

    for (let i = 0; i < occurrences.length; i += batchSize) {
      const batch = occurrences.slice(i, i + batchSize).map(date => {
        // CRITICAL FIX: Combine RRULE date with original local_start_time and timezone
        const rruleDate = DateTime.fromJSDate(date); // This gives us the date part
        const dateStr = rruleDate.toISODate(); // YYYY-MM-DD
        
        // Combine with original local_start_time and timezone
        const localDateTime = `${dateStr}T${series.local_start_time}`;
        const zonedDateTime = DateTime.fromISO(localDateTime, { zone: series.timezone });
        const startTimeUTC = zonedDateTime.toUTC();
        const endTimeUTC = startTimeUTC.plus({ minutes: series.duration_minutes });
        
        return {
          tenant_id: series.tenant_id,
          series_id: series.id,
          customer_id: series.customer_id,
          assigned_to_user_id: series.assigned_to_user_id,
          start_at: startTimeUTC.toISO(),
          end_at: endTimeUTC.toISO(),
          status: 'scheduled' as const,
          priority: series.priority,
          series_timezone: series.timezone,
          series_local_start_time: series.local_start_time,
        };
      });

      console.log(`📦 Inserting batch ${Math.floor(i/batchSize) + 1}: ${batch.length} occurrences`);

      const { data, error: insertError } = await supabase
        .from('job_occurrences')
        .upsert(batch, { 
          onConflict: 'series_id,start_at',
          count: 'exact'
        });

      if (insertError) {
        console.error('❌ Error inserting batch:', insertError);
        throw insertError;
      }

      const batchGenerated = data?.length || batch.length;
      totalGenerated += batchGenerated;
      totalSkipped += batch.length - batchGenerated;
      
      console.log(`✅ Batch complete: ${batchGenerated} generated, ${batch.length - batchGenerated} skipped`);
    }

    // Update series generation status
    const lastOccurrence = DateTime.fromJSDate(occurrences[occurrences.length - 1]);
    const { error: updateError } = await supabase
      .from('job_series')
      .update({ 
        last_generated_until: lastOccurrence.toISO(),
        generation_status: 'generated'
      })
      .eq('id', seriesId);

    if (updateError) {
      console.error('⚠️ Error updating series generation status:', updateError);
      // Non-fatal error, continue
    }

    console.log(`🎉 Generation complete: ${totalGenerated} created, ${totalSkipped} skipped`);

    return new Response(JSON.stringify({ 
      success: true, 
      generated: totalGenerated,
      skipped: totalSkipped,
      lastGenerated: lastOccurrence.toISO(),
      message: `Generated ${totalGenerated} occurrences for ${series.title}`
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('💥 Error in generate-job-occurrences-enhanced:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message,
      generated: 0,
      skipped: 0
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});