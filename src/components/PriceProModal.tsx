import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Sparkles, ArrowRight, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface PriceProModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  serviceData: {
    name: string;
    description: string;
    category: string;
    unitType: string;
  };
  businessAddress: any;
  onApplyPrice: (price: number) => void;
}

interface Question {
  id: string;
  question: string;
  placeholder: string;
}

interface PriceAnalysis {
  reasoning: string;
  marketAnalysis: string;
  suggestions: Array<{
    tier: string;
    price: number;
    description: string;
    reasoning: string;
  }>;
  competitiveFactors: string[];
  recommendedTier: string;
}

export default function PriceProModal({ 
  isOpen, 
  onOpenChange, 
  serviceData, 
  businessAddress, 
  onApplyPrice 
}: PriceProModalProps) {
  const [step, setStep] = useState(1);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [priceAnalysis, setPriceAnalysis] = useState<PriceAnalysis | null>(null);
  const [loading, setLoading] = useState(false);

  const handleNext = async () => {
    if (step === 1) {
      // Generate questions based on service data
      await generateQuestions();
    } else if (step === 2) {
      // Generate price analysis based on answers
      await generatePriceAnalysis();
    }
  };

  const generateQuestions = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-price-suggestion', {
        body: {
          action: 'generateQuestions',
          serviceName: serviceData.name,
          serviceDescription: serviceData.description,
          category: serviceData.category,
          unitType: serviceData.unitType,
          businessAddress
        }
      });

      if (error) {
        console.error('Error generating questions:', error);
        toast.error("Failed to generate questions. Please try again.");
        return;
      }

      setQuestions(data.questions || []);
      setStep(2);
    } catch (error) {
      console.error('Error:', error);
      toast.error("Failed to generate questions. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const generatePriceAnalysis = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-price-suggestion', {
        body: {
          action: 'generateAnalysis',
          serviceName: serviceData.name,
          serviceDescription: serviceData.description,
          category: serviceData.category,
          unitType: serviceData.unitType,
          businessAddress,
          questions: questions.map(q => q.question),
          answers: Object.values(answers)
        }
      });

      if (error) {
        console.error('Error generating analysis:', error);
        toast.error("Failed to generate price analysis. Please try again.");
        return;
      }

      setPriceAnalysis(data);
      setStep(3);
    } catch (error) {
      console.error('Error:', error);
      toast.error("Failed to generate price analysis. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleAnswerChange = (questionId: string, value: string) => {
    setAnswers(prev => ({
      ...prev,
      [questionId]: value
    }));
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  const handleClose = () => {
    setStep(1);
    setQuestions([]);
    setAnswers({});
    setPriceAnalysis(null);
    onOpenChange(false);
  };

  const renderStep1 = () => (
    <div className="space-y-6">
      <div className="text-center">
        <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
          <Sparkles className="w-8 h-8 text-primary" />
        </div>
        <h3 className="text-xl font-semibold mb-2">Price Pro Analysis</h3>
        <p className="text-muted-foreground">
          Let's analyze your service to provide intelligent pricing recommendations
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Service Details
            <Badge variant="outline">{serviceData.category}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide mb-1">
              Service Name
            </h4>
            <p className="text-lg font-semibold">{serviceData.name}</p>
          </div>
          
          {serviceData.description && (
            <div>
              <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide mb-1">
                Description
              </h4>
              <p className="text-sm">{serviceData.description}</p>
            </div>
          )}
          
          <div>
            <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide mb-1">
              Unit Type
            </h4>
            <p className="text-sm">{serviceData.unitType}</p>
          </div>
          
          <div>
            <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide mb-1">
              Market Location
            </h4>
            <p className="text-sm">{businessAddress?.city}, {businessAddress?.state}</p>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleNext} disabled={loading} className="gap-2">
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Generating Questions...
            </>
          ) : (
            <>
              Continue
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </Button>
      </div>
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={handleBack}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h3 className="text-xl font-semibold">Service Details</h3>
          <p className="text-muted-foreground">
            Help us understand your service better for accurate pricing
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {questions.map((question) => (
          <Card key={question.id}>
            <CardContent className="pt-6">
              <label className="block text-sm font-medium mb-2">
                {question.question}
              </label>
              <Textarea
                placeholder={question.placeholder}
                value={answers[question.id] || ''}
                onChange={(e) => handleAnswerChange(question.id, e.target.value)}
                className="min-h-[100px] resize-y"
              />
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex justify-between">
        <Button variant="outline" onClick={handleBack}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <Button onClick={handleNext} disabled={loading} className="gap-2">
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Analyzing...
            </>
          ) : (
            <>
              Get Price Analysis
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </Button>
      </div>
    </div>
  );

  const renderStep3 = () => (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={handleBack}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h3 className="text-xl font-semibold">Price Analysis</h3>
          <p className="text-muted-foreground">
            Based on your service details and market analysis
          </p>
        </div>
      </div>

      {priceAnalysis && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Market Analysis</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-relaxed">{priceAnalysis.marketAnalysis}</p>
            </CardContent>
          </Card>

          <div className="grid gap-4">
            {priceAnalysis.suggestions.map((suggestion, index) => (
              <Card 
                key={suggestion.tier} 
                className={`${suggestion.tier === priceAnalysis.recommendedTier ? 'ring-2 ring-primary' : ''}`}
              >
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-lg">{suggestion.tier}</CardTitle>
                      {suggestion.tier === priceAnalysis.recommendedTier && (
                        <Badge>Recommended</Badge>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-primary">${suggestion.price}</p>
                      <p className="text-sm text-muted-foreground">per {serviceData.unitType}</p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-3">{suggestion.description}</p>
                  <p className="text-sm leading-relaxed">{suggestion.reasoning}</p>
                  <div className="mt-4">
                    <Button 
                      variant={suggestion.tier === priceAnalysis.recommendedTier ? "default" : "outline"} 
                      size="sm"
                      onClick={() => onApplyPrice(suggestion.price)}
                    >
                      Apply ${suggestion.price}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {priceAnalysis.competitiveFactors && priceAnalysis.competitiveFactors.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Key Pricing Factors</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {priceAnalysis.competitiveFactors.map((factor, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <span className="w-2 h-2 rounded-full bg-primary mt-2 flex-shrink-0" />
                      <span className="text-sm">{factor}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            Price Pro
          </DialogTitle>
        </DialogHeader>
        
        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
      </DialogContent>
    </Dialog>
  );
}