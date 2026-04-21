import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.3';
import { RRule } from 'https://esm.sh/rrule@2.8.1';
import { DateTime } from 'https://esm.sh/luxon@3.7.2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface LineItem {
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
}

interface InvoiceSchedule {
  id: string;
  tenant_id: string;
  created_by_user_id: string;
  customer_id: string;
  customer_name: string;
  name: string;
  billing_mode: 'flat_fee' | 'per_visit_rollup';
  linked_job_series_ids: string[];
  rrule: string;
  timezone: string;
  start_date: string;
  until_date: string | null;
  next_issue_at: string | null;
  last_issued_at: string | null;
  line_items_template: LineItem[];
  tax_rate: number;
  payment_terms: string;
  due_days_after_issue: number;
  notes_template: string | null;
  auto_send: boolean;
  status: 'active' | 'paused' | 'ended';
}

interface RequestBody {
  scheduleId?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  console.log('🚀 generate-recurring-invoices invoked');

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let body: RequestBody = {};
    try {
      body = await req.json();
    } catch {
      // No body / cron call — that's fine
    }

    let query = supabase
      .from('invoice_schedules')
      .select('*')
      .eq('status', 'active');

    if (body.scheduleId) {
      query = query.eq('id', body.scheduleId);
    } else {
      query = query.or(`next_issue_at.is.null,next_issue_at.lte.${new Date().toISOString()}`);
    }

    const { data: schedules, error: schedulesError } = await query;

    if (schedulesError) {
      console.error('❌ Error fetching schedules:', schedulesError);
      throw schedulesError;
    }

    console.log(`📋 Found ${schedules?.length ?? 0} schedule(s) to process`);

    let totalGenerated = 0;
    let totalSkipped = 0;
    const errors: Array<{ scheduleId: string; error: string }> = [];

