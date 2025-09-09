import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { useSettings } from "@/hooks/useSettings";

const formSchema = z.object({
  tax_settings: z.object({
    default_tax_rate: z.number().min(0).max(100),
    tax_label: z.string(),
    tax_id_number: z.string().optional(),
    allow_tax_exempt: z.boolean(),
  }),
  invoice_settings: z.object({
    invoice_prefix: z.string(),
    quote_prefix: z.string(),
    auto_numbering: z.boolean(),
    default_payment_terms: z.string(),
    default_invoice_notes: z.string().optional(),
    default_quote_terms: z.string().optional(),
  }),
  payment_settings: z.object({
    paypal_me_link: z.string().optional(),
    venmo_handle: z.string().optional(),
    other_instructions: z.string().optional(),
  }),
});

type FormData = z.infer<typeof formSchema>;

const PAYMENT_TERMS = [
  { value: "due_on_receipt", label: "Due on Receipt" },
  { value: "net_15", label: "Net 15" },
  { value: "net_30", label: "Net 30" },
  { value: "net_60", label: "Net 60" },
  { value: "net_90", label: "Net 90" },
];

export default function FinancialSettings() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { settings, loading, updateSettings, createSettings } = useSettings();

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      tax_settings: {
        default_tax_rate: 8.75,
        tax_label: "Sales Tax",
        tax_id_number: "",
        allow_tax_exempt: false,
      },
      invoice_settings: {
        invoice_prefix: "INV",
        quote_prefix: "QUO",
        auto_numbering: true,
        default_payment_terms: "net_30",
        default_invoice_notes: "",
        default_quote_terms: "Payment due within 30 days of acceptance",
      },
      payment_settings: {
        paypal_me_link: "",
        venmo_handle: "",
        other_instructions: "",
      },
    },
  });

  useEffect(() => {
    if (settings) {
      const taxSettings = settings.tax_settings || {};
      const invoiceSettings = settings.invoice_settings || {};
      const paymentSettings = settings.payment_settings || {};

      form.reset({
        tax_settings: {
          default_tax_rate: taxSettings.default_tax_rate || 8.75,
          tax_label: taxSettings.tax_label || "Sales Tax",
          tax_id_number: taxSettings.tax_id_number || "",
          allow_tax_exempt: taxSettings.allow_tax_exempt || false,
        },
        invoice_settings: {
          invoice_prefix: invoiceSettings.invoice_prefix || "INV",
          quote_prefix: invoiceSettings.quote_prefix || "QUO",
          auto_numbering: invoiceSettings.auto_numbering ?? true,
          default_payment_terms: invoiceSettings.default_payment_terms || "net_30",
          default_invoice_notes: invoiceSettings.default_invoice_notes || "",
          default_quote_terms: invoiceSettings.default_quote_terms || "Payment due within 30 days of acceptance",
        },
        payment_settings: {
          paypal_me_link: paymentSettings.paypal_me_link || "",
          venmo_handle: paymentSettings.venmo_handle || "",
          other_instructions: paymentSettings.other_instructions || "",
        },
      });
    }
  }, [settings, form]);

  const onSubmit = async (data: FormData) => {
    setIsSubmitting(true);
    
    try {
      const updateData = {
        tax_settings: data.tax_settings,
        invoice_settings: data.invoice_settings,
        payment_settings: data.payment_settings,
      };

      if (settings) {
        await updateSettings(updateData);
      } else {
        await createSettings(updateData);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* Tax Settings */}
          <Card>
            <CardHeader>
              <CardTitle>Tax Settings</CardTitle>
              <CardDescription>Configure tax rates and options</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="tax_settings.default_tax_rate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Default Tax Rate (%)</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          step="0.01" 
                          placeholder="8.75" 
                          {...field}
                          onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="tax_settings.tax_label"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tax Label</FormLabel>
                      <FormControl>
                        <Input placeholder="Sales Tax" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="tax_settings.tax_id_number"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tax ID Number</FormLabel>
                      <FormControl>
                        <Input placeholder="12-3456789" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="tax_settings.allow_tax_exempt"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">Tax-Exempt Customers</FormLabel>
                        <FormDescription>
                          Allow customers to be marked as tax-exempt
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          {/* Invoice & Quote Settings */}
          <Card>
            <CardHeader>
              <CardTitle>Invoice & Quote Settings</CardTitle>
              <CardDescription>Configure numbering and default terms</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="invoice_settings.invoice_prefix"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Invoice Prefix</FormLabel>
                      <FormControl>
                        <Input placeholder="INV" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="invoice_settings.quote_prefix"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Quote Prefix</FormLabel>
                      <FormControl>
                        <Input placeholder="QUO" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="invoice_settings.default_payment_terms"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Default Payment Terms</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select terms" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {PAYMENT_TERMS.map((term) => (
                            <SelectItem key={term.value} value={term.value}>
                              {term.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="invoice_settings.auto_numbering"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Auto-numbering</FormLabel>
                      <FormDescription>
                        Automatically generate sequential numbers for invoices and quotes
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="invoice_settings.default_invoice_notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Default Invoice Notes</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Thank you for your business!"
                        className="min-h-[80px]"
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="invoice_settings.default_quote_terms"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Default Quote Terms & Conditions</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Payment due within 30 days of acceptance"
                        className="min-h-[80px]"
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Payment Instructions */}
          <Card>
            <CardHeader>
              <CardTitle>Payment Instructions</CardTitle>
              <CardDescription>Configure payment methods displayed on invoices</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="payment_settings.paypal_me_link"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>PayPal.Me Link</FormLabel>
                      <FormControl>
                        <Input placeholder="https://paypal.me/yourbusiness" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="payment_settings.venmo_handle"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Venmo Handle</FormLabel>
                      <FormControl>
                        <Input placeholder="@yourbusiness" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="payment_settings.other_instructions"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Other Payment Instructions</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Bank transfer details, check mailing address, etc."
                        className="min-h-[100px]"
                        {...field} 
                      />
                    </FormControl>
                    <FormDescription>
                      These instructions will be displayed on public invoice pages
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Button type="submit" disabled={isSubmitting} className="w-full md:w-auto">
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving Changes...
              </>
            ) : (
              'Save Changes'
            )}
          </Button>
        </form>
      </Form>
    </div>
  );
}