import { useState, useEffect, useCallback } from "react";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { addDays, format } from "date-fns";
import { CalendarIcon, Plus, Trash2, Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { useCustomers } from "@/hooks/useCustomers";
import { useServices } from "@/hooks/useServices";
import { useSettings } from "@/hooks/useSettings";

// Validation schemas
const lineItemSchema = z.object({
  description: z.string().min(1, "Description is required"),
  quantity: z.number().min(0.01, "Quantity must be greater than 0"),
  unit_price: z.number().min(0, "Unit price cannot be negative"),
  total: z.number(),
  taxable: z.boolean().default(true)
});
const formSchema = z.object({
  customer_id: z.string().min(1, "Customer is required"),
  customer_name: z.string().min(1, "Customer name is required"),
  title: z.string().min(1, "Quote title is required"),
  status: z.enum(['draft', 'sent', 'accepted', 'declined']),
  valid_until: z.date().optional(),
  is_emergency: z.boolean().default(false),
  line_items: z.array(lineItemSchema).min(1, "At least one line item is required"),
  tax_rate: z.number().min(0, "Tax rate cannot be negative").max(100, "Tax rate cannot exceed 100%"),
  notes: z.string().optional(),
  terms: z.string().min(1, "Terms are required")
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
  is_emergency?: boolean;
  line_items: any[];
  tax_rate?: number; // Make optional for backward compatibility
  notes?: string;
  terms: string;
}
interface QuoteFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: FormData & {
    id?: string;
    tax_rate: number;
  }) => void;
  quote?: Quote | null;
  title: string;
}
export function QuoteForm({
  open,
  onOpenChange,
  onSubmit,
  quote,
  title
}: QuoteFormProps) {
  const {
    customers
  } = useCustomers();
  const {
    services
  } = useServices();
  const {
    settings
  } = useSettings();
  const [openComboboxes, setOpenComboboxes] = useState<Record<number, boolean>>({});
  const [isAddingItem, setIsAddingItem] = useState(false);
  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      customer_id: "",
      customer_name: "",
      title: "",
      status: 'draft',
      valid_until: addDays(new Date(), 30),
      is_emergency: false,
      line_items: [{
        description: "",
        quantity: 1,
        unit_price: 0,
        total: 0,
        taxable: true
      }],
      tax_rate: 8.75,
      notes: "",
      terms: "Payment due within 30 days of acceptance"
    }
  });
  const {
    fields,
    append,
    remove
  } = useFieldArray({
    control: form.control,
    name: "line_items"
  });

  // Watch line items for calculations
  const watchedLineItems = form.watch("line_items");

  // Calculate line item total
  const calculateLineItemTotal = (quantity: number, unitPrice: number): number => {
    return quantity * unitPrice;
  };

  // Update form when quote changes (for editing)
  useEffect(() => {
    console.log("useEffect triggered - quote:", !!quote, "open:", open);
    if (quote && open) {
      console.log("Resetting form with quote data, line items:", quote.line_items.length);
      form.reset({
        customer_id: quote.customer_id,
        customer_name: quote.customer_name,
        title: quote.title,
        status: quote.status,
        valid_until: quote.valid_until ? new Date(quote.valid_until) : undefined,
        is_emergency: quote.is_emergency || false,
        line_items: quote.line_items.map(item => ({
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unit_price,
          total: item.total,
          taxable: item.taxable ?? true // Default to true for backward compatibility
        })),
        tax_rate: quote.tax_rate || 8.75,
        notes: quote.notes || "",
        terms: quote.terms
      });
    } else if (open && !quote) {
      console.log("Resetting form for new quote with default line item");
      form.reset({
        customer_id: "",
        customer_name: "",
        title: "",
        status: 'draft',
        valid_until: addDays(new Date(), 30),
        is_emergency: false,
        line_items: [{
          description: "",
          quantity: 1,
          unit_price: 0,
          total: 0,
          taxable: true
        }],
        tax_rate: 8.75,
        notes: "",
        terms: "Payment due within 30 days of acceptance"
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
    if (serviceId === "custom") {
      // Clear the description for custom line items
      form.setValue(`line_items.${index}.description`, "");
      form.setValue(`line_items.${index}.unit_price`, 0);
      form.setValue(`line_items.${index}.total`, 0);
      form.setValue(`line_items.${index}.taxable`, true); // Default to taxable for custom items
    } else {
      const service = services.find(s => s.id === serviceId);
      if (service) {
        form.setValue(`line_items.${index}.description`, service.name);
        form.setValue(`line_items.${index}.unit_price`, Number(service.price_per_unit));
        form.setValue(`line_items.${index}.taxable`, service.taxable); // Use service's taxable status

        // Recalculate total
        const quantity = form.getValues(`line_items.${index}.quantity`);
        const total = calculateLineItemTotal(quantity, Number(service.price_per_unit));
        form.setValue(`line_items.${index}.total`, total);
      }
    }
    setOpenComboboxes(prev => ({
      ...prev,
      [index]: false
    }));
  };
  const handleSubmit = (data: FormData) => {
    // Ensure all line item totals are calculated
    const updatedLineItems = data.line_items.map(item => ({
      ...item,
      total: calculateLineItemTotal(item.quantity, item.unit_price)
    }));
    const submissionData = {
      ...data,
      line_items: updatedLineItems,
      valid_until: data.valid_until?.toISOString(),
      is_emergency: data.is_emergency || false
    };
    if (quote) {
      onSubmit({
        ...submissionData,
        id: quote.id
      } as any);
    } else {
      onSubmit(submissionData as any);
    }
    onOpenChange(false);
  };
  const addLineItem = useCallback((event?: React.MouseEvent) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (isAddingItem) {
      console.log("Prevented duplicate addLineItem call - already adding");
      return;
    }
    console.log("Adding line item - current fields count:", fields.length);
    setIsAddingItem(true);
    append({
      description: "",
      quantity: 1,
      unit_price: 0,
      total: 0,
      taxable: true
    });

    // Reset the flag after a short delay to prevent rapid clicking
    setTimeout(() => {
      setIsAddingItem(false);
    }, 200);
  }, [append, fields.length, isAddingItem]);
  const removeLineItem = (index: number) => {
    if (fields.length > 1) {
      remove(index);
    }
  };

  // Calculate totals
  const isEmergency = form.watch("is_emergency") || false;
  const emergencyMultiplier = settings?.service_settings?.emergency_rate_multiplier || 1.5;
  
  // Calculate subtotals for taxable and non-taxable items
  const subtotal = watchedLineItems.reduce((sum, item) => {
    const total = calculateLineItemTotal(item.quantity || 0, item.unit_price || 0);
    return sum + total;
  }, 0);

  const taxableSubtotal = watchedLineItems.reduce((sum, item) => {
    if (item.taxable === true) {
      const total = calculateLineItemTotal(item.quantity || 0, item.unit_price || 0);
      return sum + total;
    }
    return sum;
  }, 0);

  const nonTaxableSubtotal = watchedLineItems.reduce((sum, item) => {
    if (item.taxable === false) {
      const total = calculateLineItemTotal(item.quantity || 0, item.unit_price || 0);
      return sum + total;
    }
    return sum;
  }, 0);

  // Emergency adjustment based on non-taxable items (as per requirement)
  const emergencyAdjustment = isEmergency ? nonTaxableSubtotal * (emergencyMultiplier - 1) : 0;
  const adjustedSubtotal = subtotal + emergencyAdjustment;
  
  const taxRate = form.watch("tax_rate") || 0;
  const taxAmount = taxableSubtotal * (taxRate / 100);
  const totalAmount = adjustedSubtotal + taxAmount;
  return <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
            {/* Customer and Basic Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField control={form.control} name="customer_id" render={({
              field
            }) => <FormItem>
                    <FormLabel>Customer *</FormLabel>
                    <Select onValueChange={value => {
                field.onChange(value);
                handleCustomerSelect(value);
              }} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select customer" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {customers.map(customer => <SelectItem key={customer.id} value={customer.id}>
                            {customer.name}
                          </SelectItem>)}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>} />

              <FormField control={form.control} name="status" render={({
              field
            }) => <FormItem>
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
                  </FormItem>} />
            </div>

            <FormField control={form.control} name="title" render={({
            field
          }) => <FormItem>
                  <FormLabel>Quote Title *</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Kitchen Renovation Project" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>} />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField control={form.control} name="valid_until" render={({
              field
            }) => <FormItem className="flex flex-col">
                    <FormLabel>Valid Until</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button variant={"outline"} className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>
                            {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={field.value} onSelect={field.onChange} disabled={date => date < new Date()} initialFocus className="pointer-events-auto" />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>} />

              <FormField control={form.control} name="is_emergency" render={({
              field
            }) => <FormItem className="flex flex-col">
                    <FormLabel>Service Type</FormLabel>
                    <div className="flex items-center space-x-2 h-10">
                      <Checkbox id="emergency-service" checked={field.value} onCheckedChange={field.onChange} />
                      <label htmlFor="emergency-service" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                        Emergency Service {settings?.service_settings?.emergency_rate_multiplier && `(${settings.service_settings.emergency_rate_multiplier}x rate)`}
                      </label>
                    </div>
                    <FormMessage />
                  </FormItem>} />
            </div>

            {/* Line Items */}
            <div className="space-y-4">
              <div className="flex items-center">
                <h3 className="text-lg font-semibold">Line Items</h3>
              </div>
              
              {/* Single card container for all line items */}
              <div className="border rounded-lg p-4 space-y-4">
                {/* Header row */}
                <div className="flex items-center gap-4 pb-2 border-b">
                  <div className="flex-1 text-sm font-medium text-muted-foreground">Item Description</div>
                  <div className="w-24 text-sm font-medium text-muted-foreground text-center">Quantity</div>
                  <div className="w-32 text-sm font-medium text-muted-foreground text-center">Unit Price</div>
                  <div className="w-16 text-sm font-medium text-muted-foreground text-center">Tax</div>
                  <div className="w-28 text-sm font-medium text-muted-foreground text-right">Line Cost</div>
                  <div className="w-12"></div>
                </div>
                
                {/* Line items as rows */}
                <div className="space-y-3">
                  {fields.map((field, index) => <div key={field.id} className="flex items-center gap-4 py-2">
                      <div className="flex-1">
                        <Popover open={openComboboxes[index]} onOpenChange={open => setOpenComboboxes(prev => ({
                      ...prev,
                      [index]: open
                    }))}>
                          <PopoverTrigger asChild>
                            <Button variant="outline" role="combobox" aria-expanded={openComboboxes[index]} className="w-full justify-between text-left text-muted-foreground">
                              <span className="truncate">
                                {form.getValues(`line_items.${index}.description`) || "Service"}
                              </span>
                              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-80 p-0">
                            <Command>
                              <CommandInput placeholder="Search services..." />
                              <CommandList>
                                <CommandEmpty>No service found.</CommandEmpty>
                                <CommandGroup>
                                  <CommandItem onSelect={() => handleServiceSelect(index, "custom")} className="font-medium">
                                    <Check className="mr-2 h-4 w-4 opacity-0" />
                                    Custom Line Item
                                  </CommandItem>
                                  {services.map(service => <CommandItem key={service.id} onSelect={() => handleServiceSelect(index, service.id)}>
                                      <Check className="mr-2 h-4 w-4 opacity-0" />
                                      {service.name}
                                    </CommandItem>)}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                      </div>
                      
                      <div className="w-24">
                        <Controller name={`line_items.${index}.quantity`} control={form.control} render={({
                      field
                    }) => <Input type="number" step="0.01" {...field} className="text-center" onChange={e => {
                      const quantity = parseFloat(e.target.value) || 0;
                      field.onChange(quantity);
                      const unitPrice = form.getValues(`line_items.${index}.unit_price`);
                      const total = calculateLineItemTotal(quantity, unitPrice);
                      form.setValue(`line_items.${index}.total`, total);
                    }} />} />
                      </div>

                      <div className="w-32">
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground">$</span>
                          <Controller name={`line_items.${index}.unit_price`} control={form.control} render={({
                        field
                      }) => <Input type="number" step="0.01" {...field} className="pl-7 text-right" onChange={e => {
                        const unitPrice = parseFloat(e.target.value) || 0;
                        field.onChange(unitPrice);
                        const quantity = form.getValues(`line_items.${index}.quantity`);
                        const total = calculateLineItemTotal(quantity, unitPrice);
                        form.setValue(`line_items.${index}.total`, total);
                      }} />} />
                        </div>
                      </div>

                      <div className="w-16 flex items-center justify-center">
                        <Controller name={`line_items.${index}.taxable`} control={form.control} render={({
                      field
                    }) => <Checkbox checked={field.value} onCheckedChange={field.onChange} className="mx-auto" />} />
                      </div>

                      <div className="w-28 flex items-center justify-end">
                        <div className="text-lg font-semibold">
                          ${calculateLineItemTotal(form.getValues(`line_items.${index}.quantity`) || 0, form.getValues(`line_items.${index}.unit_price`) || 0).toFixed(2)}
                        </div>
                      </div>

                      <div className="w-12 flex items-center justify-center">
                        <Button type="button" variant="outline" size="sm" onClick={() => removeLineItem(index)} disabled={fields.length === 1}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>)}
                </div>
                
                {/* Single Add Item Button at bottom */}
                <div className="flex justify-center pt-4 border-t">
                  <Button type="button" variant="outline" size="sm" onClick={addLineItem} disabled={isAddingItem}>
                    <Plus className="h-4 w-4 mr-2" />
                    {isAddingItem ? "Adding..." : "Add Item"}
                  </Button>
                </div>
              </div>
            </div>

            {/* Totals */}
            <div className="bg-muted/30 rounded-lg p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span>Subtotal:</span>
                <span>${subtotal.toFixed(2)}</span>
              </div>
              {taxableSubtotal > 0 && nonTaxableSubtotal > 0 && (
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span className="ml-4">Taxable: ${taxableSubtotal.toFixed(2)} • Non-taxable: ${nonTaxableSubtotal.toFixed(2)}</span>
                </div>
              )}
              {isEmergency && emergencyAdjustment > 0 && (
                <div className="flex justify-between text-sm text-orange-600">
                  <span>Emergency Service ({emergencyMultiplier}x on non-taxable items):</span>
                  <span>+${emergencyAdjustment.toFixed(2)}</span>
                </div>
              )}
              {taxAmount > 0 && (
                <div className="flex justify-between text-sm">
                  <span>Tax ({taxRate}% on taxable items):</span>
                  <span>${taxAmount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-lg text-green-600 border-t pt-2">
                <span>Total:</span>
                <span>${totalAmount.toFixed(2)}</span>
              </div>
            </div>

            {/* Tax Rate Field */}
            <FormField control={form.control} name="tax_rate" render={({
            field
          }) => (
            <FormItem>
              <FormLabel>Tax Rate (%)</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  placeholder="8.75"
                  {...field}
                  onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )} />

            {/* Notes and Terms */}
            <FormField control={form.control} name="notes" render={({
            field
          }) => <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Additional notes..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>} />

            <FormField control={form.control} name="terms" render={({
            field
          }) => <FormItem>
                  <FormLabel>Terms & Conditions *</FormLabel>
                  <FormControl>
                    <Textarea {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>} />

            {/* Actions */}
            <div className="flex justify-end space-x-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit">
                {quote ? "Update Quote" : "Create Quote"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>;
}