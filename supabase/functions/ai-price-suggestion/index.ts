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

    const requestBody = {
      query: query,
      search_type: 'structured_data',
      response_schema: responseSchema,
      include_web_context: true
    }

    const requestUrl = 'https://nexus-ai-f957769a.base44.app/ApiSearch'
    const requestHeaders = {
      'Authorization': `Bearer ${nexusApiKey}`,
      'Content-Type': 'application/json'
    }

    // LOG: Complete request details
    console.log('=== NEXUS AI REQUEST DETAILS ===')
    console.log('URL:', requestUrl)
    console.log('Method: POST')
    console.log('Headers:', JSON.stringify(requestHeaders, null, 2))
    console.log('Body:', JSON.stringify(requestBody, null, 2))
    console.log('Query length:', query.length)
    console.log('API Key present:', !!nexusApiKey)
    console.log('API Key prefix:', nexusApiKey ? nexusApiKey.substring(0, 10) + '...' : 'NONE')
    console.log('=====================================')

    // Try GET method first since server indicates "allow: GET"
    console.log('=== ATTEMPTING GET REQUEST FIRST ===')
    
    // Convert request body to URL parameters for GET request
    const urlParams = new URLSearchParams({
      query: query,
      search_type: 'structured_data',
      response_schema: JSON.stringify(responseSchema),
      include_web_context: 'true'
    })
    const getUrl = `${requestUrl}?${urlParams.toString()}`
    
    console.log('GET URL:', getUrl)
    console.log('GET URL length:', getUrl.length)
    
    let response
    try {
      response = await fetch(getUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${nexusApiKey}`,
          'Content-Type': 'application/json'
        },
        signal: AbortSignal.timeout(30000) // 30 second timeout
      })
      
      // LOG: Response status and headers
      console.log('=== GET REQUEST RESPONSE STATUS ===')
      console.log('Status:', response.status)
      console.log('Status Text:', response.statusText)
      console.log('Headers:', Object.fromEntries(response.headers.entries()))
      console.log('OK:', response.ok)
      console.log('================================')
      
    } catch (fetchError) {
      console.error('=== GET REQUEST FETCH ERROR ===')
      console.error('Error name:', fetchError.name)
      console.error('Error message:', fetchError.message)
      console.error('Error stack:', fetchError.stack)
      console.error('Error cause:', fetchError.cause)
      console.error('================================')
      
      // If GET fails, try POST as fallback (in case API docs are correct)
      console.log('=== FALLBACK: TRYING POST REQUEST ===')
      try {
        response = await fetch(requestUrl, {
          method: 'POST',
          headers: requestHeaders,
          body: JSON.stringify(requestBody),
          signal: AbortSignal.timeout(30000)
        })
        
        console.log('=== POST FALLBACK RESPONSE STATUS ===')
        console.log('Status:', response.status)
        console.log('Status Text:', response.statusText)
        console.log('Headers:', Object.fromEntries(response.headers.entries()))
        console.log('OK:', response.ok)
        console.log('=====================================')
        
      } catch (postError) {
        console.error('=== POST FALLBACK ALSO FAILED ===')
        console.error('POST Error:', postError.message)
        console.error('================================')
        
        return new Response(
          JSON.stringify({ 
            error: 'Network error contacting AI service',
            details: `Both GET and POST failed. GET: ${fetchError.message}, POST: ${postError.message}`
          }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500 
          }
        )
      }
    }

    if (!response.ok) {
      let errorMessage = 'Failed to get AI suggestions'
      let errorDetails = {}
      
      // LOG: Error response details
      console.log('=== NEXUS AI ERROR RESPONSE ===')
      console.log('Status:', response.status)
      console.log('Status Text:', response.statusText)
      
      try {
        const responseText = await response.text()
        console.log('Raw response body:', responseText)
        
        try {
          const errorData = JSON.parse(responseText)
          errorDetails = errorData
          errorMessage = errorData.detail || errorMessage
          console.log('Parsed error data:', JSON.stringify(errorData, null, 2))
        } catch (jsonError) {
          console.log('Failed to parse error response as JSON:', jsonError.message)
          errorDetails = { rawResponse: responseText }
        }
        
      } catch (textError) {
        console.error('Failed to read error response text:', textError.message)
        errorDetails = { readError: textError.message }
      }
      
      console.log('Final error message:', errorMessage)
      console.log('Error details:', JSON.stringify(errorDetails, null, 2))
      console.log('===============================')
      
      // Handle specific Nexus AI error codes
      if (response.status === 401) {
        console.error('AUTHENTICATION ERROR: Invalid or missing API key')
        return new Response(
          JSON.stringify({ 
            error: 'AI service authentication failed',
            details: errorDetails
          }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500 
          }
        )
      }
      
      if (response.status === 405) {
        console.error('METHOD NOT ALLOWED ERROR: Endpoint may be incorrect')
        return new Response(
          JSON.stringify({ 
            error: 'AI service method not allowed',
            details: errorDetails
          }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500 
          }
        )
      }
      
      if (response.status === 429) {
        console.error('RATE LIMIT ERROR: Too many requests')
        return new Response(
          JSON.stringify({ 
            error: 'Rate limit exceeded. Please try again later.',
            details: errorDetails
          }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 429 
          }
        )
      }
      
      console.error('GENERAL API ERROR:', { status: response.status, message: errorMessage, details: errorDetails })
      return new Response(
        JSON.stringify({ 
          error: errorMessage,
          details: errorDetails,
          httpStatus: response.status
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500 
        }
      )
    }

    // LOG: Success - now parse response
    console.log('=== NEXUS AI SUCCESS RESPONSE ===')
    
    let aiResponse
    let responseText
    try {
      responseText = await response.text()
      console.log('Raw response body (first 500 chars):', responseText.substring(0, 500))
      console.log('Response body length:', responseText.length)
      
      aiResponse = JSON.parse(responseText)
      console.log('Parsed response structure:', {
        status: aiResponse.status,
        dataType: typeof aiResponse.data,
        hasProcessingTime: !!aiResponse.processing_time_ms,
        hasRequestId: !!aiResponse.request_id,
        hasSearchType: !!aiResponse.search_type
      })
    } catch (parseError) {
      console.error('=== JSON PARSING ERROR ===')
      console.error('Parse error:', parseError.message)
      console.error('Raw response (full):', responseText)
      console.error('==========================')
      
      return new Response(
        JSON.stringify({ 
          error: 'Failed to parse AI service response',
          details: {
            parseError: parseError.message,
            rawResponse: responseText?.substring(0, 1000) // Limit to first 1000 chars
          }
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500 
        }
      )
    }
    
    // Log performance metrics from Nexus AI
    console.log('Nexus AI response metrics:', {
      processing_time_ms: aiResponse.processing_time_ms,
      request_id: aiResponse.request_id,
      search_type: aiResponse.search_type,
      timestamp: new Date().toISOString()
    })
    
    if (aiResponse.status !== 'success') {
      console.error('=== AI RESPONSE STATUS ERROR ===')
      console.error('Response status:', aiResponse.status)
      console.error('Full response:', JSON.stringify(aiResponse, null, 2))
      console.error('================================')
      
      return new Response(
        JSON.stringify({ 
          error: 'AI service returned an error',
          details: {
            aiStatus: aiResponse.status,
            aiResponse: aiResponse
          }
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500 
        }
      )
    }

    const suggestions = aiResponse.data
    
    console.log('=== SUGGESTIONS DATA VALIDATION ===')
    console.log('Suggestions type:', typeof suggestions)
    console.log('Has suggestions property:', !!suggestions?.suggestions)
    console.log('Suggestions array length:', suggestions?.suggestions?.length || 0)
    console.log('Suggestions structure:', JSON.stringify(suggestions, null, 2))
    console.log('===================================')

    if (!suggestions || !suggestions.suggestions) {
      console.error('=== INVALID SUGGESTIONS STRUCTURE ===')
      console.error('Expected structure with suggestions array, got:', suggestions)
      console.error('Full AI response:', JSON.stringify(aiResponse, null, 2))
      console.error('=====================================')
      
      // Fallback to structured response if data is invalid
      const fallbackSuggestions = {
        reasoning: "Unable to get detailed market analysis at this time",
        suggestions: [
          { tier: "Low", price: 40.00, description: "Budget-friendly option" },
          { tier: "Average", price: 60.00, description: "Standard market rate" },
          { tier: "High", price: 80.00, description: "Premium positioning" }
        ]
      }
      
      console.log('Using fallback suggestions:', JSON.stringify(fallbackSuggestions, null, 2))
      
      return new Response(
        JSON.stringify(fallbackSuggestions),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    console.log('=== SUCCESS - RETURNING SUGGESTIONS ===')
    console.log('Final suggestions data:', JSON.stringify(suggestions, null, 2))
    console.log('Successfully processed AI price suggestion request:', {
      request_id: aiResponse.request_id,
      suggestions_count: suggestions.suggestions?.length || 0
    })
    console.log('=======================================')

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