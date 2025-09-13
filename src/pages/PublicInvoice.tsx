import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ExternalLink } from "lucide-react";

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
  payment_instructions?: string;
  paypal_me_link?: string;
  venmo_handle?: string;
}

interface BusinessSettings {
  business_name?: string;
  logo_url?: string;
  business_phone?: string;
  business_email?: string;
  business_address?: any;
  paypal_me_link?: string;
  venmo_handle?: string;
  payment_instructions?: string;
}

export default function PublicInvoice() {
  const { token } = useParams<{ token: string }>();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [businessSettings, setBusinessSettings] = useState<BusinessSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchInvoice = async () => {
      if (!token) {
        setError("Invalid invoice link");
        setLoading(false);
        return;
      }

      try {
        // Fetch invoice by share token
        const { data: invoiceData, error: invoiceError } = await supabase
          .from("invoices")
          .select("*")
          .eq("share_token", token)
          .single();

        if (invoiceError || !invoiceData) {
          setError("Invoice not found or link has expired");
          setLoading(false);
          return;
        }

        setInvoice({
          ...invoiceData,
          line_items: invoiceData.line_items as unknown as LineItem[]
        });

        // Fetch business settings for payment info
        const { data: settingsData } = await supabase
          .from("settings")
          .select("business_name, logo_url, business_phone, business_email, business_address, payment_settings")
          .eq("tenant_id", invoiceData.tenant_id)
          .single();

        if (settingsData) {
          const paymentSettings = settingsData.payment_settings as any;
          setBusinessSettings({
            ...settingsData,
            paypal_me_link: paymentSettings?.paypal_me_link,
            venmo_handle: paymentSettings?.venmo_handle,
            payment_instructions: paymentSettings?.payment_instructions,
          });
        }
      } catch (err) {
        console.error("Error fetching invoice:", err);
        setError("Failed to load invoice");
      } finally {
        setLoading(false);
      }
    };

    fetchInvoice();
  }, [token]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

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

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-pulse text-lg">Loading invoice...</div>
        </div>
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
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Payment Information</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <h4 className="font-semibold mb-2">Payment Terms:</h4>
                <p>{invoice.payment_terms}</p>
              </div>

              {/* Payment Methods */}
              <div className="space-y-3">
                {businessSettings?.paypal_me_link && (
                  <Button
                    variant="outline"
                    className="w-full justify-between"
                    onClick={() => window.open(businessSettings.paypal_me_link, "_blank")}
                  >
                    Pay with PayPal
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                )}

                {businessSettings?.venmo_handle && (
                  <div className="p-3 border rounded-lg">
                    <h4 className="font-semibold mb-1">Venmo:</h4>
                    <p>@{businessSettings.venmo_handle}</p>
                  </div>
                )}

                {businessSettings?.payment_instructions && (
                  <div className="p-3 border rounded-lg">
                    <h4 className="font-semibold mb-1">Payment Instructions:</h4>
                    <p className="whitespace-pre-wrap">{businessSettings.payment_instructions}</p>
                  </div>
                )}
              </div>

              {businessSettings?.business_phone && (
                <div className="pt-4 border-t">
                  <p className="text-sm text-muted-foreground">
                    Questions? Contact us at {businessSettings.business_phone}
                    {businessSettings.business_email && (
                      <> or {businessSettings.business_email}</>
                    )}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

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