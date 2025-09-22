import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { useSettings } from "@/hooks/useSettings";
import type { Database } from "@/integrations/supabase/types";

const formSchema = z.object({
  user_preferences: z.object({
    time_format: z.string(),
    date_format: z.string(),
    currency_symbol: z.string(),
    default_view: z.string(),
  }),
  time_zone: z.string(),
});

type FormData = z.infer<typeof formSchema>;

const TIME_FORMATS = [
  { value: "12", label: "12 Hour (2:30 PM)" },
  { value: "24", label: "24 Hour (14:30)" },
];

const DATE_FORMATS = [
  { value: "MM/DD/YYYY", label: "MM/DD/YYYY (12/25/2023)" },
  { value: "DD/MM/YYYY", label: "DD/MM/YYYY (25/12/2023)" },
  { value: "YYYY-MM-DD", label: "YYYY-MM-DD (2023-12-25)" },
];

const TIMEZONES = [
  { value: "Eastern", label: "Eastern" },
  { value: "Central", label: "Central" },
  { value: "Mountain", label: "Mountain" },
  { value: "Pacific", label: "Pacific" },
  { value: "Arizona", label: "Arizona" },
  { value: "Alaska", label: "Alaska" },
  { value: "Hawaii Aleutian", label: "Hawaii Aleutian" },
];

const CURRENCIES = [
  { value: "USD", label: "$ (US Dollar)" },
  { value: "EUR", label: "€ (Euro)" },
  { value: "GBP", label: "£ (British Pound)" },
  { value: "CAD", label: "C$ (Canadian Dollar)" },
];

const DEFAULT_VIEWS = [
  { value: "dashboard", label: "Dashboard" },
  { value: "jobs", label: "Jobs" },
  { value: "customers", label: "Customers" },
  { value: "quotes", label: "Quotes" },
  { value: "invoices", label: "Invoices" },
];

export default function UserPreferences() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { settings, loading, updateSettings, createSettings } = useSettings();

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      user_preferences: {
        time_format: "12",
        date_format: "MM/DD/YYYY",
        currency_symbol: "USD",
        default_view: "dashboard",
      },
      time_zone: "Eastern",
    },
  });

  useEffect(() => {
    if (settings) {
      const userPreferences = settings.user_preferences || {};

      form.reset({
        user_preferences: {
          time_format: userPreferences.time_format || "12",
          date_format: userPreferences.date_format || "MM/DD/YYYY",
          currency_symbol: userPreferences.currency_symbol || "USD",
          default_view: userPreferences.default_view || "dashboard",
        },
        time_zone: settings.time_zone || "Eastern",
      });
    }
  }, [settings, form]);

  const onSubmit = async (data: FormData) => {
    setIsSubmitting(true);
    
    try {
      const updateData = {
        user_preferences: data.user_preferences,
        time_zone: data.time_zone as Database["public"]["Enums"]["time_zones"],
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
    <Card>
      <CardHeader>
        <CardTitle>User Preferences</CardTitle>
        <CardDescription>
          Customize your display and regional preferences
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="user_preferences.time_format"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Time Format</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select time format" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {TIME_FORMATS.map((format) => (
                          <SelectItem key={format.value} value={format.value}>
                            {format.label}
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
                name="user_preferences.date_format"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date Format</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select date format" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {DATE_FORMATS.map((format) => (
                          <SelectItem key={format.value} value={format.value}>
                            {format.label}
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
                name="time_zone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Timezone</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select timezone" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {TIMEZONES.map((tz) => (
                          <SelectItem key={tz.value} value={tz.value}>
                            {tz.label}
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
                name="user_preferences.currency_symbol"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Currency</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select currency" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {CURRENCIES.map((currency) => (
                          <SelectItem key={currency.value} value={currency.value}>
                            {currency.label}
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
                name="user_preferences.default_view"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Default View on Login</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select default view" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {DEFAULT_VIEWS.map((view) => (
                          <SelectItem key={view.value} value={view.value}>
                            {view.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

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
      </CardContent>
    </Card>
  );
}