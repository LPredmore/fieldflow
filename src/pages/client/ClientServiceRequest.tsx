import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useClientCustomer } from '@/hooks/useClientCustomer';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Loader2, Send, ArrowLeft } from 'lucide-react';

const SERVICE_TYPES = [
  { value: 'plumbing', label: 'Plumbing' },
  { value: 'electrical', label: 'Electrical' },
  { value: 'hvac', label: 'HVAC' },
  { value: 'cleaning', label: 'Cleaning' },
  { value: 'landscaping', label: 'Landscaping' },
  { value: 'general_maintenance', label: 'General Maintenance' },
  { value: 'other', label: 'Other' },
] as const;

const requestSchema = z.object({
  title: z.string().trim().min(3, 'Please enter a short title (min 3 chars)').max(120),
  service_type: z.enum([
    'plumbing',
    'electrical',
    'hvac',
    'cleaning',
    'landscaping',
    'general_maintenance',
    'other',
  ]),
  description: z.string().trim().min(10, 'Please describe what you need (min 10 chars)').max(2000),
  preferred_date: z.string().optional(),
  is_emergency: z.boolean(),
});

type FormState = z.infer<typeof requestSchema>;

export default function ClientServiceRequest() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { customer, loading: customerLoading, error: customerError } = useClientCustomer();
  const { toast } = useToast();

  const [form, setForm] = useState<FormState>({
    title: '',
    service_type: 'general_maintenance',
    description: '',
    preferred_date: '',
    is_emergency: false,
  });
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const parsed = requestSchema.safeParse(form);
    if (!parsed.success) {
      const firstError = Object.values(parsed.error.flatten().fieldErrors).flat()[0];
      toast({
        title: 'Please check the form',
        description: firstError ?? 'Some fields are invalid.',
        variant: 'destructive',
      });
      return;
    }

    if (!user || !customer) {
      toast({
        title: 'Unable to submit',
        description: 'Your customer profile could not be found. Please contact support.',
        variant: 'destructive',
      });
      return;
    }

    setSubmitting(true);
    try {
      // Look up tenant_id from the customer record (not in the hook's typed interface)
      const { data: customerRow, error: customerLookupErr } = await supabase
        .from('customers')
        .select('tenant_id')
        .eq('id', customer.id)
        .single();

      if (customerLookupErr || !customerRow) {
        throw customerLookupErr ?? new Error('Customer record not found');
      }

      const requestNumber = `REQ-${Date.now()}`;
      const noteParts = [parsed.data.description.trim()];
      if (parsed.data.preferred_date) {
        noteParts.push(`\n\nPreferred date: ${parsed.data.preferred_date}`);
      }
      if (parsed.data.is_emergency) {
        noteParts.push('\n\n⚠️ Customer flagged this as an emergency.');
      }

      const { error: insertErr } = await supabase.from('quotes').insert({
        tenant_id: customerRow.tenant_id,
        created_by_user_id: user.id,
        requested_by_client_user_id: user.id,
        customer_id: customer.id,
        customer_name: customer.name,
        title: parsed.data.title.trim(),
        quote_number: requestNumber,
        status: 'requested',
        service_type: parsed.data.service_type,
        is_emergency: parsed.data.is_emergency,
        line_items: [],
        subtotal: 0,
        tax_rate: 0,
        tax_amount: 0,
        total_amount: 0,
        notes: noteParts.join(''),
        terms: 'Pricing pending — awaiting business review.',
      });

      if (insertErr) throw insertErr;

      toast({
        title: 'Request submitted',
        description: 'We\'ve received your service request and will reply with a quote shortly.',
      });
      navigate('/client/quotes');
    } catch (err: any) {
      console.error('Service request error:', err);
      toast({
        title: 'Could not submit request',
        description: err?.message || 'Please try again or contact support.',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (customerLoading) {
    return (
      <div className="p-6 lg:p-8 space-y-6 max-w-2xl mx-auto">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (customerError || !customer) {
    return (
      <div className="p-6 lg:p-8 max-w-2xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>Profile not found</CardTitle>
            <CardDescription>
              {customerError ?? 'We couldn\'t locate your customer profile.'}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-2xl mx-auto">
      <Button variant="ghost" size="sm" onClick={() => navigate('/client/dashboard')} className="mb-4">
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back to Dashboard
      </Button>

      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">Request Service</h1>
        <p className="text-muted-foreground">
          Tell us what you need and we'll send back a quote.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Service Details</CardTitle>
          <CardDescription>
            All requests are reviewed by our team before pricing is confirmed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="title">Short title *</Label>
              <Input
                id="title"
                placeholder="e.g. Leaking kitchen faucet"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                maxLength={120}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="service_type">Service type *</Label>
              <Select
                value={form.service_type}
                onValueChange={(value) =>
                  setForm((f) => ({ ...f, service_type: value as FormState['service_type'] }))
                }
              >
                <SelectTrigger id="service_type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SERVICE_TYPES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">What do you need? *</Label>
              <Textarea
                id="description"
                placeholder="Describe the issue, location, and anything we should know before arriving."
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                rows={5}
                maxLength={2000}
                required
              />
              <p className="text-xs text-muted-foreground">{form.description.length}/2000</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="preferred_date">Preferred date (optional)</Label>
              <Input
                id="preferred_date"
                type="date"
                value={form.preferred_date}
                onChange={(e) => setForm((f) => ({ ...f, preferred_date: e.target.value }))}
                min={new Date().toISOString().split('T')[0]}
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label htmlFor="is_emergency">This is an emergency</Label>
                <p className="text-xs text-muted-foreground">
                  We'll prioritize urgent requests, but cannot guarantee same-day service.
                </p>
              </div>
              <Switch
                id="is_emergency"
                checked={form.is_emergency}
                onCheckedChange={(v) => setForm((f) => ({ ...f, is_emergency: v }))}
              />
            </div>

            <div className="flex gap-2 pt-2">
              <Button type="submit" disabled={submitting} className="flex-1">
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Submitting…
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Submit Request
                  </>
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate('/client/dashboard')}
                disabled={submitting}
              >
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
