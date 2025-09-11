import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import "https://deno.land/x/xhr@0.1.0/mod.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      serviceName, 
      serviceDescription, 
      unitType, 
      businessAddress,
      additionalContext 
    } = await req.json()

    // Validate required fields
    if (!serviceName || !unitType) {
      return new Response(
        JSON.stringify({ error: 'Service name and unit type are required' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400 
        }
      )
    }

    // Check if business address is provided (required for market context)
    if (!businessAddress || !businessAddress.city || !businessAddress.state) {
      return new Response(
        JSON.stringify({ 
          error: 'Business address with city and state is required for market analysis',
          requiresAddress: true 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400 
        }
      )
    }

    const nexusApiKey = Deno.env.get('NEXUSAI_API_KEY')
    if (!nexusApiKey) {
      console.error('Nexus AI API key not found')
      return new Response(
        JSON.stringify({ error: 'AI service temporarily unavailable' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500 
        }
      )
    }

    // Construct the query for Nexus AI price suggestion
    const location = `${businessAddress.city}, ${businessAddress.state}`
    const query = `As a business pricing consultant, provide competitive pricing suggestions for the following service:

Service: ${serviceName}
Description: ${serviceDescription || 'No description provided'}
Unit Type: ${unitType}
Location: ${location}
Additional Context: ${additionalContext || 'None provided'}

Please provide three pricing tiers (Low, Average, High) with brief reasoning for each. Consider local market rates, service complexity, and competitive positioning.`

    // Define response schema for structured data
    const responseSchema = {
      type: "object",
      properties: {
        reasoning: {
          type: "string",
          description: "Brief market analysis and factors considered"
        },
        suggestions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              tier: { type: "string" },
              price: { type: "number" },
              description: { type: "string" }
            },
            required: ["tier", "price", "description"]
          }
        }
      },
      required: ["reasoning", "suggestions"]
    }

    const response = await fetch('https://nexus-ai-f957769a.base44.app/ApiSearch', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${nexusApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: query,
        search_type: 'structured_data',
        response_schema: responseSchema,
        include_web_context: true
      }),
      signal: AbortSignal.timeout(30000) // 30 second timeout
    })

    if (!response.ok) {
      let errorMessage = 'Failed to get AI suggestions'
      
      try {
        const errorData = await response.json()
        errorMessage = errorData.detail || errorMessage
        console.error('Nexus AI API error:', {
          status: response.status,
          detail: errorData.detail,
          timestamp: new Date().toISOString()
        })
      } catch (parseError) {
        const errorText = await response.text()
        console.error('Nexus AI API error (raw):', errorText)
      }
      
      // Handle specific Nexus AI error codes
      if (response.status === 401) {
        console.error('Invalid or missing API key')
        return new Response(
          JSON.stringify({ error: 'AI service authentication failed' }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500 
          }
        )
      }
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 429 
          }
        )
      }
      
      return new Response(
        JSON.stringify({ error: errorMessage }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500 
        }
      )
    }

    const aiResponse = await response.json()
    
    // Log performance metrics from Nexus AI
    console.log('Nexus AI response metrics:', {
      processing_time_ms: aiResponse.processing_time_ms,
      request_id: aiResponse.request_id,
      search_type: aiResponse.search_type,
      timestamp: new Date().toISOString()
    })
    
    if (aiResponse.status !== 'success') {
      console.error('Nexus AI error response:', aiResponse)
      return new Response(
        JSON.stringify({ error: 'AI service returned an error' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500 
        }
      )
    }

    const suggestions = aiResponse.data

    if (!suggestions || !suggestions.suggestions) {
      console.error('Invalid response structure from Nexus AI:', suggestions)
      // Fallback to structured response if data is invalid
      const fallbackSuggestions = {
        reasoning: "Unable to get detailed market analysis at this time",
        suggestions: [
          { tier: "Low", price: 40.00, description: "Budget-friendly option" },
          { tier: "Average", price: 60.00, description: "Standard market rate" },
          { tier: "High", price: 80.00, description: "Premium positioning" }
        ]
      }
      
      return new Response(
        JSON.stringify(fallbackSuggestions),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    console.log('Successfully processed AI price suggestion request:', {
      request_id: aiResponse.request_id,
      suggestions_count: suggestions.suggestions?.length || 0
    })

    return new Response(
      JSON.stringify(suggestions),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )

  } catch (error) {
    console.error('Error in AI price suggestion:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    )
  }
})