import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Mail, MessageSquare } from "lucide-react";
import { useSettings } from "@/hooks/useSettings";
import SMSSettings from "@/components/Settings/SMSSettings";

const formSchema = z.object({
  notification_settings: z.object({
    email_notifications: z.boolean(),
    job_reminder_crew_email: z.boolean(),
    on_the_way_email: z.boolean(),
    quote_sent_email: z.boolean(),
    quote_followup_email: z.boolean(),
    invoice_sent_email: z.boolean(),
    invoice_overdue_email: z.boolean(),
  }),
});

type FormData = z.infer<typeof formSchema>;

const NOTIFICATION_OPTIONS = [
  {
    key: 'email_notifications' as const,
    title: 'Email notifications',
    description: 'Master toggle. When off, no email notifications are sent.',
    isMaster: true,
  },
  {
    key: 'job_reminder_crew_email' as const,
    title: 'Crew schedule emails',
    description: "Email each contractor their next-day schedule at 6pm tenant-local.",
  },
  {
    key: 'on_the_way_email' as const,
    title: 'On-the-way emails',
    description: 'Email the customer when the contractor clocks in for their job.',
  },
  {
    key: 'quote_sent_email' as const,
    title: 'Quote sent',
    description: 'Email the customer a link when a quote is sent (in addition to existing send-quote-email flow).',
  },
  {
    key: 'quote_followup_email' as const,
    title: 'Quote follow-ups',
    description: 'Auto-email the customer on day 3 and day 7 if a sent quote sits unaccepted.',
  },
  {
    key: 'invoice_sent_email' as const,
    title: 'Invoice sent',
    description: 'Email the customer a link when an invoice is sent.',
  },
  {
    key: 'invoice_overdue_email' as const,
    title: 'Invoice overdue',
    description: 'Email the customer at 1, 7, 14, and 30 days past due.',
  },
];

function EmailNotificationSettings() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { settings, loading, updateSettings, createSettings } = useSettings();

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      notification_settings: {
        email_notifications: true,
        job_reminder_crew_email: true,
        on_the_way_email: false,
        quote_sent_email: false,
        quote_followup_email: true,
        invoice_sent_email: false,
        invoice_overdue_email: true,
      },
    },
  });

  useEffect(() => {
    if (settings) {
      const n = settings.notification_settings || {};
      form.reset({
        notification_settings: {
          email_notifications: n.email_notifications ?? true,
          job_reminder_crew_email: n.job_reminder_crew_email ?? true,
          on_the_way_email: n.on_the_way_email ?? false,
          quote_sent_email: n.quote_sent_email ?? false,
          quote_followup_email: n.quote_followup_email ?? true,
          invoice_sent_email: n.invoice_sent_email ?? false,
          invoice_overdue_email: n.invoice_overdue_email ?? true,
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
        <CardTitle>Email notifications</CardTitle>
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

export default function NotificationSettings() {
  return (
    <Tabs defaultValue="email" className="w-full">
      <TabsList className="grid w-full max-w-md grid-cols-2">
        <TabsTrigger value="email" className="gap-2">
          <Mail className="h-4 w-4" />
          Email
        </TabsTrigger>
        <TabsTrigger value="sms" className="gap-2">
          <MessageSquare className="h-4 w-4" />
          SMS
        </TabsTrigger>
      </TabsList>
      <TabsContent value="email" className="mt-6 space-y-4">
        <div className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
          <p>
            <strong>Tip:</strong> SMS toggles for the same events live on the
            SMS tab. Configure both so customers and crew receive the channels
            they expect.
          </p>
        </div>
        <EmailNotificationSettings />
      </TabsContent>
      <TabsContent value="sms" className="mt-6">
        <SMSSettings />
      </TabsContent>
    </Tabs>
  );
}
