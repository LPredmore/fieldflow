import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useClientCustomer } from '@/hooks/useClientCustomer';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { FileText, ExternalLink, Calendar, DollarSign } from 'lucide-react';
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

export default function ClientQuotes() {
  const { customer, loading: customerLoading } = useClientCustomer();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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

    if (!customerLoading) {
      fetchQuotes();
    }
  }, [customer, customerLoading]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'accepted':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'sent':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      case 'draft':
        return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200';
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
          {quotes.map((quote) => (
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
                
                {quote.share_token && quote.status === 'sent' && (
                  <Button asChild variant="outline" size="sm">
                    <a 
                      href={`/public-quote/${quote.share_token}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink className="h-4 w-4 mr-2" />
                      View & Respond
                    </a>
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
