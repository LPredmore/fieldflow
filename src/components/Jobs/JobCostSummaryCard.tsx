import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { DollarSign, TrendingUp, TrendingDown, Clock, Wrench, Receipt } from 'lucide-react';
import { useJobCostSummary } from '@/hooks/useJobCostSummary';
import { cn } from '@/lib/utils';

interface JobCostSummaryCardProps {
  jobSeriesId: string;
}

const fmtMoney = (n: number | null | undefined) =>
  n == null ? '—' : `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtPct = (n: number | null | undefined) =>
  n == null ? '—' : `${Number(n).toFixed(1)}%`;

const fmtHours = (n: number | null | undefined) =>
  n == null ? '0h' : `${Number(n).toFixed(2)}h`;

export default function JobCostSummaryCard({ jobSeriesId }: JobCostSummaryCardProps) {
  const { summary, isLoading } = useJobCostSummary(jobSeriesId);

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  const revenue = Number(summary?.revenue ?? 0);
  const laborCost = Number(summary?.labor_cost ?? 0);
  const expenseCost = Number(summary?.expense_total ?? 0);
  const totalCost = Number(summary?.total_cost ?? 0);
  const margin = Number(summary?.gross_margin ?? 0);
  const marginPct = summary?.margin_percent;
  const laborHours = Number(summary?.labor_hours ?? 0);

  const marginPositive = margin >= 0;

  const tiles = [
    { label: 'Revenue', value: fmtMoney(revenue), icon: DollarSign, tone: 'default' as const },
    { label: 'Labor Cost', value: fmtMoney(laborCost), sub: fmtHours(laborHours), icon: Clock, tone: 'default' as const },
    { label: 'Expense Cost', value: fmtMoney(expenseCost), icon: Receipt, tone: 'default' as const },
    { label: 'Total Cost', value: fmtMoney(totalCost), icon: Wrench, tone: 'default' as const },
    {
      label: 'Margin $',
      value: fmtMoney(margin),
      icon: marginPositive ? TrendingUp : TrendingDown,
      tone: marginPositive ? ('success' as const) : ('destructive' as const),
    },
    {
      label: 'Margin %',
      value: fmtPct(marginPct),
      icon: marginPositive ? TrendingUp : TrendingDown,
      tone: marginPositive ? ('success' as const) : ('destructive' as const),
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {tiles.map((t) => {
        const Icon = t.icon;
        const toneClass =
          t.tone === 'success'
            ? 'text-success'
            : t.tone === 'destructive'
            ? 'text-destructive'
            : 'text-foreground';
        return (
          <Card key={t.label}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-muted-foreground truncate">{t.label}</p>
                  <p className={cn('text-lg font-bold mt-1 truncate', toneClass)}>{t.value}</p>
                  {t.sub && <p className="text-xs text-muted-foreground mt-0.5">{t.sub}</p>}
                </div>
                <Icon className={cn('h-4 w-4 shrink-0', toneClass)} />
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
