import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useClientCustomer } from '@/hooks/useClientCustomer';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Receipt, ExternalLink, Calendar, DollarSign, CreditCard, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';

interface Invoice {
  id: string;
  invoice_number: string;
  status: string;
  total_amount: number;
  due_date: string;
  issue_date: string;
  share_token: string | null;
}

export default function ClientInvoices() {
  const { customer, loading: customerLoading } = useClientCustomer();
  const { toast } = useToast();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [payingInvoiceId, setPayingInvoiceId] = useState<string | null>(null);
  const [stripeEnabled, setStripeEnabled] = useState<boolean | null>(null);

  const handlePayNow = async (invoice: Invoice) => {
    if (!invoice.share_token) {
      toast({
        title: 'Cannot pay invoice',
        description: 'This invoice does not have a payment link available. Please contact support.',
        variant: 'destructive',
      });
      return;
    }

    setPayingInvoiceId(invoice.id);
    try {
      const { data, error } = await supabase.functions.invoke('create-invoice-checkout', {
        body: {
          share_token: invoice.share_token,
          return_origin: window.location.origin,
        },
      });

      if (error) throw error;
      if (!data?.url) throw new Error('No checkout URL returned');

      window.location.href = data.url;
    } catch (err: any) {
      console.error('Payment error:', err);
      toast({
        title: 'Unable to start payment',
        description: err?.message || 'Please try again or contact support.',
        variant: 'destructive',
      });
      setPayingInvoiceId(null);
    }
  };

  useEffect(() => {
    const fetchInvoices = async () => {
      if (!customer?.id) {
        setLoading(false);
        return;
      }

      try {
        const [{ data, error }, { data: stripeData }] = await Promise.all([
          supabase
            .from('invoices')
            .select('id, invoice_number, status, total_amount, due_date, issue_date, share_token')
            .eq('customer_id', customer.id)
            .order('issue_date', { ascending: false }),
          supabase.rpc('is_stripe_enabled_for_customer', { _customer_id: customer.id }),
        ]);

        if (error) throw error;
        setInvoices(data || []);
        setStripeEnabled(Boolean(stripeData));
      } catch (err) {
        console.error('Error fetching invoices:', err);
      } finally {
        setLoading(false);
      }
    };

    if (!customerLoading) {
      fetchInvoices();
    }
  }, [customer, customerLoading]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'sent':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      case 'draft':
        return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200';
      case 'overdue':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      case 'cancelled':
        return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200';
    }
  };

  if (loading || customerLoading) {
    return (
      <div className="p-6 lg:p-8 space-y-6">
        <Skeleton className="h-10 w-48" />
        <div className="space-y-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">My Invoices</h1>
        <p className="text-muted-foreground">
          View your invoices and payment history.
        </p>
      </div>

      {invoices.length === 0 ? (
        <Card className="shadow-material-md">
          <CardContent className="py-12 text-center">
            <Receipt className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-medium mb-2">No Invoices Yet</h3>
            <p className="text-muted-foreground">
              You haven't received any invoices yet. When you do, they'll appear here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {invoices.map((invoice) => (
            <Card key={invoice.id} className="shadow-material-md hover:shadow-material-lg transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg">Invoice #{invoice.invoice_number}</CardTitle>
                    <CardDescription>
                      Issued {format(new Date(invoice.issue_date), 'MMM d, yyyy')}
                    </CardDescription>
                  </div>
                  <Badge className={getStatusColor(invoice.status)}>
                    {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground mb-4">
                  <div className="flex items-center gap-1">
                    <DollarSign className="h-4 w-4" />
                    <span className="font-medium text-foreground">
                      ${invoice.total_amount.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Calendar className="h-4 w-4" />
                    <span>Due {format(new Date(invoice.due_date), 'MMM d, yyyy')}</span>
                  </div>
                </div>
                
                {invoice.status !== 'paid' && invoice.status !== 'cancelled' && (
                  <div className="flex flex-wrap gap-2">
                    {invoice.share_token && (
                      <>
                        <Button
                          size="sm"
                          onClick={() => handlePayNow(invoice)}
                          disabled={payingInvoiceId === invoice.id}
                        >
                          {payingInvoiceId === invoice.id ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Starting payment…
                            </>
                          ) : (
                            <>
                              <CreditCard className="h-4 w-4 mr-2" />
                              Pay Now
                            </>
                          )}
                        </Button>
                        <Button asChild variant="outline" size="sm">
                          <a
                            href={`/public-invoice/${invoice.share_token}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <ExternalLink className="h-4 w-4 mr-2" />
                            View Invoice
                          </a>
                        </Button>
                      </>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
