import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Loader2 } from "lucide-react";
import { useSettings } from "@/hooks/useSettings";

const businessHoursSchema = z.object({
  monday: z.object({ enabled: z.boolean(), start: z.string(), end: z.string() }),
  tuesday: z.object({ enabled: z.boolean(), start: z.string(), end: z.string() }),
  wednesday: z.object({ enabled: z.boolean(), start: z.string(), end: z.string() }),
  thursday: z.object({ enabled: z.boolean(), start: z.string(), end: z.string() }),
  friday: z.object({ enabled: z.boolean(), start: z.string(), end: z.string() }),
  saturday: z.object({ enabled: z.boolean(), start: z.string(), end: z.string() }),
  sunday: z.object({ enabled: z.boolean(), start: z.string(), end: z.string() }),
});

const formSchema = z.object({
  service_settings: z.object({
    default_duration: z.number().min(0.5),
    booking_buffer: z.number().min(0),
    emergency_rate_multiplier: z.number().min(1),
  }),
  business_hours: businessHoursSchema,
});

type FormData = z.infer<typeof formSchema>;

const DAYS_OF_WEEK = [
  { key: 'monday', label: 'Monday' },
  { key: 'tuesday', label: 'Tuesday' },
  { key: 'wednesday', label: 'Wednesday' },
  { key: 'thursday', label: 'Thursday' },
  { key: 'friday', label: 'Friday' },
  { key: 'saturday', label: 'Saturday' },
  { key: 'sunday', label: 'Sunday' },
] as const;

export default function OperationsSettings() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { settings, loading, updateSettings, createSettings } = useSettings();

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      service_settings: {
        default_duration: 2,
        booking_buffer: 30,
        emergency_rate_multiplier: 1.5,
      },
      business_hours: {
        monday: { enabled: true, start: "08:00", end: "17:00" },
        tuesday: { enabled: true, start: "08:00", end: "17:00" },
        wednesday: { enabled: true, start: "08:00", end: "17:00" },
        thursday: { enabled: true, start: "08:00", end: "17:00" },
        friday: { enabled: true, start: "08:00", end: "17:00" },
        saturday: { enabled: false, start: "08:00", end: "17:00" },
        sunday: { enabled: false, start: "08:00", end: "17:00" },
      },
    },
  });

  useEffect(() => {
    if (settings) {
      const serviceSettings = settings.service_settings || {};
      const businessHours = settings.business_hours || {};

      form.reset({
        service_settings: {
          default_duration: serviceSettings.default_duration || 2,
          booking_buffer: serviceSettings.booking_buffer || 30,
          emergency_rate_multiplier: serviceSettings.emergency_rate_multiplier || 1.5,
        },
        business_hours: {
          monday: businessHours.monday || { enabled: true, start: "08:00", end: "17:00" },
          tuesday: businessHours.tuesday || { enabled: true, start: "08:00", end: "17:00" },
          wednesday: businessHours.wednesday || { enabled: true, start: "08:00", end: "17:00" },
          thursday: businessHours.thursday || { enabled: true, start: "08:00", end: "17:00" },
          friday: businessHours.friday || { enabled: true, start: "08:00", end: "17:00" },
          saturday: businessHours.saturday || { enabled: false, start: "08:00", end: "17:00" },
          sunday: businessHours.sunday || { enabled: false, start: "08:00", end: "17:00" },
        },
      });
    }
  }, [settings, form]);

  const onSubmit = async (data: FormData) => {
    setIsSubmitting(true);
    
    try {
      const updateData = {
        service_settings: data.service_settings,
        business_hours: data.business_hours,
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
          {/* Service Settings */}
          <Card>
            <CardHeader>
              <CardTitle>Service Settings</CardTitle>
              <CardDescription>Configure default service parameters</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="service_settings.default_duration"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Default Service Duration (hours)</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          step="0.5" 
                          min="0.5"
                          placeholder="2" 
                          {...field}
                          onChange={(e) => field.onChange(parseFloat(e.target.value) || 0.5)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="service_settings.booking_buffer"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Booking Buffer (minutes)</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          min="0"
                          placeholder="30" 
                          {...field}
                          onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                        />
                      </FormControl>
                      <FormDescription>
                        Time between appointments
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="service_settings.emergency_rate_multiplier"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Emergency Rate Multiplier</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          step="0.1" 
                          min="1"
                          placeholder="1.5" 
                          {...field}
                          onChange={(e) => field.onChange(parseFloat(e.target.value) || 1)}
                        />
                      </FormControl>
                      <FormDescription>
                        Multiplier for emergency jobs
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          {/* Business Hours */}
          <Card>
            <CardHeader>
              <CardTitle>Business Hours</CardTitle>
              <CardDescription>Set your operating hours for each day of the week</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {DAYS_OF_WEEK.map((day) => (
                <div key={day.key} className="flex items-center space-x-4 p-4 rounded-lg border">
                  <div className="w-24">
                    <FormField
                      control={form.control}
                      name={`business_hours.${day.key}.enabled`}
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                          <FormLabel className="text-sm font-medium">
                            {day.label}
                          </FormLabel>
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="flex items-center space-x-2 flex-1">
                    <FormField
                      control={form.control}
                      name={`business_hours.${day.key}.start`}
                      render={({ field }) => (
                        <FormItem className="flex-1">
                          <FormControl>
                            <Input
                              type="time"
                              step={900}
                              {...field}
                              disabled={!form.watch(`business_hours.${day.key}.enabled`)}
                              className="disabled:opacity-50"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    
                    <span className="text-muted-foreground">to</span>
                    
                    <FormField
                      control={form.control}
                      name={`business_hours.${day.key}.end`}
                      render={({ field }) => (
                        <FormItem className="flex-1">
                          <FormControl>
                            <Input
                              type="time"
                              step={900}
                              {...field}
                              disabled={!form.watch(`business_hours.${day.key}.enabled`)}
                              className="disabled:opacity-50"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              ))}
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