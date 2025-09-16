import { useState, useEffect } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { CalendarIcon, Plus, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useCustomers } from "@/hooks/useCustomers";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Invoice, InvoiceFormData, LineItem } from "@/hooks/useInvoices";
import { cn } from "@/lib/utils";

const lineItemSchema = z.object({
  description: z.string().min(1, "Description is required"),
  quantity: z.number().min(0.01, "Quantity must be greater than 0"),
  unit_price: z.number().min(0, "Unit price must be non-negative"),
  total: z.number(),
});

const formSchema = z.object({
  customer_id: z.string().min(1, "Customer is required"),
  customer_name: z.string().min(1, "Customer name is required"),
  job_id: z.string().optional(),
  issue_date: z.date({
    required_error: "Issue date is required",
  }),
  due_date: z.date({
    required_error: "Due date is required",
  }),
  status: z.enum(["draft", "sent", "paid", "cancelled"]),
  line_items: z.array(lineItemSchema).min(1, "At least one line item is required"),
  tax_rate: z.number().min(0).max(100),
  notes: z.string().optional(),
  payment_terms: z.string().min(1, "Payment terms are required"),
});

interface InvoiceFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: InvoiceFormData) => Promise<void>;
  invoice?: Invoice | null;
  title: string;
}

export function InvoiceForm({ open, onOpenChange, onSubmit, invoice, title }: InvoiceFormProps) {
  const { customers } = useCustomers();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch completed job occurrences for dropdown
  const { data: jobs = [] } = useQuery({
    queryKey: ["completed-jobs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("job_occurrences")
        .select(`
          id,
          customer_id,
          customer_name,
          actual_cost,
          override_estimated_cost,
          job_series!job_occurrences_series_id_fkey (
            title,
            estimated_cost
          )
        `)
        .eq("status", "completed")
        .order("created_at", { ascending: false });

      if (error) throw error;
      
      // Transform data to match expected format
      return (data || []).map(occurrence => ({
        id: occurrence.id,
        title: occurrence.job_series?.title || 'Completed Job',
        customer_id: occurrence.customer_id,
        customer_name: occurrence.customer_name,
        actual_cost: occurrence.actual_cost,
        estimated_cost: occurrence.override_estimated_cost || occurrence.job_series?.estimated_cost || 0
      }));
    },
  });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      customer_id: "",
      customer_name: "",
      job_id: "",
      issue_date: new Date(),
      due_date: (() => {
        const date = new Date();
        date.setDate(date.getDate() + 30);
        return date;
      })(),
      status: "draft",
      line_items: [{ description: "", quantity: 1, unit_price: 0, total: 0 }],
      tax_rate: 8.75,
      notes: "",
      payment_terms: "Net 30",
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "line_items",
  });

  // Calculate line item total when quantity or unit_price changes
  const calculateLineItemTotal = (index: number) => {
    const quantity = form.getValues(`line_items.${index}.quantity`);
    const unitPrice = form.getValues(`line_items.${index}.unit_price`);
    const total = quantity * unitPrice;
    form.setValue(`line_items.${index}.total`, total);
  };

  // Load job data when job is selected
  const handleJobSelect = (jobId: string) => {
    const job = jobs.find(j => j.id === jobId);
    if (job) {
      form.setValue("customer_id", job.customer_id);
      form.setValue("customer_name", job.customer_name);
      
      // Set line item with job details
      form.setValue("line_items", [{
        description: job.title,
        quantity: 1,
        unit_price: job.actual_cost || job.estimated_cost || 0,
        total: job.actual_cost || job.estimated_cost || 0,
      }]);
    }
  };

  // Update customer name when customer changes
  const handleCustomerSelect = (customerId: string) => {
    const customer = customers.find(c => c.id === customerId);
    if (customer) {
      form.setValue("customer_name", customer.name);
    }
  };

  // Reset form when opening/closing
  useEffect(() => {
    if (open) {
      if (invoice) {
        // Edit mode - populate form with invoice data
        form.reset({
          customer_id: invoice.customer_id,
          customer_name: invoice.customer_name,
          job_id: invoice.job_id || "",
          issue_date: new Date(invoice.issue_date),
          due_date: new Date(invoice.due_date),
          status: invoice.status,
          line_items: invoice.line_items,
          tax_rate: invoice.tax_rate,
          notes: invoice.notes || "",
          payment_terms: invoice.payment_terms,
        });
      } else {
        // Create mode - reset to defaults
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 30);
        
        form.reset({
          customer_id: "",
          customer_name: "",
          job_id: "",
          issue_date: new Date(),
          due_date: dueDate,
          status: "draft" as const,
          line_items: [{ description: "", quantity: 1, unit_price: 0, total: 0 }],
          tax_rate: 8.75,
          notes: "",
          payment_terms: "Net 30",
        });
      }
    }
  }, [open, invoice, form]);

  const handleSubmit = async (data: z.infer<typeof formSchema>) => {
    setIsSubmitting(true);
    try {
      // Ensure required fields are present
      if (!data.customer_id || !data.customer_name) {
        throw new Error("Customer is required");
      }
      
      const submitData: InvoiceFormData = {
        customer_id: data.customer_id,
        customer_name: data.customer_name,
        job_id: data.job_id,
        issue_date: data.issue_date.toISOString().split('T')[0],
        due_date: data.due_date.toISOString().split('T')[0],
        status: data.status,
        line_items: data.line_items.map(item => ({
          description: item.description || '',
          quantity: item.quantity || 1,
          unit_price: item.unit_price || 0,
          total: item.total || 0
        })),
        tax_rate: data.tax_rate,
        notes: data.notes,
        payment_terms: data.payment_terms,
      };
      
      await onSubmit(submitData);
      onOpenChange(false);
    } catch (error) {
      console.error("Error submitting invoice:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const addLineItem = () => {
    append({ description: "", quantity: 1, unit_price: 0, total: 0 });
  };

  const removeLineItem = (index: number) => {
    if (fields.length > 1) {
      remove(index);
    }
  };

  // Calculate totals for display
  const lineItems = form.watch("line_items");
  const taxRate = form.watch("tax_rate");
  const subtotal = lineItems.reduce((sum, item) => sum + (item.total || 0), 0);
  const taxAmount = subtotal * (taxRate / 100);
  const total = subtotal + taxAmount;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
            {/* Customer and Job Selection */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="job_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Load from Job (Optional)</FormLabel>
                    <Select 
                      value={field.value} 
                      onValueChange={(value) => {
                        field.onChange(value);
                        if (value) handleJobSelect(value);
                      }}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a completed job" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {jobs.map((job) => (
                          <SelectItem key={job.id} value={job.id}>
                            {job.title} - {job.customer_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="customer_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Customer *</FormLabel>
                    <Select 
                      value={field.value} 
                      onValueChange={(value) => {
                        field.onChange(value);
                        handleCustomerSelect(value);
                      }}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a customer" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {customers.map((customer) => (
                          <SelectItem key={customer.id} value={customer.id}>
                            {customer.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Dates and Status */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="issue_date"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Issue Date *</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full pl-3 text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                          >
                            {field.value ? (
                              format(field.value, "PPP")
                            ) : (
                              <span>Pick a date</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          initialFocus
                          className="pointer-events-auto"
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="due_date"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Due Date *</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full pl-3 text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                          >
                            {field.value ? (
                              format(field.value, "PPP")
                            ) : (
                              <span>Pick a date</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          initialFocus
                          className="pointer-events-auto"
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status *</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="draft">Draft</SelectItem>
                        <SelectItem value="sent">Sent</SelectItem>
                        <SelectItem value="paid">Paid</SelectItem>
                        <SelectItem value="cancelled">Cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Line Items */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium">Line Items</h3>
                <Button type="button" onClick={addLineItem} size="sm">
                  <Plus className="h-4 w-4 mr-1" />
                  Add Item
                </Button>
              </div>

              {fields.map((field, index) => (
                <div key={field.id} className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-5">
                    <FormField
                      control={form.control}
                      name={`line_items.${index}.description`}
                      render={({ field }) => (
                        <FormItem>
                          {index === 0 && <FormLabel>Description</FormLabel>}
                          <FormControl>
                            <Input {...field} placeholder="Service description" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="col-span-2">
                    <FormField
                      control={form.control}
                      name={`line_items.${index}.quantity`}
                      render={({ field }) => (
                        <FormItem>
                          {index === 0 && <FormLabel>Quantity</FormLabel>}
                          <FormControl>
                            <Input
                              type="number"
                              step="0.01"
                              {...field}
                              value={field.value || ""}
                              onChange={(e) => {
                                const value = parseFloat(e.target.value) || 0;
                                field.onChange(value);
                                calculateLineItemTotal(index);
                              }}
                              placeholder="1"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="col-span-2">
                    <FormField
                      control={form.control}
                      name={`line_items.${index}.unit_price`}
                      render={({ field }) => (
                        <FormItem>
                          {index === 0 && <FormLabel>Unit Price</FormLabel>}
                          <FormControl>
                            <Input
                              type="number"
                              step="0.01"
                              {...field}
                              value={field.value || ""}
                              onChange={(e) => {
                                const value = parseFloat(e.target.value) || 0;
                                field.onChange(value);
                                calculateLineItemTotal(index);
                              }}
                              placeholder="0.00"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="col-span-2">
                    <FormField
                      control={form.control}
                      name={`line_items.${index}.total`}
                      render={({ field }) => (
                        <FormItem>
                          {index === 0 && <FormLabel>Total</FormLabel>}
                          <FormControl>
                            <Input
                              {...field}
                              value={field.value?.toFixed(2) || "0.00"}
                              readOnly
                              className="bg-muted"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="col-span-1">
                    {index === 0 && <div className="h-8"></div>}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => removeLineItem(index)}
                      disabled={fields.length === 1}
                      className="h-10"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            {/* Tax and Payment Terms */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="tax_rate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tax Rate (%)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        {...field}
                        value={field.value || ""}
                        onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="payment_terms"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Payment Terms</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Due on Receipt">Due on Receipt</SelectItem>
                        <SelectItem value="Net 15">Net 15</SelectItem>
                        <SelectItem value="Net 30">Net 30</SelectItem>
                        <SelectItem value="Net 45">Net 45</SelectItem>
                        <SelectItem value="Net 60">Net 60</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Notes */}
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea {...field} rows={3} placeholder="Additional notes or comments" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Totals Summary */}
            <div className="bg-muted/50 p-4 rounded-lg">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span>Subtotal:</span>
                  <span>${subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Tax ({taxRate}%):</span>
                  <span>${taxAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-bold text-lg border-t pt-2">
                  <span>Total:</span>
                  <span>${total.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Form Actions */}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : invoice ? "Update Invoice" : "Create Invoice"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}