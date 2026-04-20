import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useClientCustomer } from '@/hooks/useClientCustomer';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { FileText, ExternalLink, Calendar, DollarSign, Check, X, Loader2 } from 'lucide-react';
import { format } from 'date-fns';

interface Quote {
  id: string;
  quote_number: string;
  title: string;
  status: string;
  total_amount: number;
  valid_until: string | null;
  created_at: string;
  share_token: string | null;
}

type PendingAction = { quoteId: string; action: 'accepted' | 'declined' } | null;

export default function ClientQuotes() {
  const { customer, loading: customerLoading } = useClientCustomer();
  const { toast } = useToast();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<PendingAction>(null);
  const [submittingId, setSubmittingId] = useState<string | null>(null);

  const fetchQuotes = async () => {
    if (!customer?.id) {
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('quotes')
        .select('id, quote_number, title, status, total_amount, valid_until, created_at, share_token')
        .eq('customer_id', customer.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setQuotes(data || []);
    } catch (err) {
      console.error('Error fetching quotes:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!customerLoading) {
      fetchQuotes();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer, customerLoading]);

  const confirmResponse = async () => {
    if (!pending) return;
    const { quoteId, action } = pending;
    setSubmittingId(quoteId);
    try {
      const { error } = await supabase
        .from('quotes')
        .update({ status: action })
        .eq('id', quoteId);

      if (error) throw error;

      // Optimistic local update
      setQuotes((prev) => prev.map((q) => (q.id === quoteId ? { ...q, status: action } : q)));

      toast({
        title: action === 'accepted' ? 'Quote accepted' : 'Quote declined',
        description:
          action === 'accepted'
            ? 'Thanks! The team has been notified and will follow up shortly.'
            : 'Got it — the team has been notified of your decision.',
      });
    } catch (err: any) {
      console.error('Error responding to quote:', err);
      toast({
        variant: 'destructive',
        title: 'Could not submit response',
        description: err?.message ?? 'Please try again.',
      });
    } finally {
      setSubmittingId(null);
      setPending(null);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'accepted':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'sent':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      case 'draft':
        return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200';
      case 'requested':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
      case 'declined':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      case 'expired':
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
        <h1 className="text-3xl font-bold text-foreground mb-2">My Quotes</h1>
        <p className="text-muted-foreground">
          View quotes sent to you and respond to them.
        </p>
      </div>

      {quotes.length === 0 ? (
        <Card className="shadow-material-md">
          <CardContent className="py-12 text-center">
            <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-medium mb-2">No Quotes Yet</h3>
            <p className="text-muted-foreground">
              You haven't received any quotes yet. When you do, they'll appear here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {quotes.map((quote) => {
            const isSent = quote.status === 'sent';
            const isSubmitting = submittingId === quote.id;
            return (
              <Card key={quote.id} className="shadow-material-md hover:shadow-material-lg transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg">{quote.title}</CardTitle>
                      <CardDescription>Quote #{quote.quote_number}</CardDescription>
                    </div>
                    <Badge className={getStatusColor(quote.status)}>
                      {quote.status.charAt(0).toUpperCase() + quote.status.slice(1)}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground mb-4">
                    <div className="flex items-center gap-1">
                      <DollarSign className="h-4 w-4" />
                      <span className="font-medium text-foreground">
                        ${quote.total_amount.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Calendar className="h-4 w-4" />
                      <span>Created {format(new Date(quote.created_at), 'MMM d, yyyy')}</span>
                    </div>
                    {quote.valid_until && (
                      <div className="flex items-center gap-1">
                        <span>Valid until {format(new Date(quote.valid_until), 'MMM d, yyyy')}</span>
                      </div>
                    )}
                  </div>

                  {isSent && (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        onClick={() => setPending({ quoteId: quote.id, action: 'accepted' })}
                        disabled={isSubmitting}
                      >
                        {isSubmitting && pending?.action === 'accepted' ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Check className="h-4 w-4 mr-2" />
                        )}
                        Accept Quote
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setPending({ quoteId: quote.id, action: 'declined' })}
                        disabled={isSubmitting}
                      >
                        <X className="h-4 w-4 mr-2" />
                        Decline
                      </Button>
                      {quote.share_token && (
                        <Button asChild variant="ghost" size="sm">
                          <a
                            href={`/public-quote/${quote.share_token}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <ExternalLink className="h-4 w-4 mr-2" />
                            View Details
                          </a>
                        </Button>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <AlertDialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pending?.action === 'accepted' ? 'Accept this quote?' : 'Decline this quote?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pending?.action === 'accepted'
                ? 'The team will be notified and will follow up to schedule the work.'
                : 'The team will be notified that you do not wish to proceed with this quote.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submittingId !== null}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmResponse} disabled={submittingId !== null}>
              {submittingId !== null && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