    for (const schedule of (schedules ?? []) as InvoiceSchedule[]) {
      try {
        const result = await processSchedule(supabase, schedule);
        totalGenerated += result.generated;
        totalSkipped += result.skipped;
      } catch (err: any) {
        console.error(`❌ Error processing schedule ${schedule.id}:`, err);
        errors.push({ scheduleId: schedule.id, error: err.message });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed: schedules?.length ?? 0,
        generated: totalGenerated,
        skipped: totalSkipped,
        errors,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error: any) {
    console.error('💥 Worker fatal error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});

async function processSchedule(supabase: any, schedule: InvoiceSchedule) {
  console.log(`🔄 Processing schedule ${schedule.id} (${schedule.name})`);

  const startDt = DateTime.fromISO(schedule.start_date, { zone: schedule.timezone });
  if (!startDt.isValid) {
    throw new Error(`Invalid start_date: ${schedule.start_date}`);
  }

  let rrule: RRule;
  try {
    rrule = RRule.fromString(schedule.rrule);
    rrule.options.dtstart = startDt.toJSDate();
  } catch (err: any) {
    throw new Error(`Invalid RRULE: ${schedule.rrule} (${err.message})`);
  }

  const now = DateTime.utc();
  const untilCap = schedule.until_date
    ? DateTime.fromISO(schedule.until_date, { zone: schedule.timezone }).endOf('day')
    : null;

  const lookbackStart = schedule.last_issued_at
    ? DateTime.fromISO(schedule.last_issued_at).plus({ seconds: 1 })
    : startDt;

  const upperBound = untilCap ? DateTime.min(now, untilCap) : now;

  const dueDates = rrule
    .between(lookbackStart.toJSDate(), upperBound.toJSDate(), true)
    .slice(0, 12);

  console.log(`📅 ${dueDates.length} due cycle(s) for schedule ${schedule.id}`);

  let generated = 0;
  let skipped = 0;
  let lastInvoiceId: string | null = null;
  let lastIssueDt: DateTime | null = null;

  for (const dueDate of dueDates) {
    const issueDt = DateTime.fromJSDate(dueDate);
    try {
      const result = await generateInvoiceForCycle(supabase, schedule, issueDt, rrule);
      if (result.created) {
        generated++;
        lastInvoiceId = result.invoiceId;
        lastIssueDt = issueDt;
      } else {
        skipped++;
        lastIssueDt = issueDt;
      }
    } catch (err: any) {
      if (err.message?.includes('duplicate key') || err.code === '23505') {
        console.log(`⏭️ Schedule ${schedule.id} period ${issueDt.toISODate()} already issued, skipping`);
        skipped++;
        lastIssueDt = issueDt;
      } else {
        throw err;
      }
    }
  }

  const nextIssue = rrule.after(now.toJSDate(), false);
  const nextIssueDt = nextIssue ? DateTime.fromJSDate(nextIssue) : null;

  let newStatus: 'active' | 'ended' = schedule.status === 'active' ? 'active' : 'active';
  if (!nextIssueDt || (untilCap && nextIssueDt > untilCap)) {
    newStatus = 'ended';
  }

  const updates: Record<string, any> = {
    next_issue_at: nextIssueDt && (!untilCap || nextIssueDt <= untilCap) ? nextIssueDt.toISO() : null,
    status: newStatus,
  };
  if (lastIssueDt) {
    updates.last_issued_at = lastIssueDt.toISO();
  }
  if (lastInvoiceId) {
    updates.last_issued_invoice_id = lastInvoiceId;
  }

  const { error: updateError } = await supabase
    .from('invoice_schedules')
    .update(updates)
    .eq('id', schedule.id);

  if (updateError) {
    console.error(`⚠️ Failed to update schedule ${schedule.id}:`, updateError);
  }

  console.log(`✅ Schedule ${schedule.id}: ${generated} generated, ${skipped} skipped, next: ${updates.next_issue_at ?? 'none'}`);

  return { generated, skipped };
}

async function generateInvoiceForCycle(
  supabase: any,
  schedule: InvoiceSchedule,
  issueDt: DateTime,
  rrule: RRule
): Promise<{ created: boolean; invoiceId: string | null }> {
  const prevOccurrence = rrule.before(issueDt.toJSDate(), false);
  const periodStart = prevOccurrence
    ? DateTime.fromJSDate(prevOccurrence).plus({ days: 1 }).toISODate()
    : DateTime.fromISO(schedule.start_date, { zone: schedule.timezone }).toISODate();
  const periodEnd = issueDt.toISODate();

  let lineItems: LineItem[] = [];
  const consumedTimeEntryIds: string[] = [];
  const consumedExpenseIds: string[] = [];

  if (schedule.billing_mode === 'flat_fee') {
    lineItems = (schedule.line_items_template ?? []).map((li) => ({
      description: li.description,
      quantity: Number(li.quantity) || 1,
      unit_price: Number(li.unit_price) || 0,
      total: Number(li.total) || (Number(li.quantity) || 1) * (Number(li.unit_price) || 0),
    }));
  } else {
    for (const seriesId of schedule.linked_job_series_ids ?? []) {
      const { data: summary, error } = await supabase.rpc('get_job_invoiceable_summary', {
        _job_series_id: seriesId,
      });
      if (error) {
        console.warn(`⚠️ Could not load summary for series ${seriesId}:`, error.message);
        continue;
      }
      const laborItems = (summary?.labor_items ?? []) as any[];
      const expenseItems = (summary?.expense_items ?? []) as any[];

      for (const li of laborItems) {
        lineItems.push({
          description: li.description,
          quantity: Number(li.quantity) || 0,
          unit_price: Number(li.unit_price) || 0,
          total: Number(li.total) || 0,
        });
        if (li.time_entry_id) consumedTimeEntryIds.push(li.time_entry_id);
      }
      for (const ei of expenseItems) {
        lineItems.push({
          description: ei.description,
          quantity: Number(ei.quantity) || 0,
          unit_price: Number(ei.unit_price) || 0,
          total: Number(ei.total) || 0,
        });
        if (ei.expense_id) consumedExpenseIds.push(ei.expense_id);
      }
    }

    for (const li of schedule.line_items_template ?? []) {
      lineItems.push({
        description: li.description,
        quantity: Number(li.quantity) || 1,
        unit_price: Number(li.unit_price) || 0,
        total: Number(li.total) || (Number(li.quantity) || 1) * (Number(li.unit_price) || 0),
      });
    }

    if (lineItems.length === 0) {
      console.log(`⏭️ Per-visit rollup for schedule ${schedule.id} period ${periodStart}..${periodEnd} has no items, skipping cycle`);
      return { created: false, invoiceId: null };
    }
  }

  if (lineItems.length === 0) {
    console.log(`⏭️ No line items for schedule ${schedule.id}, skipping`);
    return { created: false, invoiceId: null };
  }

  const subtotal = lineItems.reduce((s, li) => s + (Number(li.total) || 0), 0);
  const taxAmount = +(subtotal * (Number(schedule.tax_rate) || 0)).toFixed(2);
  const totalAmount = +(subtotal + taxAmount).toFixed(2);

  const issueDate = issueDt.toISODate()!;
  const dueDate = issueDt.plus({ days: schedule.due_days_after_issue }).toISODate()!;
  const currentYear = issueDt.year;

  const { data: existingNums, error: numError } = await supabase
    .from('invoices')
    .select('invoice_number')
    .like('invoice_number', `INV-${currentYear}-%`)
    .order('invoice_number', { ascending: false })
    .limit(1);

  if (numError) throw numError;

  let nextNumber = 1;
  if (existingNums && existingNums.length > 0) {
    const parts = existingNums[0].invoice_number.split('-');
    const parsed = parseInt(parts[2]);
    if (!Number.isNaN(parsed)) nextNumber = parsed + 1;
  }
  const invoiceNumber = `INV-${currentYear}-${String(nextNumber).padStart(4, '0')}`;

  const shareToken = crypto.randomUUID().replace(/-/g, '');
  const shareTokenExpiresAt = DateTime.utc().plus({ days: 30 }).toISO();

  const insertPayload = {
    invoice_number: invoiceNumber,
    customer_id: schedule.customer_id,
    customer_name: schedule.customer_name,
    issue_date: issueDate,
    due_date: dueDate,
    status: 'draft' as const,
    line_items: lineItems,
    subtotal,
    tax_rate: schedule.tax_rate,
    tax_amount: taxAmount,
    total_amount: totalAmount,
    notes: schedule.notes_template ?? null,
    payment_terms: schedule.payment_terms,
    tenant_id: schedule.tenant_id,
    created_by_user_id: schedule.created_by_user_id,
    generated_from_schedule_id: schedule.id,
    billing_period_start: periodStart,
    billing_period_end: periodEnd,
    share_token: shareToken,
    share_token_expires_at: shareTokenExpiresAt,
  };

  const { data: invoice, error: insertError } = await supabase
    .from('invoices')
    .insert([insertPayload])
    .select('id')
    .single();

  if (insertError) {
    throw insertError;
  }

  console.log(`✅ Created invoice ${invoiceNumber} (${invoice.id}) for schedule ${schedule.id}`);

  if (consumedTimeEntryIds.length > 0) {
    await supabase
      .from('time_entries')
      .update({ billed_to_invoice_id: invoice.id })
      .in('id', consumedTimeEntryIds);
  }
  if (consumedExpenseIds.length > 0) {
    await supabase
      .from('job_expenses')
      .update({ billed_to_invoice_id: invoice.id })
      .in('id', consumedExpenseIds);
  }

  if (schedule.auto_send) {
    try {
      const { error: sendError } = await supabase.functions.invoke('send-invoice-email', {
        body: { invoiceId: invoice.id, generateTokenOnly: false },
      });
      if (sendError) {
        console.warn(`⚠️ Auto-send failed for invoice ${invoice.id}:`, sendError.message);
      } else {
        console.log(`📧 Auto-sent invoice ${invoice.id}`);
      }
    } catch (err: any) {
      console.warn(`⚠️ Auto-send threw for invoice ${invoice.id}:`, err.message);
    }
  }

  return { created: true, invoiceId: invoice.id };
}
