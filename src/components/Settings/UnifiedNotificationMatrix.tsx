import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Loader2, Mail, MessageSquare } from "lucide-react";
import { useSettings } from "@/hooks/useSettings";
import { useSmsSettings, DEFAULT_NOTIFICATION_EVENTS } from "@/hooks/useSmsSettings";
import type { SmsNotificationEvents } from "@/hooks/useSmsSettings";
import { toast } from "@/hooks/use-toast";

// One row per event. Each row has an Email column (settings.notification_settings.*_email)
// and an SMS column (sms_settings.notification_events.*).
type Row = {
  title: string;
  description: string;
  emailKey: keyof EmailEvents | null;     // null = no email channel for this event
  smsKey: keyof SmsNotificationEvents | null; // null = no sms channel for this event
};

type EmailEvents = {
  email_notifications: boolean; // master
  job_reminder_crew_email: boolean;
  on_the_way_email: boolean;
  quote_sent_email: boolean;
  quote_followup_email: boolean;
  invoice_sent_email: boolean;
  invoice_overdue_email: boolean;
};

const ROWS: Row[] = [
  {
    title: "Customer job reminders (24h)",
    description: "Remind the customer 24 hours before their scheduled visit.",
    emailKey: null,
    smsKey: "job_reminder_24h",
  },
  {
    title: "Crew schedule reminders",
    description: "Send each contractor their next-day schedule at 6pm tenant-local.",
    emailKey: "job_reminder_crew_email",
    smsKey: "job_reminder_crew",
  },
  {
    title: "On-the-way alerts",
    description: "Notify the customer automatically when the contractor clocks in.",
    emailKey: "on_the_way_email",
    smsKey: "on_the_way",
  },
  {
    title: "Quote sent",
    description: "Notify the customer when a quote is sent.",
    emailKey: "quote_sent_email",
    smsKey: "quote_sent",
  },
  {
    title: "Quote follow-ups",
    description: "Auto-nudge the customer on day 3 and day 7 if a sent quote is unaccepted.",
    emailKey: "quote_followup_email",
    smsKey: "quote_followup",
  },
  {
    title: "Invoice sent",
    description: "Notify the customer when an invoice is sent.",
    emailKey: "invoice_sent_email",
    smsKey: "invoice_sent",
  },
  {
    title: "Invoice overdue reminders",
    description: "Nudge the customer at 1, 7, 14, and 30 days past due.",
    emailKey: "invoice_overdue_email",
    smsKey: "invoice_overdue",
  },
];

const DEFAULT_EMAIL: EmailEvents = {
  email_notifications: true,
  job_reminder_crew_email: true,
  on_the_way_email: false,
  quote_sent_email: false,
  quote_followup_email: true,
  invoice_sent_email: false,
  invoice_overdue_email: true,
};

