import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Printer, X } from "lucide-react";
import { format } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface Quote {
  id: string;
  quote_number: string;
  customer_name: string;
  title: string;
  status: string;
  created_at: string;
  valid_until?: string;
  is_emergency?: boolean;
  line_items: Array<{
    description: string;
    quantity: number;
    unit_price: number;
    total: number;
    taxable?: boolean;
  }>;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total_amount: number;
  notes?: string;
  terms: string;
  created_by_user_name?: string;
}

interface QuotePreviewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quote: Quote | null;
}

export function QuotePreview({ open, onOpenChange, quote }: QuotePreviewProps) {
  // Fetch business settings for display
  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("settings")
        .select("*")
        .single();

      if (error) throw error;
      return data;
    },
  });

  if (!quote) return null;

  const handlePrint = () => {
    window.print();
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  };

  const businessAddress = settings?.business_address ? 
    `${(settings.business_address as any)?.street || ''}, ${(settings.business_address as any)?.city || ''}, ${(settings.business_address as any)?.state || ''} ${(settings.business_address as any)?.zip_code || ''}`.replace(/^,\s*|,\s*$/g, '')
    : '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="flex flex-row items-center justify-between">
          <DialogTitle>Quote Preview - {quote.quote_number}</DialogTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handlePrint}>
              <Printer className="h-4 w-4 mr-2" />
              Print
            </Button>
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        <div className="space-y-6 print:space-y-4">
          {/* Business Header */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex justify-between items-start mb-6">
                <div>
                  {settings?.logo_url && (
                    <img 
                      src={settings.logo_url} 
                      alt="Company Logo" 
                      className="h-16 mb-4"
                    />
                  )}
                  <h1 className="text-2xl font-bold text-primary">
                    {settings?.business_name || 'FieldFlow Business'}
                  </h1>
                  {businessAddress && (
                    <p className="text-muted-foreground mt-2">{businessAddress}</p>
                  )}
                  {settings?.business_phone && (
                    <p className="text-muted-foreground">Phone: {settings.business_phone}</p>
                  )}
                  {settings?.business_email && (
                    <p className="text-muted-foreground">Email: {settings.business_email}</p>
                  )}
                  {settings?.business_website && (
                    <p className="text-muted-foreground">Web: {settings.business_website}</p>
                  )}
                </div>
                <div className="text-right">
                  <h2 className="text-3xl font-bold text-primary mb-2">QUOTE</h2>
                  <p className="text-lg text-muted-foreground">{quote.quote_number}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Quote Details */}
          <Card>
            <CardContent className="pt-6">

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="font-semibold mb-2">Quote Details</h3>
                  <div className="space-y-1 text-sm">
                    <div>
                      <span className="font-medium">Title:</span> {quote.title}
                    </div>
                    <div>
                      <span className="font-medium">Date:</span> {format(new Date(quote.created_at), "MMMM dd, yyyy")}
                    </div>
                    {quote.valid_until && (
                      <div>
                        <span className="font-medium">Valid Until:</span> {format(new Date(quote.valid_until), "MMMM dd, yyyy")}
                      </div>
                    )}
                    <div>
                      <span className="font-medium">Status:</span> 
                      <span className="ml-2 px-2 py-1 bg-primary/10 text-primary rounded text-xs capitalize">
                        {quote.status}
                      </span>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold mb-2">Customer</h3>
                  <div className="space-y-1 text-sm">
                    <div className="font-medium">{quote.customer_name}</div>
                  </div>
                  
                  {quote.created_by_user_name && (
                    <div className="mt-4">
                      <h3 className="font-semibold mb-2">Prepared by</h3>
                      <div className="text-sm">
                        <div className="font-medium">{quote.created_by_user_name}</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Line Items */}
          <Card>
            <CardContent className="pt-6">
              <h3 className="font-semibold mb-4">Services</h3>
              
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2">Description</th>
                      <th className="text-right py-2">Qty</th>
                      <th className="text-right py-2">Unit Price</th>
                      <th className="text-center py-2">Tax</th>
                      <th className="text-right py-2">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quote.line_items.map((item, index) => (
                      <tr key={index} className="border-b">
                        <td className="py-2">{item.description}</td>
                        <td className="text-right py-2">{item.quantity}</td>
                        <td className="text-right py-2">{formatCurrency(item.unit_price)}</td>
                        <td className="text-center py-2">
                          {item.taxable === false ? "No" : "Yes"}
                        </td>
                        <td className="text-right py-2">{formatCurrency(item.total)}</td>
                      </tr>
                    ))}
                    {quote.is_emergency && (
                      <tr className="border-b bg-orange-50">
                        <td className="py-2 font-medium text-orange-800">Emergency Service Surcharge</td>
                        <td className="text-right py-2">-</td>
                        <td className="text-right py-2">-</td>
                        <td className="text-center py-2">No</td>
                        <td className="text-right py-2 font-medium text-orange-800">
                          {formatCurrency(quote.subtotal - quote.line_items.reduce((sum, item) => sum + item.total, 0))}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <Separator className="my-4" />

              {/* Totals */}
              <div className="flex justify-end">
                <div className="w-64 space-y-2">
                  <div className="flex justify-between">
                    <span>Subtotal:</span>
                    <span>{formatCurrency(quote.line_items.reduce((sum, item) => sum + item.total, 0))}</span>
                  </div>
                  {quote.is_emergency && quote.subtotal > quote.line_items.reduce((sum, item) => sum + item.total, 0) && (
                    <div className="flex justify-between text-orange-600">
                      <span>Emergency Service:</span>
                      <span>{formatCurrency(quote.subtotal - quote.line_items.reduce((sum, item) => sum + item.total, 0))}</span>
                    </div>
                  )}
                  {quote.tax_amount > 0 && (
                    <div className="flex justify-between">
                      <span>Tax ({quote.tax_rate}% on taxable items):</span>
                      <span>{formatCurrency(quote.tax_amount)}</span>
                    </div>
                  )}
                  <Separator />
                  <div className="flex justify-between font-bold text-lg">
                    <span>Total:</span>
                    <span>{formatCurrency(quote.total_amount)}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Notes */}
          {quote.notes && (
            <Card>
              <CardContent className="pt-6">
                <h3 className="font-semibold mb-2">Notes</h3>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{quote.notes}</p>
              </CardContent>
            </Card>
          )}

          {/* Terms & Conditions */}
          <Card>
            <CardContent className="pt-6">
              <h3 className="font-semibold mb-2">Terms & Conditions</h3>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{quote.terms}</p>
            </CardContent>
          </Card>

          {/* Footer */}
          <div className="text-center text-sm text-muted-foreground pt-4 border-t">
            <p>Thank you for your business!</p>
            <p className="mt-2">This quote is valid until {quote.valid_until ? format(new Date(quote.valid_until), "MMMM dd, yyyy") : "further notice"}.</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}