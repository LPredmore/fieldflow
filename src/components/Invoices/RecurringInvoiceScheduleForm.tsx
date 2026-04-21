import { useState, useEffect } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { Plus, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Card, CardContent } from '@/components/ui/card';
import { Form, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { CustomerSelector } from '@/components/Customers/CustomerSelector';
import { RRuleBuilder } from '@/components/Jobs/RRuleBuilder';
import { useJobSeries } from '@/hooks/useJobSeries';
import { useUserTimezone } from '@/hooks/useUserTimezone';
import {
  InvoiceSchedule,
  InvoiceScheduleFormData,
  InvoiceBillingMode,
} from '@/hooks/useInvoiceSchedules';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: InvoiceScheduleFormData) => Promise<void>;
  schedule?: InvoiceSchedule | null;
  title: string;
}

const DEFAULT_RRULE = 'FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=1';

export function RecurringInvoiceScheduleForm({ open, onOpenChange, onSubmit, schedule, title }: Props) {
  const userTimezone = useUserTimezone();
  const { jobSeries } = useJobSeries();

  const form = useForm<InvoiceScheduleFormData>({
    defaultValues: {
      customer_id: '',
      customer_name: '',
      name: '',
      billing_mode: 'flat_fee',
      linked_job_series_ids: [],
      rrule: DEFAULT_RRULE,
      timezone: userTimezone || 'America/New_York',
      start_date: new Date().toISOString().slice(0, 10),
      until_date: null,
      line_items_template: [{ description: '', quantity: 1, unit_price: 0, total: 0 }],
      tax_rate: 0.0875,
      payment_terms: 'Net 30',
      due_days_after_issue: 30,
      notes_template: '',
      auto_send: false,
      status: 'active',
    },
  });

  const { fields, append, remove, update } = useFieldArray({
    control: form.control,
    name: 'line_items_template',
  });

  const billingMode = form.watch('billing_mode');
  const customerId = form.watch('customer_id');
  const startDate = form.watch('start_date');
  const rrule = form.watch('rrule');

  // Reset when opening/changing schedule
  useEffect(() => {
    if (open) {
      if (schedule) {
        form.reset({
          customer_id: schedule.customer_id,
          customer_name: schedule.customer_name,
          name: schedule.name,
          billing_mode: schedule.billing_mode,
          linked_job_series_ids: schedule.linked_job_series_ids ?? [],
          rrule: schedule.rrule,
          timezone: schedule.timezone,
          start_date: schedule.start_date,
          until_date: schedule.until_date,
          line_items_template:
            schedule.line_items_template?.length > 0
              ? schedule.line_items_template
              : [{ description: '', quantity: 1, unit_price: 0, total: 0 }],
          tax_rate: schedule.tax_rate,
          payment_terms: schedule.payment_terms,
          due_days_after_issue: schedule.due_days_after_issue,
          notes_template: schedule.notes_template ?? '',
          auto_send: schedule.auto_send,
          status: schedule.status,
        });
      } else {
        form.reset({
          customer_id: '',
          customer_name: '',
          name: '',
          billing_mode: 'flat_fee',
          linked_job_series_ids: [],
          rrule: DEFAULT_RRULE,
          timezone: userTimezone || 'America/New_York',
          start_date: new Date().toISOString().slice(0, 10),
          until_date: null,
          line_items_template: [{ description: '', quantity: 1, unit_price: 0, total: 0 }],
          tax_rate: 0.0875,
          payment_terms: 'Net 30',
          due_days_after_issue: 30,
          notes_template: '',
          auto_send: false,
          status: 'active',
        });
      }
    }
  }, [open, schedule, form, userTimezone]);

  const recalcLine = (index: number, qty: number, price: number) => {
    update(index, {
      ...fields[index],
      quantity: qty,
      unit_price: price,
      total: +(qty * price).toFixed(2),
    });
  };

  // Job series for the selected customer (for per-visit rollup picker)
  const customerSeries = (jobSeries ?? []).filter((s) => s.customer_id === customerId && s.active);

  const handleSubmit = async (values: InvoiceScheduleFormData) => {
    // Coerce numbers and clean payload
    const payload: InvoiceScheduleFormData = {
      ...values,
      tax_rate: Number(values.tax_rate) || 0,
      due_days_after_issue: Number(values.due_days_after_issue) || 30,
      line_items_template: values.line_items_template.map((li) => ({
        description: li.description,
        quantity: Number(li.quantity) || 0,
        unit_price: Number(li.unit_price) || 0,
        total: Number(li.total) || 0,
      })),
      until_date: values.until_date || null,
      notes_template: values.notes_template || null,
      linked_job_series_ids: values.billing_mode === 'per_visit_rollup' ? values.linked_job_series_ids : [],
    };

    if (!payload.customer_id) {
      form.setError('customer_id', { message: 'Customer is required' });
      return;
    }
    if (!payload.name) {
      form.setError('name', { message: 'Name is required' });
      return;
    }
    if (payload.billing_mode === 'per_visit_rollup' && payload.linked_job_series_ids.length === 0) {
      form.setError('linked_job_series_ids' as any, { message: 'Select at least one job series' });
      return;
    }

    await onSubmit(payload);
    onOpenChange(false);
  };

  const toggleSeries = (seriesId: string, checked: boolean) => {
    const current = form.getValues('linked_job_series_ids') ?? [];
    const next = checked ? [...current, seriesId] : current.filter((id) => id !== seriesId);
    form.setValue('linked_job_series_ids', next, { shouldDirty: true });
  };

  const linkedIds = form.watch('linked_job_series_ids') ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Auto-generate invoices on a schedule. Drafts are created for review unless auto-send is enabled.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
            {/* Basics */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="customer_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Customer</FormLabel>
                    <CustomerSelector
                      value={field.value}
                      onValueChange={(id, name) => {
                        form.setValue('customer_id', id);
                        form.setValue('customer_name', name);
                      }}
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Schedule name</FormLabel>
                    <Input placeholder="e.g. Lawn maintenance — monthly" {...field} />
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Billing mode */}
            <div className="space-y-2">
              <Label>Billing mode</Label>
              <RadioGroup
                value={billingMode}
                onValueChange={(v) => form.setValue('billing_mode', v as InvoiceBillingMode)}
                className="grid grid-cols-1 md:grid-cols-2 gap-3"
              >
                <Card
                  className={`cursor-pointer transition-colors ${billingMode === 'flat_fee' ? 'border-primary' : ''}`}
                  onClick={() => form.setValue('billing_mode', 'flat_fee')}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-2">
                      <RadioGroupItem value="flat_fee" id="flat_fee" className="mt-1" />
                      <div>
                        <Label htmlFor="flat_fee" className="font-semibold cursor-pointer">
                          Flat fee
                        </Label>
                        <p className="text-xs text-muted-foreground mt-1">
                          Same line items every cycle, regardless of visits.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card
                  className={`cursor-pointer transition-colors ${billingMode === 'per_visit_rollup' ? 'border-primary' : ''}`}
                  onClick={() => form.setValue('billing_mode', 'per_visit_rollup')}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-2">
                      <RadioGroupItem value="per_visit_rollup" id="per_visit_rollup" className="mt-1" />
                      <div>
                        <Label htmlFor="per_visit_rollup" className="font-semibold cursor-pointer">
                          Per-visit rollup
                        </Label>
                        <p className="text-xs text-muted-foreground mt-1">
                          Bill unbilled labor & expenses from linked job series.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </RadioGroup>
            </div>

            {/* Linked series (rollup mode) */}
            {billingMode === 'per_visit_rollup' && (
              <div className="space-y-2">
                <Label>Linked job series for this customer</Label>
                {!customerId ? (
                  <p className="text-sm text-muted-foreground">Select a customer first.</p>
                ) : customerSeries.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No active job series found for this customer.
                  </p>
                ) : (
                  <div className="space-y-2 border rounded-md p-3 max-h-48 overflow-y-auto">
                    {customerSeries.map((s) => (
                      <div key={s.id} className="flex items-center gap-2">
                        <Switch
                          checked={linkedIds.includes(s.id)}
                          onCheckedChange={(c) => toggleSeries(s.id, c)}
                        />
                        <span className="text-sm">{s.title}</span>
                      </div>
                    ))}
                  </div>
                )}
                {form.formState.errors.linked_job_series_ids && (
                  <p className="text-sm text-destructive">
                    {(form.formState.errors as any).linked_job_series_ids?.message}
                  </p>
                )}
              </div>
            )}

            {/* Line items template */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>
                  {billingMode === 'flat_fee' ? 'Line items' : 'Additional line items (optional)'}
                </Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => append({ description: '', quantity: 1, unit_price: 0, total: 0 })}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add line
                </Button>
              </div>
              <div className="space-y-2">
                {fields.map((field, index) => (
                  <div key={field.id} className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-6">
                      <Input
                        placeholder="Description"
                        {...form.register(`line_items_template.${index}.description`)}
                      />
                    </div>
                    <div className="col-span-2">
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="Qty"
                        value={field.quantity}
                        onChange={(e) =>
                          recalcLine(
                            index,
                            parseFloat(e.target.value) || 0,
                            field.unit_price
                          )
                        }
                      />
                    </div>
                    <div className="col-span-2">
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="Price"
                        value={field.unit_price}
                        onChange={(e) =>
                          recalcLine(
                            index,
                            field.quantity,
                            parseFloat(e.target.value) || 0
                          )
                        }
                      />
                    </div>
                    <div className="col-span-1 text-sm text-right pr-1 font-medium">
                      ${(field.quantity * field.unit_price).toFixed(2)}
                    </div>
                    <div className="col-span-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => remove(index)}
                        disabled={fields.length === 1}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Schedule */}
            <RRuleBuilder
              rrule={rrule}
              onChange={(r) => form.setValue('rrule', r)}
              startDate={startDate}
            />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="start_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>First issue date</FormLabel>
                    <Input type="date" {...field} />
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="due_days_after_issue"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Due (days after issue)</FormLabel>
                    <Input type="number" min={0} {...field} />
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="tax_rate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tax rate (decimal, e.g. 0.0875)</FormLabel>
                    <Input type="number" step="0.0001" {...field} />
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="payment_terms"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Payment terms</FormLabel>
                    <Input {...field} />
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="until_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>End date (optional)</FormLabel>
                    <Input
                      type="date"
                      value={field.value ?? ''}
                      onChange={(e) => field.onChange(e.target.value || null)}
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="notes_template"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes (appear on every generated invoice)</FormLabel>
                  <Textarea rows={2} {...field} value={field.value ?? ''} />
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label className="font-semibold">Auto-send to customer</Label>
                <p className="text-xs text-muted-foreground">
                  When on, generated invoices are emailed automatically. When off, they stay as drafts for review.
                </p>
              </div>
              <Switch
                checked={form.watch('auto_send')}
                onCheckedChange={(c) => form.setValue('auto_send', c)}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit">{schedule ? 'Save changes' : 'Create schedule'}</Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
