import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { format, subDays } from 'date-fns';
import { CalendarIcon, Download, TrendingUp, TrendingDown, DollarSign, Briefcase } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useProfitabilityReports } from '@/hooks/useProfitabilityReports';
import { exportToCsv } from '@/lib/csvExport';

const fmtMoney = (n: number | null | undefined) =>
  n === null || n === undefined
    ? '—'
    : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(n));

const fmtPercent = (n: number | null | undefined) =>
  n === null || n === undefined ? '—' : `${Number(n).toFixed(1)}%`;

const marginClass = (n: number | null | undefined) => {
  if (n === null || n === undefined) return 'text-muted-foreground';
  if (Number(n) > 0) return 'text-success';
  if (Number(n) < 0) return 'text-destructive';
  return 'text-muted-foreground';
};

export default function Profitability() {
  const [dateFrom, setDateFrom] = useState<Date>(subDays(new Date(), 90));
  const [dateTo, setDateTo] = useState<Date>(new Date());

  const dateFromStr = format(dateFrom, 'yyyy-MM-dd');
  const dateToStr = format(dateTo, 'yyyy-MM-dd');

  const { jobs, customers, serviceTypes, isLoading } = useProfitabilityReports(dateFromStr, dateToStr);

  const totals = useMemo(() => {
    const revenue = customers.reduce((s, c) => s + Number(c.revenue || 0), 0);
    const cost = customers.reduce((s, c) => s + Number(c.total_cost || 0), 0);
    const margin = revenue - cost;
    const marginPct = revenue > 0 ? (margin / revenue) * 100 : null;
    const jobCount = customers.reduce((s, c) => s + Number(c.job_count || 0), 0);
    return { revenue, cost, margin, marginPct, jobCount };
  }, [customers]);

  const handleExportJobs = () => {
    exportToCsv(`profitability-jobs-${dateFromStr}-${dateToStr}`, jobs, [
      { key: 'title', label: 'Job' },
      { key: 'customer_name', label: 'Customer' },
      { key: 'service_type', label: 'Service Type' },
      { key: 'status', label: 'Status' },
      { key: 'start_date', label: 'Start Date' },
      { key: 'labor_hours', label: 'Labor Hours' },
      { key: 'labor_cost', label: 'Labor Cost' },
      { key: 'expense_total', label: 'Expense Cost' },
      { key: 'total_cost', label: 'Total Cost' },
      { key: 'revenue', label: 'Revenue' },
      { key: 'gross_margin', label: 'Gross Margin' },
      { key: 'margin_percent', label: 'Margin %' },
    ]);
  };

  const handleExportCustomers = () => {
    exportToCsv(`profitability-customers-${dateFromStr}-${dateToStr}`, customers, [
      { key: 'customer_name', label: 'Customer' },
      { key: 'job_count', label: 'Jobs' },
      { key: 'revenue', label: 'Revenue' },
      { key: 'total_cost', label: 'Total Cost' },
      { key: 'gross_margin', label: 'Gross Margin' },
      { key: 'margin_percent', label: 'Margin %' },
    ]);
  };

  const handleExportServiceTypes = () => {
    exportToCsv(`profitability-service-types-${dateFromStr}-${dateToStr}`, serviceTypes, [
      { key: 'service_type', label: 'Service Type' },
      { key: 'job_count', label: 'Jobs' },
      { key: 'revenue', label: 'Revenue' },
      { key: 'total_cost', label: 'Total Cost' },
      { key: 'gross_margin', label: 'Gross Margin' },
      { key: 'margin_percent', label: 'Margin %' },
    ]);
  };

  const maxRevenue = Math.max(...serviceTypes.map((s) => Number(s.revenue || 0)), 1);

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Profitability</h1>
          <p className="text-muted-foreground">Margin analysis across jobs, customers, and service types.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="justify-start gap-2">
                <CalendarIcon className="h-4 w-4" />
                {format(dateFrom, 'MMM d, yyyy')}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={dateFrom}
                onSelect={(d) => d && setDateFrom(d)}
                initialFocus
                className={cn('p-3 pointer-events-auto')}
              />
            </PopoverContent>
          </Popover>
          <span className="text-muted-foreground">to</span>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="justify-start gap-2">
                <CalendarIcon className="h-4 w-4" />
                {format(dateTo, 'MMM d, yyyy')}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={dateTo}
                onSelect={(d) => d && setDateTo(d)}
                initialFocus
                className={cn('p-3 pointer-events-auto')}
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <DollarSign className="h-4 w-4" /> Revenue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fmtMoney(totals.revenue)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Cost</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fmtMoney(totals.cost)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              {totals.margin >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
              Gross Margin
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={cn('text-2xl font-bold', marginClass(totals.margin))}>{fmtMoney(totals.margin)}</div>
            <div className={cn('text-sm', marginClass(totals.marginPct))}>{fmtPercent(totals.marginPct)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Briefcase className="h-4 w-4" /> Jobs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totals.jobCount}</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="jobs" className="space-y-4">
        <TabsList>
          <TabsTrigger value="jobs">By Job</TabsTrigger>
          <TabsTrigger value="customers">By Customer</TabsTrigger>
          <TabsTrigger value="service-types">By Service Type</TabsTrigger>
        </TabsList>

        {/* By Job */}
        <TabsContent value="jobs">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Job Profitability</CardTitle>
              <Button variant="outline" size="sm" onClick={handleExportJobs} disabled={!jobs.length}>
                <Download className="h-4 w-4 mr-2" /> Export CSV
              </Button>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : jobs.length === 0 ? (
                <p className="text-sm text-muted-foreground">No jobs in this date range.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Job</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Service</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                      <TableHead className="text-right">Cost</TableHead>
                      <TableHead className="text-right">Margin</TableHead>
                      <TableHead className="text-right">Margin %</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {jobs.map((j) => (
                      <TableRow key={j.job_series_id ?? Math.random()}>
                        <TableCell className="font-medium">
                          {j.job_series_id ? (
                            <Link to={`/jobs?job=${j.job_series_id}`} className="hover:underline">
                              {j.title}
                            </Link>
                          ) : (
                            j.title
                          )}
                        </TableCell>
                        <TableCell>{j.customer_name}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{j.service_type}</Badge>
                        </TableCell>
                        <TableCell className="text-right">{fmtMoney(j.revenue)}</TableCell>
                        <TableCell className="text-right">{fmtMoney(j.total_cost)}</TableCell>
                        <TableCell className={cn('text-right font-medium', marginClass(j.gross_margin))}>
                          {fmtMoney(j.gross_margin)}
                        </TableCell>
                        <TableCell className={cn('text-right', marginClass(j.margin_percent))}>
                          {fmtPercent(j.margin_percent)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* By Customer */}
        <TabsContent value="customers">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Customer Profitability</CardTitle>
              <Button variant="outline" size="sm" onClick={handleExportCustomers} disabled={!customers.length}>
                <Download className="h-4 w-4 mr-2" /> Export CSV
              </Button>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : customers.length === 0 ? (
                <p className="text-sm text-muted-foreground">No customer data in this date range.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Customer</TableHead>
                      <TableHead className="text-right">Jobs</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                      <TableHead className="text-right">Cost</TableHead>
                      <TableHead className="text-right">Margin</TableHead>
                      <TableHead className="text-right">Margin %</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {customers.map((c) => (
                      <TableRow key={c.customer_id}>
                        <TableCell className="font-medium">
                          <Link to={`/customers?customer=${c.customer_id}`} className="hover:underline">
                            {c.customer_name}
                          </Link>
                        </TableCell>
                        <TableCell className="text-right">{c.job_count}</TableCell>
                        <TableCell className="text-right">{fmtMoney(c.revenue)}</TableCell>
                        <TableCell className="text-right">{fmtMoney(c.total_cost)}</TableCell>
                        <TableCell className={cn('text-right font-medium', marginClass(c.gross_margin))}>
                          {fmtMoney(c.gross_margin)}
                        </TableCell>
                        <TableCell className={cn('text-right', marginClass(c.margin_percent))}>
                          {fmtPercent(c.margin_percent)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* By Service Type */}
        <TabsContent value="service-types">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Service Type Profitability</CardTitle>
              <Button variant="outline" size="sm" onClick={handleExportServiceTypes} disabled={!serviceTypes.length}>
                <Download className="h-4 w-4 mr-2" /> Export CSV
              </Button>
            </CardHeader>
            <CardContent className="space-y-6">
              {isLoading ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : serviceTypes.length === 0 ? (
                <p className="text-sm text-muted-foreground">No service-type data in this date range.</p>
              ) : (
                <>
                  {/* Stacked bar chart */}
                  <div className="space-y-3">
                    {serviceTypes.map((s) => {
                      const revenue = Number(s.revenue || 0);
                      const cost = Number(s.total_cost || 0);
                      const revPct = (revenue / maxRevenue) * 100;
                      const costPct = (cost / maxRevenue) * 100;
                      return (
                        <div key={s.service_type} className="space-y-1">
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-medium capitalize">{s.service_type.replace(/_/g, ' ')}</span>
                            <span className={cn('font-medium', marginClass(s.gross_margin))}>
                              {fmtMoney(s.gross_margin)} ({fmtPercent(s.margin_percent)})
                            </span>
                          </div>
                          <div className="relative h-6 w-full rounded-md bg-muted overflow-hidden">
                            <div
                              className="absolute inset-y-0 left-0 bg-primary/30"
                              style={{ width: `${revPct}%` }}
                              title={`Revenue: ${fmtMoney(revenue)}`}
                            />
                            <div
                              className="absolute inset-y-0 left-0 bg-destructive/60"
                              style={{ width: `${costPct}%` }}
                              title={`Cost: ${fmtMoney(cost)}`}
                            />
                          </div>
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>Cost {fmtMoney(cost)}</span>
                            <span>Revenue {fmtMoney(revenue)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Service Type</TableHead>
                        <TableHead className="text-right">Jobs</TableHead>
                        <TableHead className="text-right">Revenue</TableHead>
                        <TableHead className="text-right">Cost</TableHead>
                        <TableHead className="text-right">Margin</TableHead>
                        <TableHead className="text-right">Margin %</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {serviceTypes.map((s) => (
                        <TableRow key={s.service_type}>
                          <TableCell className="font-medium capitalize">
                            {s.service_type.replace(/_/g, ' ')}
                          </TableCell>
                          <TableCell className="text-right">{s.job_count}</TableCell>
                          <TableCell className="text-right">{fmtMoney(s.revenue)}</TableCell>
                          <TableCell className="text-right">{fmtMoney(s.total_cost)}</TableCell>
                          <TableCell className={cn('text-right font-medium', marginClass(s.gross_margin))}>
                            {fmtMoney(s.gross_margin)}
                          </TableCell>
                          <TableCell className={cn('text-right', marginClass(s.margin_percent))}>
                            {fmtPercent(s.margin_percent)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
