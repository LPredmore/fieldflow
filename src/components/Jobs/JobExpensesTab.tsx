import { useState } from 'react';
import { Plus, Trash2, Receipt } from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { useJobExpenses, type ExpenseCategory } from '@/hooks/useJobExpenses';
import JobCostSummaryCard from './JobCostSummaryCard';

const CATEGORIES: { value: ExpenseCategory; label: string }[] = [
  { value: 'material', label: 'Material' },
  { value: 'mileage', label: 'Mileage' },
  { value: 'subcontractor', label: 'Subcontractor' },
  { value: 'equipment', label: 'Equipment' },
  { value: 'permit', label: 'Permit' },
  { value: 'other', label: 'Other' },
];

interface JobExpensesTabProps {
  jobSeriesId: string;
  jobOccurrenceId?: string | null;
}

interface FormState {
  category: ExpenseCategory;
  description: string;
  vendor: string;
  quantity: string;
  unit_cost: string;
  markup_percent: string;
  billable: boolean;
  expense_date: string;
  notes: string;
}

const blankForm = (): FormState => ({
  category: 'material',
  description: '',
  vendor: '',
  quantity: '1',
  unit_cost: '',
  markup_percent: '',
  billable: true,
  expense_date: new Date().toISOString().slice(0, 10),
  notes: '',
});

export default function JobExpensesTab({ jobSeriesId, jobOccurrenceId }: JobExpensesTabProps) {
  const { expenses, isLoading, createExpense, deleteExpense, isCreating } = useJobExpenses(jobSeriesId);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(blankForm());

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.description.trim() || !form.unit_cost) return;
    await createExpense({
      job_series_id: jobSeriesId,
      job_occurrence_id: jobOccurrenceId ?? null,
      category: form.category,
      description: form.description.trim(),
      vendor: form.vendor.trim() || null,
      quantity: Number(form.quantity) || 1,
      unit_cost: Number(form.unit_cost),
      markup_percent: form.markup_percent ? Number(form.markup_percent) : null,
      billable: form.billable,
      expense_date: form.expense_date,
      notes: form.notes.trim() || null,
    });
    setForm(blankForm());
    setOpen(false);
  };

  const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.total_cost ?? 0), 0);

  return (
    <div className="space-y-6">
      <JobCostSummaryCard jobSeriesId={jobSeriesId} />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              Expenses
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {expenses.length} {expenses.length === 1 ? 'entry' : 'entries'} · ${totalExpenses.toFixed(2)} total
            </p>
          </div>
          <Button onClick={() => setOpen(true)} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Add Expense
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : expenses.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No expenses logged yet. Add materials, mileage, or other costs to track this job's profitability.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Unit Cost</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Billable</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expenses.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="whitespace-nowrap text-sm">
                        {format(new Date(e.expense_date), 'MMM d, yyyy')}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="capitalize">
                          {e.category}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-xs truncate" title={e.description}>
                        {e.description}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{e.vendor ?? '—'}</TableCell>
                      <TableCell className="text-right">{Number(e.quantity).toFixed(2)}</TableCell>
                      <TableCell className="text-right">${Number(e.unit_cost).toFixed(2)}</TableCell>
                      <TableCell className="text-right font-medium">
                        ${Number(e.total_cost ?? 0).toFixed(2)}
                      </TableCell>
                      <TableCell>
                        {e.billable ? (
                          e.billed_to_invoice_id ? (
                            <Badge variant="outline" className="text-xs">Billed</Badge>
                          ) : (
                            <Badge className="text-xs">Billable</Badge>
                          )
                        ) : (
                          <span className="text-xs text-muted-foreground">No</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => {
                            if (confirm('Delete this expense?')) deleteExpense(e.id);
                          }}
                          disabled={!!e.billed_to_invoice_id}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Expense</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="category">Category</Label>
                <Select
                  value={form.category}
                  onValueChange={(v) => setForm({ ...form, category: v as ExpenseCategory })}
                >
                  <SelectTrigger id="category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="expense_date">Date</Label>
                <Input
                  id="expense_date"
                  type="date"
                  value={form.expense_date}
                  onChange={(e) => setForm({ ...form, expense_date: e.target.value })}
                  required
                />
              </div>
            </div>

            <div>
              <Label htmlFor="description">Description *</Label>
              <Input
                id="description"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="e.g., 50ft of 1/2 inch copper pipe"
                required
              />
            </div>

            <div>
              <Label htmlFor="vendor">Vendor</Label>
              <Input
                id="vendor"
                value={form.vendor}
                onChange={(e) => setForm({ ...form, vendor: e.target.value })}
                placeholder="e.g., Home Depot"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label htmlFor="quantity">Quantity</Label>
                <Input
                  id="quantity"
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.quantity}
                  onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="unit_cost">Unit Cost *</Label>
                <Input
                  id="unit_cost"
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.unit_cost}
                  onChange={(e) => setForm({ ...form, unit_cost: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="markup">Markup %</Label>
                <Input
                  id="markup"
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.markup_percent}
                  onChange={(e) => setForm({ ...form, markup_percent: e.target.value })}
                  placeholder="0"
                />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label htmlFor="billable" className="cursor-pointer">Billable to customer</Label>
                <p className="text-xs text-muted-foreground">Include in next invoice</p>
              </div>
              <Switch
                id="billable"
                checked={form.billable}
                onCheckedChange={(checked) => setForm({ ...form, billable: checked })}
              />
            </div>

            <div>
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={2}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isCreating}>
                {isCreating ? 'Adding...' : 'Add Expense'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
