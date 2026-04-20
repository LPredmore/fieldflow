import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ExternalLink, CreditCard, Loader2, CheckCircle2, Copy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface LineItem {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

interface Invoice {
  id: string;
  invoice_number: string;
  customer_name: string;
  issue_date: string;
  due_date: string;
  status: string;
  line_items: LineItem[];
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total_amount: number;
  notes?: string;
  payment_terms: string;
  tenant_id: string;
  payment_method_used?: string | null;
  stripe_enabled: boolean;
  payment_settings: any;
}

interface BusinessSettings {
  business_name?: string;
  logo_url?: string;
  business_phone?: string;
  business_email?: string;
  business_address?: any;
}

type Method = "stripe" | "paypal" | "venmo" | "cashapp" | "cash" | "check" | "bank_transfer";

export default function PublicInvoice() {
  const { token } = useParams<{ token: string }>();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const paidParam = searchParams.get("paid") === "1";

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [businessSettings, setBusinessSettings] = useState<BusinessSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stripeLoading, setStripeLoading] = useState(false);
  const [polling, setPolling] = useState(paidParam);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchInvoice = async () => {
    if (!token) return null;
    const { data: invoiceData, error: invoiceError } = await supabase.rpc(
      "get_public_invoice_by_token",
      { token_param: token }
    );
    if (invoiceError || !invoiceData || invoiceData.length === 0) return null;
    const inv = invoiceData[0] as any;
    return {
      ...inv,
      line_items: inv.line_items as unknown as LineItem[],
    } as Invoice;
  };

  useEffect(() => {
    (async () => {
      if (!token) {
        setError("Invalid invoice link");
        setLoading(false);
        return;
      }
      try {
        const inv = await fetchInvoice();
        if (!inv) {
          setError("Invoice not found or link has expired");
          setLoading(false);
          return;
        }
        setInvoice(inv);

        const { data: settingsData } = await supabase
          .from("settings")
          .select("business_name, logo_url, business_phone, business_email, business_address")
          .eq("tenant_id", inv.tenant_id)
          .maybeSingle();
        if (settingsData) setBusinessSettings(settingsData);
      } catch (err) {
        console.error("Error fetching invoice:", err);
        setError("Failed to load invoice");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Poll after returning from Stripe
  useEffect(() => {
    if (!paidParam || !invoice || invoice.status === "paid") {
      setPolling(false);
      return;
    }
    setPolling(true);
    let attempts = 0;
    const maxAttempts = 10; // 20s total
    pollTimerRef.current = setInterval(async () => {
      attempts++;
      const inv = await fetchInvoice();
      if (inv?.status === "paid") {
        setInvoice(inv);
        setPolling(false);
        if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      } else if (attempts >= maxAttempts) {
        setPolling(false);
        if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      }
    }, 2000);
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paidParam, invoice?.id]);

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case "paid":
        return "default";
      case "sent":
        return "secondary";
      case "overdue":
        return "destructive";
      default:
        return "outline";
    }
  };

  const handleStripeCheckout = async () => {
    if (!token) return;
    setStripeLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-invoice-checkout", {
        body: { share_token: token, return_origin: window.location.origin },
      });
      if (error) throw error;
      if (data?.url) window.location.href = data.url;
    } catch (e: any) {
      toast({ variant: "destructive", title: "Could not start checkout", description: e.message });
      setStripeLoading(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: `${label} copied` });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-lg">Loading invoice...</div>
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="p-6 text-center">
            <h1 className="text-xl font-semibold mb-2">Invoice Not Found</h1>
            <p className="text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const ps = invoice.payment_settings ?? {};
  const enabled: Method[] = Array.isArray(ps.enabled_methods) ? ps.enabled_methods : [];
  const isPaid = invoice.status === "paid";
  const showStripe = enabled.includes("stripe") && invoice.stripe_enabled && !isPaid;

  return (
    <div className="min-h-screen bg-background py-8">
      <div className="container mx-auto px-4 max-w-4xl">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              {businessSettings?.logo_url && (
                <img
                  src={businessSettings.logo_url}
                  alt={businessSettings.business_name || "Business Logo"}
                  className="h-12 mb-2"
                />
              )}
              <h1 className="text-2xl font-bold">
                {businessSettings?.business_name || "Invoice"}
              </h1>
            </div>
            <Badge variant={getStatusBadgeVariant(invoice.status)} className="text-sm">
              {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
            </Badge>
          </div>
        </div>

        {/* Paid success / polling banner */}
        {paidParam && isPaid && (
          <Alert className="mb-6 border-success/30 bg-success/10">
            <CheckCircle2 className="h-4 w-4 text-success" />
            <AlertDescription className="text-success">
              Payment received — thank you!
            </AlertDescription>
          </Alert>
        )}
        {paidParam && !isPaid && polling && (
          <Alert className="mb-6">
            <Loader2 className="h-4 w-4 animate-spin" />
            <AlertDescription>Confirming your payment…</AlertDescription>
          </Alert>
        )}
        {paidParam && !isPaid && !polling && (
          <Alert className="mb-6">
            <AlertDescription>
              Payment processing — this page will update once your payment is confirmed.
            </AlertDescription>
          </Alert>
        )}

        {/* Invoice Details */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Invoice #{invoice.invoice_number}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <h3 className="font-semibold mb-2">Bill To:</h3>
                <p>{invoice.customer_name}</p>
              </div>
              <div>
                <h3 className="font-semibold mb-2">Invoice Date:</h3>
                <p>{formatDate(invoice.issue_date)}</p>
              </div>
              <div>
                <h3 className="font-semibold mb-2">Due Date:</h3>
                <p>{formatDate(invoice.due_date)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Line Items */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Items</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2">Description</th>
                    <th className="text-center py-2">Qty</th>
                    <th className="text-right py-2">Unit Price</th>
                    <th className="text-right py-2">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.line_items.map((item) => (
                    <tr key={item.id} className="border-b">
                      <td className="py-2">{item.description}</td>
                      <td className="text-center py-2">{item.quantity}</td>
                      <td className="text-right py-2">{formatCurrency(item.unit_price)}</td>
                      <td className="text-right py-2">{formatCurrency(item.total_price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-6 space-y-2">
              <div className="flex justify-between">
                <span>Subtotal:</span>
                <span>{formatCurrency(invoice.subtotal)}</span>
              </div>
              {invoice.tax_amount > 0 && (
                <div className="flex justify-between">
                  <span>Tax ({(invoice.tax_rate * 100).toFixed(2)}%):</span>
                  <span>{formatCurrency(invoice.tax_amount)}</span>
                </div>
              )}
              <Separator />
              <div className="flex justify-between text-lg font-semibold">
                <span>Total:</span>
                <span>{formatCurrency(invoice.total_amount)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Payment Information */}
        {!isPaid && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Pay this invoice</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="font-semibold mb-1">Payment Terms</h4>
                <p className="text-sm text-muted-foreground">{invoice.payment_terms}</p>
              </div>

              {/* Stripe primary button */}
              {showStripe && (
                <Button
                  size="lg"
                  className="w-full"
                  onClick={handleStripeCheckout}
                  disabled={stripeLoading}
                >
                  {stripeLoading ? (
                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                  ) : (
                    <CreditCard className="h-5 w-5 mr-2" />
                  )}
                  Pay {formatCurrency(invoice.total_amount)} with Card or Bank
                </Button>
              )}

              {/* Manual methods */}
              <div className="space-y-3">
                {enabled.includes("paypal") && ps.paypal_me_link && (
                  <Button
                    variant="outline"
                    className="w-full justify-between"
                    onClick={() => window.open(ps.paypal_me_link, "_blank")}
                  >
                    Pay with PayPal
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                )}

                {enabled.includes("venmo") && ps.venmo_handle && (
                  <div className="p-3 border rounded-lg flex items-center justify-between gap-3">
                    <div>
                      <h4 className="font-semibold">Venmo</h4>
                      <p className="text-sm">{ps.venmo_handle.startsWith("@") ? ps.venmo_handle : `@${ps.venmo_handle}`}</p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => copyToClipboard(ps.venmo_handle, "Venmo handle")}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                )}

                {enabled.includes("cashapp") && ps.cashapp_handle && (
                  <div className="p-3 border rounded-lg flex items-center justify-between gap-3">
                    <div>
                      <h4 className="font-semibold">Cash App</h4>
                      <p className="text-sm">{ps.cashapp_handle.startsWith("$") ? ps.cashapp_handle : `$${ps.cashapp_handle}`}</p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => copyToClipboard(ps.cashapp_handle, "Cash App tag")}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                )}

                {enabled.includes("check") && (
                  <div className="p-3 border rounded-lg">
                    <h4 className="font-semibold mb-1">Check</h4>
                    <p className="text-sm">
                      Make checks payable to{" "}
                      <span className="font-medium">{ps.check_payable_to || businessSettings?.business_name || "the business"}</span>
                    </p>
                  </div>
                )}

                {enabled.includes("bank_transfer") && ps.bank_transfer_instructions && (
                  <div className="p-3 border rounded-lg">
                    <h4 className="font-semibold mb-1">Bank Transfer</h4>
                    <p className="text-sm whitespace-pre-wrap">{ps.bank_transfer_instructions}</p>
                  </div>
                )}

                {enabled.includes("cash") && (
                  <div className="p-3 border rounded-lg">
                    <h4 className="font-semibold mb-1">Cash</h4>
                    <p className="text-sm">Cash accepted in person.</p>
                  </div>
                )}

                {ps.payment_instructions && (
                  <div className="p-3 border rounded-lg bg-muted/40">
                    <h4 className="font-semibold mb-1">Additional Notes</h4>
                    <p className="text-sm whitespace-pre-wrap">{ps.payment_instructions}</p>
                  </div>
                )}
              </div>

              {businessSettings?.business_phone && (
                <div className="pt-4 border-t">
                  <p className="text-sm text-muted-foreground">
                    Questions? Contact us at {businessSettings.business_phone}
                    {businessSettings.business_email && <> or {businessSettings.business_email}</>}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Notes */}
        {invoice.notes && (
          <Card>
            <CardHeader>
              <CardTitle>Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap">{invoice.notes}</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
