import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { SMSStatusBadge } from "./SMSStatusBadge";
import { toast } from "@/hooks/use-toast";
import type { SmsSettings, SmsNotificationEvents } from "@/hooks/useSmsSettings";
import { DEFAULT_NOTIFICATION_EVENTS } from "@/hooks/useSmsSettings";

interface Props {
  settings: SmsSettings | null;
  onUpdate: (patch: Partial<SmsSettings>) => Promise<SmsSettings | null>;
  enabled: boolean;
}

const EVENT_LABELS: Record<keyof SmsNotificationEvents, { title: string; description: string }> = {
  job_reminder_24h: {
    title: "Job reminders",
    description: "Send a reminder 24 hours before each scheduled visit.",
  },
  on_the_way: {
    title: "On-the-way alerts",
    description: "Notify the customer when the contractor clocks in for their job.",
  },
  quote_sent: {
    title: "Quote sent",
    description: "Text the customer a link when a new quote is sent to them.",
  },
  invoice_sent: {
    title: "Invoice sent",
    description: "Text the customer a link when a new invoice is sent.",
  },
  invoice_overdue: {
    title: "Invoice overdue reminders",
    description: "Notify the customer when an invoice becomes past due.",
  },
};

export function NotificationEventsStep({ settings, onUpdate, enabled }: Props) {
  const events = settings?.notification_events ?? DEFAULT_NOTIFICATION_EVENTS;
  const [saving, setSaving] = useState(false);
  const isLive = !!settings?.enabled;

  const toggle = async (key: keyof SmsNotificationEvents, value: boolean) => {
    setSaving(true);
    try {
      await onUpdate({
        notification_events: { ...events, [key]: value },
      });
    } finally {
      setSaving(false);
    }
  };

  const turnOn = async () => {
    setSaving(true);
    try {
      await onUpdate({ enabled: true });
      toast({ title: "SMS notifications are live 🚀" });
    } finally {
      setSaving(false);
    }
  };

  const turnOff = async () => {
    setSaving(true);
    try {
      await onUpdate({ enabled: false });
      toast({ title: "SMS notifications paused" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className={!enabled ? "opacity-60" : ""}>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="text-lg">Step 5 — Choose what to send</CardTitle>
          <CardDescription>
            Pick which customer notifications go out by SMS. You can change these any time.
          </CardDescription>
        </div>
        <SMSStatusBadge status={isLive ? "complete" : enabled ? "active" : "pending"} label={isLive ? "Live" : undefined} />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          {(Object.keys(EVENT_LABELS) as Array<keyof SmsNotificationEvents>).map((key) => (
            <div
              key={key}
              className="flex items-start justify-between rounded-md border p-3"
            >
              <div className="space-y-0.5 pr-4">
                <Label className="text-sm font-medium">{EVENT_LABELS[key].title}</Label>
                <p className="text-xs text-muted-foreground">
                  {EVENT_LABELS[key].description}
                </p>
              </div>
              <Switch
                checked={events[key]}
                onCheckedChange={(v) => toggle(key, v)}
                disabled={!enabled || saving}
              />
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2 pt-2">
          {!isLive ? (
            <Button onClick={turnOn} disabled={!enabled || saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Turn on SMS notifications
            </Button>
          ) : (
            <Button onClick={turnOff} variant="outline" disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Pause SMS notifications
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
