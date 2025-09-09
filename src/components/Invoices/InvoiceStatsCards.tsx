import { DollarSign, Clock, AlertTriangle, CheckCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InvoiceStats } from "@/hooks/useInvoices";

interface InvoiceStatsCardsProps {
  stats: InvoiceStats;
}

export function InvoiceStatsCards({ stats }: InvoiceStatsCardsProps) {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-6">
      <Card className="shadow-material-md">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Billed</CardTitle>
          <DollarSign className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatCurrency(stats.total_billed)}</div>
          <p className="text-xs text-muted-foreground">
            From {stats.total_count} invoices
          </p>
        </CardContent>
      </Card>

      <Card className="shadow-material-md">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Outstanding</CardTitle>
          <Clock className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatCurrency(stats.outstanding)}</div>
          <p className="text-xs text-muted-foreground">
            Awaiting payment
          </p>
        </CardContent>
      </Card>

      <Card className="shadow-material-md">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Overdue</CardTitle>
          <AlertTriangle className="h-4 w-4 text-warning" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-warning">{formatCurrency(stats.overdue)}</div>
          <p className="text-xs text-muted-foreground">
            Past due date
          </p>
        </CardContent>
      </Card>

      <Card className="shadow-material-md">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Paid (30 days)</CardTitle>
          <CheckCircle className="h-4 w-4 text-success" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-success">{formatCurrency(stats.paid_last_30_days)}</div>
          <p className="text-xs text-muted-foreground">
            Recent payments
          </p>
        </CardContent>
      </Card>
    </div>
  );
}