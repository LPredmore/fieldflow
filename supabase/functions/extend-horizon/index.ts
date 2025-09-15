import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ExtendHorizonRequest {
  horizonDays?: number;
  batchSize?: number;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Starting horizon extension process');
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { 
      horizonDays = 90, 
      batchSize = 10 
    }: ExtendHorizonRequest = req.method === 'POST' ? await req.json() : {};

    // Calculate target horizon date
    const targetHorizon = new Date();
    targetHorizon.setDate(targetHorizon.getDate() + horizonDays);
    
    console.log('Target horizon:', targetHorizon.toISOString());

    // Find all active series that need extension
    const { data: seriesToExtend, error: fetchError } = await supabase
      .from('job_series')
      .select('id, title, last_generated_until, until_date')
      .eq('active', true)
      .or(`last_generated_until.is.null,last_generated_until.lt.${targetHorizon.toISOString()}`);

    if (fetchError) {
      console.error('Error fetching series to extend:', fetchError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch series' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${seriesToExtend?.length || 0} series to extend`);

    if (!seriesToExtend || seriesToExtend.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true,
          message: 'No series need extension',
          processed: 0
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const results = {
      processed: 0,
      succeeded: 0,
      failed: 0,
      errors: [] as string[]
    };

    // Process series in batches
    for (let i = 0; i < seriesToExtend.length; i += batchSize) {
      const batch = seriesToExtend.slice(i, i + batchSize);
      console.log(`Processing batch ${Math.floor(i / batchSize) + 1}: ${batch.length} series`);

      // Process batch items in parallel
      const batchPromises = batch.map(async (series) => {
        try {
          results.processed++;
          
          // Determine fromDate - use last_generated_until or now
          const fromDate = series.last_generated_until || new Date().toISOString();
          
          // Calculate months to generate (limit by until_date if present)
          let monthsToGenerate = 3; // Default 3 months
          if (series.until_date) {
            const untilDate = new Date(series.until_date);
            const fromDateObj = new Date(fromDate);
            const monthsDiff = (untilDate.getTime() - fromDateObj.getTime()) / (1000 * 60 * 60 * 24 * 30);
            monthsToGenerate = Math.min(monthsToGenerate, Math.ceil(monthsDiff));
          }

          if (monthsToGenerate <= 0) {
            console.log(`Series ${series.id} (${series.title}) has reached its end date`);
            return;
          }

          // Call generate-job-occurrences function
          const { data: generateResult, error: generateError } = await supabase.functions.invoke(
            'generate-job-occurrences',
            {
              body: {
                seriesId: series.id,
                fromDate: fromDate,
                monthsAhead: monthsToGenerate,
                maxOccurrences: 200 // Lower cap for background processing
              }
            }
          );

          if (generateError) {
            console.error(`Failed to extend series ${series.id}:`, generateError);
            results.errors.push(`Series ${series.id}: ${generateError.message}`);
            results.failed++;
          } else {
            console.log(`Successfully extended series ${series.id} (${series.title}):`, generateResult);
            results.succeeded++;
          }

        } catch (error: any) {
          console.error(`Error processing series ${series.id}:`, error);
          results.errors.push(`Series ${series.id}: ${error.message}`);
          results.failed++;
        }
      });

      // Wait for batch to complete
      await Promise.all(batchPromises);
      
      // Small delay between batches to prevent overwhelming the system
      if (i + batchSize < seriesToExtend.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    console.log('Horizon extension completed:', results);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Extended ${results.succeeded}/${results.processed} series successfully`,
        results: results
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in extend-horizon function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});