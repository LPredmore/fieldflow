import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, ExternalLink, RefreshCw } from "lucide-react";
import { SMSStatusBadge } from "./SMSStatusBadge";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { toast } from "@/hooks/use-toast";
import type { SmsSettings } from "@/hooks/useSmsSettings";

interface Props {
  settings: SmsSettings | null;
  onConnected: () => Promise<void> | void;
}

export function TwilioConnectStep({ settings, onConnected }: Props) {
  const [verifying, setVerifying] = useState(false);
  const isConnected = !!settings?.twilio_connection_id;

  const verify = async () => {
    setVerifying(true);
    try {
      const { data, error } = await supabase.functions.invoke("sms-twilio-validate", {
        body: { action: "verify" },
      });
      if (error) {
        toast({
          title: "Twilio not connected",
          description:
            "Use the Lovable Twilio connector to link your account, then return here.",
          variant: "destructive",
        });
      } else if ((data as { outcome?: string })?.outcome === "verified" || (data as { outcome?: string })?.outcome === "skipped") {
        toast({ title: "Twilio connected ✓", description: "Credentials verified." });
        await onConnected();
      } else {
        toast({
          title: "Verification failed",
          description: (data as { error?: string })?.error ?? "Try reconnecting.",
          variant: "destructive",
        });
      }
    } finally {
      setVerifying(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="text-lg">Step 1 — Connect Twilio</CardTitle>
          <CardDescription>
            Link your Twilio account through the Lovable connector so we can send SMS on your
            behalf without storing raw API keys.
          </CardDescription>
        </div>
        <SMSStatusBadge status={isConnected ? "complete" : "pending"} />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md border bg-muted/30 p-4 text-sm space-y-2">
          <p className="font-medium">What you'll need:</p>
          <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
            <li>A Twilio account (free to create)</li>
            <li>A credit card on file with Twilio (required by them, not us)</li>
          </ul>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <a href="https://www.twilio.com/try-twilio" target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4 mr-2" />
              Create Twilio account
            </a>
          </Button>
          <Button onClick={verify} disabled={verifying}>
            {verifying ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Verifying…
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" /> Verify connection
              </>
            )}
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          To link Twilio, ask the assistant to "connect Twilio" in chat — Lovable will guide you
          through the OAuth-style connector flow. Once linked, click "Verify connection" above.
        </p>
      </CardContent>
    </Card>
  );
}