export function UnifiedNotificationMatrix() {
  const { settings, loading: settingsLoading, updateSettings } = useSettings();
  const { settings: smsSettings, loading: smsLoading, ensureExists, update: updateSms } = useSmsSettings();

  const [emailValues, setEmailValues] = useState<EmailEvents>(DEFAULT_EMAIL);
  const [smsValues, setSmsValues] = useState<SmsNotificationEvents>(DEFAULT_NOTIFICATION_EVENTS);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (settings) {
      const n = (settings.notification_settings || {}) as Partial<EmailEvents>;
      setEmailValues({
        email_notifications: n.email_notifications ?? DEFAULT_EMAIL.email_notifications,
        job_reminder_crew_email: n.job_reminder_crew_email ?? DEFAULT_EMAIL.job_reminder_crew_email,
        on_the_way_email: n.on_the_way_email ?? DEFAULT_EMAIL.on_the_way_email,
        quote_sent_email: n.quote_sent_email ?? DEFAULT_EMAIL.quote_sent_email,
        quote_followup_email: n.quote_followup_email ?? DEFAULT_EMAIL.quote_followup_email,
        invoice_sent_email: n.invoice_sent_email ?? DEFAULT_EMAIL.invoice_sent_email,
        invoice_overdue_email: n.invoice_overdue_email ?? DEFAULT_EMAIL.invoice_overdue_email,
      });
    }
  }, [settings]);

  useEffect(() => {
    if (smsSettings?.notification_events) {
      setSmsValues(smsSettings.notification_events);
    }
  }, [smsSettings]);

  const setEmail = (key: keyof EmailEvents, value: boolean) => {
    setEmailValues((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const setSms = (key: keyof SmsNotificationEvents, value: boolean) => {
    setSmsValues((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Ensure SMS settings row exists before updating
      await ensureExists();
      // Save both channels in parallel — atomic from the user's POV
      const [emailRes, smsRes] = await Promise.all([
        updateSettings({ notification_settings: emailValues }),
        updateSms({ notification_events: smsValues }),
      ]);
      if ((emailRes as any)?.error) {
        toast({ title: "Email settings failed to save", variant: "destructive" });
      } else if (!smsRes) {
        toast({ title: "SMS settings failed to save", variant: "destructive" });
      } else {
        toast({ title: "Notification preferences saved" });
        setDirty(false);
      }
    } finally {
      setSaving(false);
    }
  };

  const loading = settingsLoading || smsLoading;
  const emailMaster = emailValues.email_notifications;
  const smsLive = !!smsSettings?.enabled;

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
        <CardTitle>Notification preferences</CardTitle>
        <CardDescription>
          One row per event. Toggle Email and SMS independently. Changes save together.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Master email toggle */}
        <div className="flex items-start justify-between rounded-lg border p-4 bg-muted/30">
          <div>
            <p className="font-medium">Email notifications (master)</p>
            <p className="text-sm text-muted-foreground">
              When off, no email notifications go out regardless of individual toggles.
            </p>
          </div>
          <Switch
            checked={emailMaster}
            onCheckedChange={(v) => setEmail("email_notifications", v)}
          />
        </div>

        {!smsLive && (
          <div className="rounded-md border border-warning/40 bg-warning/5 p-3 text-sm">
            <strong>SMS is paused.</strong> SMS toggles below are recorded but no SMS
            will go out until you turn SMS on in the SMS setup wizard.
          </div>
        )}

        {/* Matrix header */}
        <div className="hidden md:grid grid-cols-[1fr_auto_auto] gap-4 px-4 text-xs font-medium uppercase text-muted-foreground">
          <div>Event</div>
          <div className="w-20 text-center flex items-center justify-center gap-1">
            <Mail className="h-3 w-3" /> Email
          </div>
          <div className="w-20 text-center flex items-center justify-center gap-1">
            <MessageSquare className="h-3 w-3" /> SMS
          </div>
        </div>

        <div className="space-y-2">
          {ROWS.map((row) => (
            <div
              key={row.title}
              className="grid grid-cols-[1fr_auto_auto] gap-4 items-center rounded-lg border p-4"
            >
              <div className="space-y-0.5">
                <p className="text-sm font-medium">{row.title}</p>
                <p className="text-xs text-muted-foreground">{row.description}</p>
              </div>
              <div className="w-20 flex justify-center">
                {row.emailKey ? (
                  <Switch
                    checked={emailValues[row.emailKey]}
                    onCheckedChange={(v) => setEmail(row.emailKey!, v)}
                    disabled={!emailMaster}
                    aria-label={`${row.title} email`}
                  />
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </div>
              <div className="w-20 flex justify-center">
                {row.smsKey ? (
                  <Switch
                    checked={smsValues[row.smsKey]}
                    onCheckedChange={(v) => setSms(row.smsKey!, v)}
                    aria-label={`${row.title} SMS`}
                  />
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={handleSave} disabled={saving || !dirty}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save preferences
          </Button>
          {dirty && (
            <span className="text-xs text-muted-foreground">Unsaved changes</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
