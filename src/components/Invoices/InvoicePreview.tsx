import { format } from "date-fns";
import { Printer, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Invoice } from "@/hooks/useInvoices";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface InvoicePreviewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: Invoice | null;
}

export function InvoicePreview({ open, onOpenChange, invoice }: InvoicePreviewProps) {
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

  if (!invoice) return null;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const handlePrint = () => {
    window.print();
  };

  const businessAddress = settings?.business_address ? 
    (() => {
      const addr = settings.business_address as any;
      return `${addr?.street || ''}, ${addr?.city || ''}, ${addr?.state || ''} ${addr?.zip_code || ''}`.replace(/^,\s*|,\s*$/g, '');
    })()
    : '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto print:max-w-none print:max-h-none print:overflow-visible">
        <DialogHeader className="print:hidden">
          <div className="flex items-center justify-between">
            <DialogTitle>Invoice Preview</DialogTitle>
            <div className="flex gap-2">
              <Button onClick={handlePrint} size="sm">
                <Printer className="h-4 w-4 mr-2" />
                Print
              </Button>
              <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                <X className="h-4 w-4 mr-2" />
                Close
              </Button>
            </div>
          </div>
        </DialogHeader>

        {/* Invoice Content */}
        <div className="bg-white text-black p-8 print:p-0 print:shadow-none">
          {/* Header */}
          <div className="flex justify-between items-start mb-8">
            <div>
              {settings?.logo_url && (
                <img 
                  src={settings.logo_url} 
                  alt="Company Logo" 
                  className="h-16 mb-4"
                />
              )}
              <h1 className="text-3xl font-bold text-primary">
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
              <h2 className="text-2xl font-bold mb-4">INVOICE</h2>
              <div className="space-y-1">
                <p><strong>Invoice #:</strong> {invoice.invoice_number}</p>
                <p><strong>Issue Date:</strong> {format(new Date(invoice.issue_date), 'MMM dd, yyyy')}</p>
                <p><strong>Due Date:</strong> {format(new Date(invoice.due_date), 'MMM dd, yyyy')}</p>
              </div>
            </div>
          </div>

          {/* Bill To Section */}
          <div className="mb-8">
            <h3 className="text-lg font-semibold mb-3">Bill To:</h3>
            <div className="bg-muted/20 p-4 rounded-lg">
              <p className="font-semibold">{invoice.customer_name}</p>
              {/* Note: Customer address would need to be fetched if needed */}
            </div>
          </div>

          {/* Line Items Table */}
          <div className="mb-8">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b-2 border-primary">
                  <th className="text-left py-2 font-semibold">Description</th>
                  <th className="text-center py-2 font-semibold w-20">Qty</th>
                  <th className="text-right py-2 font-semibold w-24">Unit Price</th>
                  <th className="text-right py-2 font-semibold w-24">Total</th>
                </tr>
              </thead>
              <tbody>
                {invoice.line_items.map((item, index) => (
                  <tr key={index} className="border-b border-muted">
                    <td className="py-3">{item.description}</td>
                    <td className="py-3 text-center">{item.quantity}</td>
                    <td className="py-3 text-right">{formatCurrency(item.unit_price)}</td>
                    <td className="py-3 text-right">{formatCurrency(item.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals Section */}
          <div className="flex justify-end mb-8">
            <div className="w-64">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span>Subtotal:</span>
                  <span>{formatCurrency(invoice.subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Tax ({invoice.tax_rate}%):</span>
                  <span>{formatCurrency(invoice.tax_amount)}</span>
                </div>
                <div className="flex justify-between font-bold text-lg border-t pt-2">
                  <span>Total:</span>
                  <span>{formatCurrency(invoice.total_amount)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Payment Terms */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold mb-2">Payment Terms</h3>
            <p className="text-muted-foreground">{invoice.payment_terms}</p>
          </div>

          {/* Payment Instructions */}
          {(settings?.payment_settings || invoice.payment_instructions || invoice.venmo_handle || invoice.paypal_me_link) && (
            <div className="mb-6">
              <h3 className="text-lg font-semibold mb-2">Payment Instructions</h3>
              <div className="space-y-1 text-sm">
                {invoice.payment_instructions && (
                  <p>{invoice.payment_instructions}</p>
                )}
                {invoice.venmo_handle && (
                  <p><strong>Venmo:</strong> @{invoice.venmo_handle}</p>
                )}
                {invoice.paypal_me_link && (
                  <p><strong>PayPal:</strong> {invoice.paypal_me_link}</p>
                )}
                {settings?.payment_settings && (settings.payment_settings as any)?.bank_account && (
                  <div>
                    <p><strong>Bank Transfer:</strong></p>
                    <p className="ml-4">Account: {(settings.payment_settings as any).bank_account}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Notes */}
          {invoice.notes && (
            <div className="mb-6">
              <h3 className="text-lg font-semibold mb-2">Notes</h3>
              <p className="text-muted-foreground">{invoice.notes}</p>
            </div>
          )}

          {/* Footer */}
          <div className="text-center text-sm text-muted-foreground border-t pt-4">
            <p>Thank you for your business!</p>
            {settings?.business_name && (
              <p className="mt-1">{settings.business_name}</p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}