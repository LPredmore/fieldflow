import { useState, useEffect } from "react";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { addDays, format } from "date-fns";
import { CalendarIcon, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useCustomers } from "@/hooks/useCustomers";
import { useServices } from "@/hooks/useServices";

// Validation schemas
const lineItemSchema = z.object({
  description: z.string().min(1, "Description is required"),
  quantity: z.number().min(0.01, "Quantity must be greater than 0"),
  unit_price: z.number().min(0, "Unit price cannot be negative"),
  total: z.number(),
  taxable: z.boolean().default(true),
});

const formSchema = z.object({
  customer_id: z.string().min(1, "Customer is required"),
  customer_name: z.string().min(1, "Customer name is required"),
  title: z.string().min(1, "Quote title is required"),
  status: z.enum(['draft', 'sent', 'accepted', 'declined']),
  valid_until: z.date().optional(),
  line_items: z.array(lineItemSchema).min(1, "At least one line item is required"),
  tax_rate: z.number().min(0).max(100),
  notes: z.string().optional(),
  terms: z.string().min(1, "Terms are required"),
});

type FormData = z.infer<typeof formSchema>;

interface Quote {
  id: string;
  quote_number: string;
  customer_id: string;
  customer_name: string;
  title: string;
  status: 'draft' | 'sent' | 'accepted' | 'declined';
  valid_until?: string;
  line_items: any[];
  tax_rate: number;
  notes?: string;
  terms: string;
}

interface QuoteFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: FormData & { id?: string }) => void;
  quote?: Quote | null;
  title: string;
}

