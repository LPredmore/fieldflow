import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { CheckCircle, XCircle, FileText, Mail, Phone, Globe } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";

interface Quote {
  id: string;
  quote_number: string;
  customer_name: string;
  title: string;
  status: string;
  valid_until: string;
  line_items: Array<{
    description: string;
    quantity: number;
    unit_price: number;
    total: number;
    taxable: boolean;
  }>;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  notes: string;
  terms: string;
  created_by_user_name?: string;
}

interface BusinessSettings {
  business_name: string;
  business_email: string;
  business_phone: string;
  business_website: string;
  business_address: any;
  logo_url: string;
}

export default function PublicQuote() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [quote, setQuote] = useState<Quote | null>(null);
  const [settings, setSettings] = useState<BusinessSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [responding, setResponding] = useState(false);
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerComments, setCustomerComments] = useState("");
  const [hasResponded, setHasResponded] = useState(false);

  useEffect(() => {
    if (!token) {
      navigate("/");
      return;
    }

    loadQuote();
  }, [token]);

  const loadQuote = async () => {
    try {
      // Load quote by share token using secure function with limited data exposure
      const { data: quoteData, error: quoteError } = await supabase
        .rpc("get_public_quote_by_token", { token_param: token });

      if (quoteError || !quoteData || quoteData.length === 0) {
        toast({
          title: "Quote not found",
          description: "This quote link may be invalid or expired.",
          variant: "destructive",
        });
        return;
      }

      const quote = quoteData[0]; // RPC returns an array
      setQuote({
        ...quote,
        line_items: quote.line_items as any,
        created_by_user_name: 'Professional Services' // No longer exposing creator info
      });

      // Load business settings
      const { data: settingsData } = await supabase
        .from("settings")
        .select("*")
        .eq("tenant_id", quote.tenant_id)
        .single();

      if (settingsData) {
        setSettings(settingsData);
      }

      // Record that the quote was viewed
      await recordResponse("viewed");

    } catch (error) {
      console.error("Error loading quote:", error);
      toast({
        title: "Error",
        description: "Failed to load quote details.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const recordResponse = async (responseType: "viewed" | "accepted" | "declined") => {
    if (!token) return;

    try {
      const response = await supabase.functions.invoke("quote-response", {
        body: {
          shareToken: token,
          responseType,
          customerEmail: customerEmail || undefined,
          customerComments: customerComments || undefined,
        },
      });

      if (response.error) {
        throw response.error;
      }

      return response.data;
    } catch (error) {
      console.error("Error recording response:", error);
      throw error;
    }
  };

  const handleResponse = async (responseType: "accepted" | "declined") => {
    if (!customerEmail.trim()) {
      toast({
        title: "Email required",
        description: "Please provide your email address to respond to this quote.",
        variant: "destructive",
      });
      return;
    }

    setResponding(true);
    try {
      await recordResponse(responseType);
      
      setHasResponded(true);
      toast({
        title: `Quote ${responseType}`,
        description: `Thank you! Your response has been recorded and the business has been notified.`,
      });

    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to record your response. Please try again.",
        variant: "destructive",
      });
    } finally {
      setResponding(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <p>Loading quote...</p>
        </div>
      </div>
    );
  }

  if (!quote) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <XCircle className="h-12 w-12 mx-auto mb-4 text-destructive" />
          <h1 className="text-2xl font-bold mb-2">Quote Not Found</h1>
          <p className="text-muted-foreground">This quote link may be invalid or expired.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background py-8">
      <div className="container max-w-4xl mx-auto px-4">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">
            {settings?.business_name || "Business Quote"}
          </h1>
          <p className="text-muted-foreground">
            Quote for {quote.customer_name}
          </p>
        </div>

        {/* Quote Details */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Quote {quote.quote_number}</span>
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                quote.status === 'accepted' ? 'bg-green-100 text-green-800' :
                quote.status === 'declined' ? 'bg-red-100 text-red-800' :
                quote.status === 'sent' ? 'bg-blue-100 text-blue-800' :
                'bg-gray-100 text-gray-800'
              }`}>
                {quote.status.charAt(0).toUpperCase() + quote.status.slice(1)}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div>
                <p><strong>Service:</strong> {quote.title}</p>
                <p><strong>Customer:</strong> {quote.customer_name}</p>
                {quote.created_by_user_name && (
                  <p><strong>Prepared by:</strong> {quote.created_by_user_name}</p>
                )}
              </div>
              <div>
                <p><strong>Valid Until:</strong> {format(new Date(quote.valid_until), "PPP")}</p>
                <p><strong>Total Amount:</strong> {formatCurrency(quote.total_amount)}</p>
              </div>
            </div>

            {/* Line Items */}
            <div className="mb-6">
              <h3 className="text-lg font-semibold mb-3">Services</h3>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse border border-border">
                  <thead>
                    <tr className="bg-muted">
                      <th className="border border-border p-2 text-left">Description</th>
                      <th className="border border-border p-2 text-center">Qty</th>
                      <th className="border border-border p-2 text-right">Unit Price</th>
                      <th className="border border-border p-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quote.line_items.map((item, index) => (
                      <tr key={index}>
                        <td className="border border-border p-2">{item.description}</td>
                        <td className="border border-border p-2 text-center">{item.quantity}</td>
                        <td className="border border-border p-2 text-right">
                          {formatCurrency(item.unit_price)}
                        </td>
                        <td className="border border-border p-2 text-right">
                          {formatCurrency(item.total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Totals */}
            <div className="flex justify-end mb-6">
              <div className="w-64">
                <div className="flex justify-between py-1">
                  <span>Subtotal:</span>
                  <span>{formatCurrency(quote.subtotal)}</span>
                </div>
                {quote.tax_amount > 0 && (
                  <div className="flex justify-between py-1">
                    <span>Tax:</span>
                    <span>{formatCurrency(quote.tax_amount)}</span>
                  </div>
                )}
                <Separator className="my-2" />
                <div className="flex justify-between py-1 font-bold text-lg">
                  <span>Total:</span>
                  <span>{formatCurrency(quote.total_amount)}</span>
                </div>
              </div>
            </div>

            {/* Notes and Terms */}
            {quote.notes && (
              <div className="mb-4">
                <h4 className="font-semibold mb-2">Notes:</h4>
                <p className="text-sm text-muted-foreground">{quote.notes}</p>
              </div>
            )}

            <div className="mb-6">
              <h4 className="font-semibold mb-2">Terms & Conditions:</h4>
              <p className="text-sm text-muted-foreground">{quote.terms}</p>
            </div>
          </CardContent>
        </Card>

        {/* Response Section */}
        {!hasResponded && quote.status !== 'accepted' && quote.status !== 'declined' && (
          <Card>
            <CardHeader>
              <CardTitle>Your Response</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="email">Your Email Address *</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="your@email.com"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  required
                />
              </div>

              <div>
                <Label htmlFor="comments">Comments (Optional)</Label>
                <Textarea
                  id="comments"
                  placeholder="Any questions or comments about this quote..."
                  value={customerComments}
                  onChange={(e) => setCustomerComments(e.target.value)}
                />
              </div>

              <div className="flex gap-4 pt-4">
                <Button
                  onClick={() => handleResponse("accepted")}
                  disabled={responding || !customerEmail.trim()}
                  className="flex-1"
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Accept Quote
                </Button>
                <Button
                  onClick={() => handleResponse("declined")}
                  disabled={responding || !customerEmail.trim()}
                  variant="outline"
                  className="flex-1"
                >
                  <XCircle className="w-4 h-4 mr-2" />
                  Decline Quote
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Response Confirmation */}
        {hasResponded && (
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-600" />
                <h3 className="text-lg font-semibold mb-2">Response Recorded</h3>
                <p className="text-muted-foreground">
                  Thank you for your response! The business has been notified and will contact you soon.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Business Contact Info */}
        {settings && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Contact Information</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {settings.business_email && (
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <a href={`mailto:${settings.business_email}`} className="text-primary hover:underline">
                      {settings.business_email}
                    </a>
                  </div>
                )}
                {settings.business_phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <a href={`tel:${settings.business_phone}`} className="text-primary hover:underline">
                      {settings.business_phone}
                    </a>
                  </div>
                )}
                {settings.business_website && (
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4 text-muted-foreground" />
                    <a href={settings.business_website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                      Website
                    </a>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}