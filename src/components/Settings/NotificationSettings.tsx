import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Loader2 } from "lucide-react";
import { useSettings } from "@/hooks/useSettings";

const formSchema = z.object({
  notification_settings: z.object({
    email_notifications: z.boolean(),
    job_reminders: z.boolean(),
    quote_followups: z.boolean(),
    overdue_invoice_alerts: z.boolean(),
    daily_summary: z.boolean(),
  }),
});

type FormData = z.infer<typeof formSchema>;

const NOTIFICATION_OPTIONS = [
  {
    key: 'email_notifications' as const,
    title: 'Email Notifications',
    description: 'Master toggle for all email notifications',
    isMaster: true,
  },
  {
    key: 'job_reminders' as const,
    title: 'Job Reminders',
    description: 'Receive notifications for upcoming scheduled jobs',
  },
  {
    key: 'quote_followups' as const,
    title: 'Quote Follow-ups',
    description: 'Get notified when quotes need attention or follow-up',
  },
  {
    key: 'overdue_invoice_alerts' as const,
    title: 'Overdue Invoice Alerts',
    description: 'Receive alerts for invoices that are past their due date',
  },
  {
    key: 'daily_summary' as const,
    title: 'Daily Summary',
    description: 'Get a daily email with your schedule and key metrics',
  },
];

export default function NotificationSettings() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { settings, loading, updateSettings, createSettings } = useSettings();

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      notification_settings: {
        email_notifications: true,
        job_reminders: true,
        quote_followups: true,
        overdue_invoice_alerts: true,
        daily_summary: false,
      },
    },
  });

  useEffect(() => {
    if (settings) {
      const notificationSettings = settings.notification_settings || {};

      form.reset({
        notification_settings: {
          email_notifications: notificationSettings.email_notifications ?? true,
          job_reminders: notificationSettings.job_reminders ?? true,
          quote_followups: notificationSettings.quote_followups ?? true,
          overdue_invoice_alerts: notificationSettings.overdue_invoice_alerts ?? true,
          daily_summary: notificationSettings.daily_summary ?? false,
        },
      });
    }
  }, [settings, form]);

  const onSubmit = async (data: FormData) => {
    setIsSubmitting(true);
    
    try {
      const updateData = {
        notification_settings: data.notification_settings,
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

  const emailNotificationsEnabled = form.watch('notification_settings.email_notifications');

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
        <CardTitle>Notification Settings</CardTitle>
        <CardDescription>
          Configure your email and alert preferences
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="space-y-4">
              {NOTIFICATION_OPTIONS.map((option) => (
                <FormField
                  key={option.key}
                  control={form.control}
                  name={`notification_settings.${option.key}`}
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start justify-between rounded-lg border p-4">
                      <div className="space-y-0.5 pr-4">
                        <FormLabel className="text-base font-medium">
                          {option.title}
                        </FormLabel>
                        <FormDescription className="text-sm text-muted-foreground">
                          {option.description}
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          disabled={!('isMaster' in option) && !emailNotificationsEnabled}
                          className="ml-auto"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              ))}
            </div>

            {!emailNotificationsEnabled && (
              <div className="rounded-lg bg-muted p-4">
                <p className="text-sm text-muted-foreground">
                  <strong>Note:</strong> Email notifications are disabled. Individual notification types 
                  will be automatically disabled until you enable the master email notifications toggle.
                </p>
              </div>
            )}

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