export function QuoteForm({
  open,
  onOpenChange,
  onSubmit,
  quote,
  title,
}: QuoteFormProps) {
  const { customers } = useCustomers();
  const { services } = useServices();

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      customer_id: "",
      customer_name: "",
      title: "",
      status: 'draft',
      valid_until: addDays(new Date(), 30),
      line_items: [{ description: "", quantity: 1, unit_price: 0, total: 0, taxable: true }],
      tax_rate: 8.75,
      notes: "",
      terms: "Payment due within 30 days of acceptance",
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "line_items",
  });

  // Watch line items and tax rate for calculations
  const watchedLineItems = form.watch("line_items");
  const watchedTaxRate = form.watch("tax_rate");

  // Calculate line item total
  const calculateLineItemTotal = (quantity: number, unitPrice: number): number => {
    return quantity * unitPrice;
  };

  // Update form when quote changes (for editing)
  useEffect(() => {
    if (quote && open) {
      form.reset({
        customer_id: quote.customer_id,
        customer_name: quote.customer_name,
        title: quote.title,
        status: quote.status,
        valid_until: quote.valid_until ? new Date(quote.valid_until) : undefined,
        line_items: quote.line_items.map(item => ({
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unit_price,
          total: item.total,
        })),
        tax_rate: quote.tax_rate,
        notes: quote.notes || "",
        terms: quote.terms,
      });
    } else if (open && !quote) {
      form.reset({
        customer_id: "",
        customer_name: "",
        title: "",
        status: 'draft',
        valid_until: addDays(new Date(), 30),
        line_items: [{ description: "", quantity: 1, unit_price: 0, total: 0, taxable: true }],
        tax_rate: 8.75,
        notes: "",
        terms: "Payment due within 30 days of acceptance",
      });
    }
  }, [quote, open, form]);

  // Update customer name when customer_id changes
  const handleCustomerSelect = (customerId: string) => {
    const customer = customers.find(c => c.id === customerId);
    if (customer) {
      form.setValue("customer_name", customer.name);
    }
  };

  // Handle service selection for line items
  const handleServiceSelect = (index: number, serviceId: string) => {
    const service = services.find(s => s.id === serviceId);
    if (service) {
      form.setValue(`line_items.${index}.description`, service.name);
      form.setValue(`line_items.${index}.unit_price`, Number(service.price_per_unit));
      form.setValue(`line_items.${index}.taxable`, service.taxable);
      
      // Recalculate total
      const quantity = form.getValues(`line_items.${index}.quantity`);
      const total = calculateLineItemTotal(quantity, Number(service.price_per_unit));
      form.setValue(`line_items.${index}.total`, total);
    }
  };

  const handleSubmit = (data: FormData) => {
    // Ensure all line item totals are calculated
    const updatedLineItems = data.line_items.map(item => ({
      ...item,
      total: calculateLineItemTotal(item.quantity, item.unit_price),
      taxable: item.taxable ?? true,
    }));

    const submissionData = {
      ...data,
      line_items: updatedLineItems,
      valid_until: data.valid_until?.toISOString(),
    };

    if (quote) {
      onSubmit({ ...submissionData, id: quote.id } as any);
    } else {
      onSubmit(submissionData as any);
    }
    onOpenChange(false);
  };

  const addLineItem = () => {
    append({ description: "", quantity: 1, unit_price: 0, total: 0, taxable: true });
  };

  const removeLineItem = (index: number) => {
    if (fields.length > 1) {
      remove(index);
    }
  };

  // Calculate totals
  const subtotal = watchedLineItems.reduce((sum, item) => {
    const total = calculateLineItemTotal(item.quantity || 0, item.unit_price || 0);
    return sum + total;
  }, 0);

  const taxableAmount = watchedLineItems.reduce((sum, item) => {
    if (item.taxable !== false) {
      const total = calculateLineItemTotal(item.quantity || 0, item.unit_price || 0);
      return sum + total;
    }
    return sum;
  }, 0);

  const taxAmount = taxableAmount * (watchedTaxRate / 100);
  const totalAmount = subtotal + taxAmount;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
            {/* Customer and Basic Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="customer_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Customer *</FormLabel>
                    <Select 
                      onValueChange={(value) => {
                        field.onChange(value);
                        handleCustomerSelect(value);
                      }} 
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select customer" />
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

              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="draft">Draft</SelectItem>
                        <SelectItem value="sent">Sent</SelectItem>
                        <SelectItem value="accepted">Accepted</SelectItem>
                        <SelectItem value="declined">Declined</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Quote Title *</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Kitchen Renovation Project" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="valid_until"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Valid Until</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant={"outline"}
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
                          disabled={(date) => date < new Date()}
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
                name="tax_rate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tax Rate (%)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        {...field}
                        onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Line Items */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  Line Items
                  <Button type="button" variant="outline" size="sm" onClick={addLineItem}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Item
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {fields.map((field, index) => (
                  <div key={field.id} className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-5">
                      <FormLabel>Description</FormLabel>
                      <div className="flex gap-2">
                        <Select onValueChange={(value) => handleServiceSelect(index, value)}>
                          <SelectTrigger className="w-[120px]">
                            <SelectValue placeholder="Service" />
                          </SelectTrigger>
                          <SelectContent>
                            {services.map((service) => (
                              <SelectItem key={service.id} value={service.id}>
                                {service.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Controller
                          name={`line_items.${index}.description`}
                          control={form.control}
                          render={({ field }) => (
                            <Input
                              placeholder="Description"
                              {...field}
                              className="flex-1"
                            />
                          )}
                        />
                      </div>
                    </div>
                    
                    <div className="col-span-2">
                      <FormLabel>Quantity</FormLabel>
                      <Controller
                        name={`line_items.${index}.quantity`}
                        control={form.control}
                        render={({ field }) => (
                          <Input
                            type="number"
                            step="0.01"
                            {...field}
                            onChange={(e) => {
                              const quantity = parseFloat(e.target.value) || 0;
                              field.onChange(quantity);
                              const unitPrice = form.getValues(`line_items.${index}.unit_price`);
                              const total = calculateLineItemTotal(quantity, unitPrice);
                              form.setValue(`line_items.${index}.total`, total);
                            }}
                          />
                        )}
                      />
                    </div>

                    <div className="col-span-2">
                      <FormLabel>Unit Price</FormLabel>
                      <Controller
                        name={`line_items.${index}.unit_price`}
                        control={form.control}
                        render={({ field }) => (
                          <Input
                            type="number"
                            step="0.01"
                            {...field}
                            onChange={(e) => {
                              const unitPrice = parseFloat(e.target.value) || 0;
                              field.onChange(unitPrice);
                              const quantity = form.getValues(`line_items.${index}.quantity`);
                              const total = calculateLineItemTotal(quantity, unitPrice);
                              form.setValue(`line_items.${index}.total`, total);
                            }}
                          />
                        )}
                      />
                    </div>

                    <div className="col-span-2">
                      <FormLabel>Total</FormLabel>
                      <Controller
                        name={`line_items.${index}.total`}
                        control={form.control}
                        render={({ field }) => (
                          <Input
                            {...field}
                            value={calculateLineItemTotal(
                              form.getValues(`line_items.${index}.quantity`) || 0,
                              form.getValues(`line_items.${index}.unit_price`) || 0
                            ).toFixed(2)}
                            disabled
                          />
                        )}
                      />
                    </div>

                    <div className="col-span-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => removeLineItem(index)}
                        disabled={fields.length === 1}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Totals */}
            <Card>
              <CardContent className="pt-6">
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span>Subtotal:</span>
                    <span>${subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Tax ({watchedTaxRate}%):</span>
                    <span>${taxAmount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-lg border-t pt-2">
                    <span>Total:</span>
                    <span>${totalAmount.toFixed(2)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Notes and Terms */}
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Additional notes..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="terms"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Terms & Conditions *</FormLabel>
                  <FormControl>
                    <Textarea {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Actions */}
            <div className="flex justify-end space-x-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit">
                {quote ? "Update Quote" : "Create Quote"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}