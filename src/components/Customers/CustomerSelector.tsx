import { useState, useEffect } from "react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { FormControl } from "@/components/ui/form";
import { Check, ChevronsUpDown, Building2, Home } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCustomers, Customer } from "@/hooks/useCustomers";

interface CustomerSelectorProps {
  value?: string;
  onValueChange: (customerId: string, customerName: string) => void;
  disabled?: boolean;
}

export function CustomerSelector({ value, onValueChange, disabled }: CustomerSelectorProps) {
  const [open, setOpen] = useState(false);
  const { customers, loading } = useCustomers();

  const selectedCustomer = customers.find(customer => customer.id === value);

  const handleSelect = (customer: Customer) => {
    onValueChange(customer.id, customer.name);
    setOpen(false);
  };

  if (loading) {
    return (
      <FormControl>
        <Button
          variant="outline"
          role="combobox"
          disabled
          className="w-full justify-between"
        >
          Loading customers...
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </FormControl>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <FormControl>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className="w-full justify-between"
          >
            {selectedCustomer ? (
              <div className="flex items-center gap-2">
                {selectedCustomer.customer_type === 'commercial' ? (
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Home className="h-4 w-4 text-muted-foreground" />
                )}
                <span>{selectedCustomer.name}</span>
              </div>
            ) : (
              "Select customer..."
            )}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </FormControl>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0">
        <Command>
          <CommandInput placeholder="Search customers..." />
          <CommandEmpty>No customers found.</CommandEmpty>
          <CommandGroup>
            {customers.map((customer) => (
              <CommandItem
                key={customer.id}
                value={customer.name}
                onSelect={() => handleSelect(customer)}
              >
                <Check
                  className={cn(
                    "mr-2 h-4 w-4",
                    value === customer.id ? "opacity-100" : "opacity-0"
                  )}
                />
                <div className="flex items-center gap-2">
                  {customer.customer_type === 'commercial' ? (
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Home className="h-4 w-4 text-muted-foreground" />
                  )}
                  <div className="flex flex-col">
                    <span>{customer.name}</span>
                    {customer.phone && (
                      <span className="text-xs text-muted-foreground">{customer.phone}</span>
                    )}
                  </div>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        </Command>
      </PopoverContent>
    </Popover>
  );
}