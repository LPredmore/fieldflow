import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Send } from "lucide-react";
import { SMSStatusBadge } from "./SMSStatusBadge";
import { useSendSms } from "@/hooks/useSendSms";
import { toE164 } from "@/lib/phoneNormalization";
import { toast } from "@/hooks/use-toast";
import type { SmsSettings } from "@/hooks/useSmsSettings";

interface Props {
  settings: SmsSettings | null;
  enabled: boolean;
  onSent: () => Promise<void> | void;
  businessName: string;
}

export function TestMessageStep({ settings, enabled, onSent, businessName }: Props) {
  const [phone, setPhone] = useState("");
  const { send, sending } = useSendSms();
  const isComplete = !!settings?.test_message_sent_at;

  const handleSend = async () => {
    const e164 = toE164(phone);
    if (!e164) {
      toast({
        title: "Invalid phone number",
        description: "Use E.164 format (e.g. +15558675309) or 10-digit US.",
        variant: "destructive",
      });
      return;
    }
    const result = await send({
      to: e164,
      body: `Test from ${businessName || "your dispatch app"}: SMS is working. 🎉`,
      triggered_by: "test",
      bypass_business_hours: true,
      skip_opt_in_prefix: true,
    });
    if (result.ok) {
      toast({ title: "Test SMS sent ✓", description: `Check your phone for the message.` });
      await onSent();
    }
  };

  return (
    <Card className={!enabled ? "opacity-60" : ""}>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="text-lg">Step 4 — Send a test SMS</CardTitle>
          <CardDescription>
            Send a quick test to your own phone before turning on customer-facing notifications.
          </CardDescription>
        </div>
        <SMSStatusBadge status={isComplete ? "complete" : enabled ? "active" : "pending"} />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Your phone number</Label>
          <div className="flex gap-2">
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+15558675309 or (555) 867-5309"
              disabled={!enabled}
            />
            <Button onClick={handleSend} disabled={!enabled || !phone || sending}>
              {sending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              Send test
            </Button>
          </div>
        </div>
        {isComplete && (
          <p className="text-sm text-muted-foreground">
            Last test sent {new Date(settings!.test_message_sent_at!).toLocaleString()}.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
