import { useEffect, useState } from "react";
import { useSmsSettings } from "@/hooks/useSmsSettings";
import { useSettings } from "@/hooks/useSettings";
import { Loader2, Copy } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TwilioConnectStep } from "./SMS/TwilioConnectStep";
import { PhoneNumberStep } from "./SMS/PhoneNumberStep";
import { CampaignRegistrationStep } from "./SMS/CampaignRegistrationStep";
import { TestMessageStep } from "./SMS/TestMessageStep";
import { NotificationEventsStep } from "./SMS/NotificationEventsStep";
import { SMSMessageLog } from "./SMS/SMSMessageLog";
import { toast } from "@/hooks/use-toast";

const INBOUND_WEBHOOK_URL =
  "https://zqohnagvnvpczduoizdh.supabase.co/functions/v1/twilio-inbound";

export default function SMSSettings() {
  const { settings, loading, ensureExists, update, reload } = useSmsSettings();
  const { settings: bizSettings } = useSettings();
  const businessName = bizSettings?.business_name || "Your Business";

  // Auto-initialize a row so children render correctly.
  useEffect(() => {
    if (!loading && !settings) {
      ensureExists();
    }
  }, [loading, settings, ensureExists]);

  const step1Complete = !!settings?.twilio_connection_id;
  const step2Complete = !!settings?.from_number_e164;
  const step3Complete = settings?.campaign_status === "approved";
  const step4Complete = !!settings?.test_message_sent_at;

  const copyWebhook = () => {
    navigator.clipboard.writeText(INBOUND_WEBHOOK_URL);
    toast({ title: "Webhook URL copied" });
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
      <div>
        <h2 className="text-xl font-semibold">SMS notifications</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Send TCPA-compliant transactional SMS to your customers via your own Twilio account.
        </p>
      </div>

      <TwilioConnectStep settings={settings} onConnected={reload} />

      <PhoneNumberStep
        settings={settings}
        onUpdate={update}
        enabled={step1Complete}
      />

      <Card className={!step2Complete ? "opacity-60" : ""}>
        <CardContent className="pt-6 space-y-2">
          <p className="text-sm font-medium">Inbound webhook URL</p>
          <p className="text-xs text-muted-foreground">
            Paste this into your Twilio number's "A MESSAGE COMES IN" webhook so STOP/HELP keywords
            are honored automatically.
          </p>
          <div className="flex gap-2">
            <code className="flex-1 rounded-md border bg-muted px-3 py-2 text-xs font-mono break-all">
              {INBOUND_WEBHOOK_URL}
            </code>
            <Button variant="outline" size="icon" onClick={copyWebhook}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      <CampaignRegistrationStep
        settings={settings}
        onUpdate={update}
        businessName={businessName}
        enabled={step2Complete}
      />

      <TestMessageStep
        settings={settings}
        enabled={step3Complete}
        onSent={reload}
        businessName={businessName}
      />

      <NotificationEventsStep
        settings={settings}
        onUpdate={update}
        enabled={step4Complete}
      />

      {settings?.enabled && <SMSMessageLog />}
    </div>
  );
}
