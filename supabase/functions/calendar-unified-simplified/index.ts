import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Simplified calendar endpoint that only fetches from job_occurrences
 * All jobs (single and recurring) should be materialized in job_occurrences
 */
serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Fetching simplified calendar data from job_occurrences only');
    
    // Create Supabase client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get tenant ID from JWT
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

    const tenantId = profile?.role === 'business_admin' ? user.id : profile?.parent_admin_id;
    if (!tenantId) {
      throw new Error('Tenant ID not found');
    }

    console.log(`Fetching calendar data for tenant: ${tenantId}`);

    // Fetch all materialized job occurrences for the tenant
    const { data: jobs, error: jobsError } = await supabase
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
      .order('start_at', { ascending: true });

    if (jobsError) {
      console.error('Error fetching jobs:', jobsError);
      throw jobsError;
    }

    // Transform the data for calendar display
    const calendarEvents = (jobs || []).map((job: any) => {
      const series = job.job_series;
      
      return {
        id: job.id,
        series_id: job.series_id,
        title: job.override_title || series?.title || 'Untitled Job',
        description: job.override_description || series?.description,
        start_at: job.start_at,
        end_at: job.end_at,
        status: job.status,
        priority: job.priority,
        customer_id: job.customer_id,
        customer_name: job.customer_name,
        assigned_to_user_id: job.assigned_to_user_id,
        estimated_cost: job.override_estimated_cost || series?.estimated_cost,
        actual_cost: job.actual_cost,
        completion_notes: job.completion_notes,
        service_type: series?.service_type,
        created_at: job.created_at,
        updated_at: job.updated_at,
        tenant_id: job.tenant_id,
        job_type: 'occurrence' // All events are now occurrences
      };
    });

    console.log(`Returning ${calendarEvents.length} calendar events from job_occurrences`);

    return new Response(JSON.stringify(calendarEvents), {
      headers: { 
        ...corsHeaders, 
        'Content-Type': 'application/json' 
      },
    });

  } catch (error) {
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