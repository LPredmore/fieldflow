import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { seriesId } = await req.json();
    
    console.log('Regenerating occurrences for series:', seriesId);
    
    // Delete existing occurrences for this series
    const { error: deleteError } = await supabase
      .from('job_occurrences')
      .delete()
      .eq('series_id', seriesId);
      
    if (deleteError) {
      console.error('Error deleting occurrences:', deleteError);
      throw deleteError;
    }
    
    // Reset last_generated_until
    const { error: updateError } = await supabase
      .from('job_series')
      .update({ last_generated_until: null })
      .eq('id', seriesId);
      
    if (updateError) {
      console.error('Error updating series:', updateError);
      throw updateError;
    }
    
    console.log('Cleaned up existing data, now generating new occurrences...');
    
    // Call the generate function
    const { data: generateResult, error: generateError } = await supabase.functions
      .invoke('generate-job-occurrences', {
        body: { seriesId, monthsAhead: 6 }
      });
      
    if (generateError) {
      console.error('Error generating occurrences:', generateError);
      throw generateError;
    }
    
    console.log('Generation result:', generateResult);

    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'Successfully regenerated occurrences',
        result: generateResult
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in regenerate-occurrences:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});