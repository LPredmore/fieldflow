import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Service-specific question generators
const generateQuestionsForService = (serviceName: string, category: string, unitType: string) => {
  const baseId = serviceName.toLowerCase().replace(/\s+/g, '_');
  
  // Define questions based on common service types
  if (serviceName.toLowerCase().includes('lawn') || serviceName.toLowerCase().includes('mow')) {
    return [
      {
        id: `${baseId}_included_services`,
        question: "What services are included in your base lawn mowing rate?",
        placeholder: "Example: Include weed eating, edging, blowing walkways, or specify if these are separate charges..."
      },
      {
        id: `${baseId}_clippings`,
        question: "Do you bag and remove grass clippings, or do you leave them on the lawn?",
        placeholder: "Describe your standard practice and any additional charges for bagging and removal..."
      },
      {
        id: `${baseId}_frequency`,
        question: "What service frequency do you typically offer and how does it affect pricing?",
        placeholder: "Weekly, bi-weekly, monthly rates, and any discounts for regular service agreements..."
      }
    ];
  }

  if (serviceName.toLowerCase().includes('plumb') || category?.toLowerCase().includes('plumb')) {
    return [
      {
        id: `${baseId}_service_types`,
        question: "What types of plumbing issues does this service typically cover?",
        placeholder: "Example: Leak repairs, fixture installation, drain cleaning, emergency calls, etc..."
      },
      {
        id: `${baseId}_parts_labor`,
        question: "Do you charge separately for parts and materials, or include them in your rate?",
        placeholder: "Describe your pricing structure for parts vs labor, markup on materials, etc..."
      },
      {
        id: `${baseId}_emergency_rates`,
        question: "Do you offer emergency or after-hours service, and how does pricing differ?",
        placeholder: "Weekend, evening, holiday rates, emergency call-out fees, etc..."
      }
    ];
  }

  if (serviceName.toLowerCase().includes('clean') || category?.toLowerCase().includes('clean')) {
    return [
      {
        id: `${baseId}_cleaning_scope`,
        question: "What specific cleaning tasks are included in this service?",
        placeholder: "Detail what's included: bathrooms, kitchen, floors, windows, etc..."
      },
      {
        id: `${baseId}_supplies`,
        question: "Do you provide cleaning supplies and equipment, or does the customer?",
        placeholder: "Whether supplies are included, eco-friendly options, special equipment..."
      },
      {
        id: `${baseId}_frequency_discounts`,
        question: "Do you offer different rates for one-time vs recurring cleaning services?",
        placeholder: "Weekly, monthly rates, discounts for regular service, deep cleaning vs maintenance..."
      }
    ];
  }

  // Default questions for any service
  return [
    {
      id: `${baseId}_service_scope`,
      question: `What is typically included in your ${serviceName} service?`,
      placeholder: "Describe the standard scope of work, what's included vs what might be extra..."
    },
    {
      id: `${baseId}_complexity_factors`,
      question: "What factors might affect the complexity or pricing of this service?",
      placeholder: "Size, difficulty, materials needed, travel time, special requirements, etc..."
    },
    {
      id: `${baseId}_value_adds`,
      question: "What additional services or value do you provide that competitors might not?",
      placeholder: "Warranties, follow-up service, special expertise, premium materials, etc..."
    }
  ];
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action } = body;

    if (action === 'generateQuestions') {
      const { serviceName, serviceDescription, category, unitType } = body;
      
      const questions = generateQuestionsForService(serviceName, category, unitType);
      
      return new Response(
        JSON.stringify({ questions }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'generateAnalysis') {
      const { 
        serviceName, 
        serviceDescription, 
        category,
        unitType, 
        businessAddress,
        questions,
        answers
      } = body;

      if (!businessAddress?.city || !businessAddress?.state) {
        return new Response(
          JSON.stringify({ 
            error: 'Business address with city and state is required for market analysis',
            requiresAddress: true 
          }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400 
          }
        );
      }

      const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
      if (!openaiApiKey) {
        return new Response(
          JSON.stringify({ error: 'AI service temporarily unavailable' }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500 
          }
        );
      }

      const location = `${businessAddress.city}, ${businessAddress.state}`;
      const questionsAndAnswers = questions.map((q: string, i: number) => 
        `Q: ${q}\nA: ${answers[i] || 'Not provided'}`
      ).join('\n\n');

      const prompt = `As a business pricing consultant with deep expertise in service-based businesses, provide a comprehensive pricing analysis for the following service:

Service: ${serviceName}
Description: ${serviceDescription || 'No description provided'}
Category: ${category || 'General'}
Unit Type: ${unitType}
Location: ${location}

Service Details from Client Interview:
${questionsAndAnswers}

Please provide a detailed analysis with the following structure as JSON:
{
  "marketAnalysis": "Comprehensive market analysis considering local rates, competition, and service positioning for this specific area and service type",
  "reasoning": "Detailed reasoning for pricing recommendations based on service complexity, market factors, and competitive landscape",
  "suggestions": [
    {
      "tier": "Budget",
      "price": 45.00,
      "description": "Entry-level positioning for price-sensitive customers",
      "reasoning": "Specific reasoning for this price point considering service details and market factors"
    },
    {
      "tier": "Standard", 
      "price": 65.00,
      "description": "Market-competitive rate with good value proposition",
      "reasoning": "Detailed justification for standard market positioning"
    },
    {
      "tier": "Premium",
      "price": 85.00, 
      "description": "High-value positioning emphasizing quality and expertise",
      "reasoning": "Justification for premium pricing based on service differentiation"
    }
  ],
  "competitiveFactors": ["List of 3-5 key factors that influence pricing in this market and service category"],
  "recommendedTier": "Standard"
}

Focus on practical, actionable insights based on the service details provided and local market conditions.`;

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: 'You are an expert business pricing consultant specializing in service-based businesses. Always respond with valid, well-structured JSON only. Use your knowledge of local market conditions, industry standards, and competitive positioning to provide accurate pricing guidance.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          max_tokens: 1000,
          temperature: 0.3
        })
      });

      if (!response.ok) {
        console.error('OpenAI API error:', await response.text());
        return new Response(
          JSON.stringify({ error: 'Failed to generate pricing analysis' }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500 
          }
        );
      }

      const aiResponse = await response.json();
      const aiContent = aiResponse.choices[0]?.message?.content;

      if (!aiContent) {
        return new Response(
          JSON.stringify({ error: 'No analysis received from AI' }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500 
          }
        );
      }

      let analysis;
      try {
        analysis = JSON.parse(aiContent);
      } catch (parseError) {
        console.error('Failed to parse AI response:', aiContent);
        analysis = {
          marketAnalysis: "Unable to get detailed market analysis at this time. Please try again.",
          reasoning: "System error occurred during analysis generation",
          suggestions: [
            { tier: "Budget", price: 40.00, description: "Budget-friendly option", reasoning: "Base market rate" },
            { tier: "Standard", price: 60.00, description: "Standard market rate", reasoning: "Average market positioning" },
            { tier: "Premium", price: 80.00, description: "Premium positioning", reasoning: "High-value service delivery" }
          ],
          competitiveFactors: ["Service quality", "Market demand", "Competition level"],
          recommendedTier: "Standard"
        };
      }

      return new Response(
        JSON.stringify(analysis),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Legacy support for simple pricing suggestions
    const { 
      serviceName, 
      serviceDescription, 
      unitType, 
      businessAddress,
      additionalContext 
    } = body;

    if (!serviceName || !unitType) {
      return new Response(
        JSON.stringify({ error: 'Service name and unit type are required' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400 
        }
      );
    }

    if (!businessAddress?.city || !businessAddress?.state) {
      return new Response(
        JSON.stringify({ 
          error: 'Business address with city and state is required for market analysis',
          requiresAddress: true 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400 
        }
      );
    }

    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiApiKey) {
      return new Response(
        JSON.stringify({ error: 'AI service temporarily unavailable' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500 
        }
      );
    }

    const location = `${businessAddress.city}, ${businessAddress.state}`;
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
}`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
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
        max_tokens: 500,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      console.error('OpenAI API error:', await response.text());
      return new Response(
        JSON.stringify({ error: 'Failed to get AI suggestions' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500 
        }
      );
    }

    const aiResponse = await response.json();
    const aiContent = aiResponse.choices[0]?.message?.content;

    if (!aiContent) {
      return new Response(
        JSON.stringify({ error: 'No suggestions received from AI' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500 
        }
      );
    }

    let suggestions;
    try {
      suggestions = JSON.parse(aiContent);
    } catch (parseError) {
      console.error('Failed to parse AI response:', aiContent);
      suggestions = {
        reasoning: "Unable to get detailed market analysis at this time",
        suggestions: [
          { tier: "Low", price: 40.00, description: "Budget-friendly option" },
          { tier: "Average", price: 60.00, description: "Standard market rate" },
          { tier: "High", price: 80.00, description: "Premium positioning" }
        ]
      };
    }

    return new Response(
      JSON.stringify(suggestions),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in AI price suggestion:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});