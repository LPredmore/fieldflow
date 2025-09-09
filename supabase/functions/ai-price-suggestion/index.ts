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

    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')
    if (!openaiApiKey) {
      console.error('OpenAI API key not found')
      return new Response(
        JSON.stringify({ error: 'AI service temporarily unavailable' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500 
        }
      )
    }

    // Construct the prompt for AI price suggestion
    const location = `${businessAddress.city}, ${businessAddress.state}`
    const prompt = `As a business pricing consultant, provide competitive pricing suggestions for the following service:

Service: ${serviceName}
Description: ${serviceDescription || 'No description provided'}
Unit Type: ${unitType}
Location: ${location}
Additional Context: ${additionalContext || 'None provided'}

Please provide three pricing tiers (Low, Average, High) with brief reasoning for each. Consider local market rates, service complexity, and competitive positioning.

Format your response as JSON with this structure:
{
  "reasoning": "Brief market analysis and factors considered",
  "suggestions": [
    {
      "tier": "Low",
      "price": 45.00,
      "description": "Budget-friendly option, basic service level"
    },
    {
      "tier": "Average", 
      "price": 65.00,
      "description": "Standard market rate, good value proposition"
    },
    {
      "tier": "High",
      "price": 85.00, 
      "description": "Premium positioning, includes additional value"
    }
  ]
}`

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are a business pricing consultant with expertise in service-based businesses. Always respond with valid JSON only.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 500
      })
    })

    if (!response.ok) {
      console.error('OpenAI API error:', await response.text())
      return new Response(
        JSON.stringify({ error: 'Failed to get AI suggestions' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500 
        }
      )
    }

    const aiResponse = await response.json()
    const aiContent = aiResponse.choices[0]?.message?.content

    if (!aiContent) {
      return new Response(
        JSON.stringify({ error: 'No suggestions received from AI' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500 
        }
      )
    }

    // Try to parse the AI response as JSON
    let suggestions
    try {
      suggestions = JSON.parse(aiContent)
    } catch (parseError) {
      console.error('Failed to parse AI response:', aiContent)
      // Fallback to structured response if JSON parsing fails
      suggestions = {
        reasoning: "Unable to get detailed market analysis at this time",
        suggestions: [
          { tier: "Low", price: 40.00, description: "Budget-friendly option" },
          { tier: "Average", price: 60.00, description: "Standard market rate" },
          { tier: "High", price: 80.00, description: "Premium positioning" }
        ]
      }
    }

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