import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, RefreshCw, ExternalLink } from "lucide-react";
import { SMSStatusBadge } from "./SMSStatusBadge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { formatPhoneDisplay } from "@/lib/phoneNormalization";
import type { SmsSettings } from "@/hooks/useSmsSettings";

interface Props {
  settings: SmsSettings | null;
  onUpdate: (patch: Partial<SmsSettings>) => Promise<SmsSettings | null>;
  enabled: boolean;
}

interface TwilioNumber {
  phone_number: string;
  friendly_name: string;
  sid: string;
}

export function PhoneNumberStep({ settings, onUpdate, enabled }: Props) {
  const [numbers, setNumbers] = useState<TwilioNumber[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string>(settings?.from_number_e164 ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSelected(settings?.from_number_e164 ?? "");
  }, [settings?.from_number_e164]);

  const fetchNumbers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("sms-twilio-validate", {
        body: { action: "list_numbers" },
      });
      if (error) {
        toast({
          title: "Couldn't load numbers",
          description: error.message,
          variant: "destructive",
        });
      } else {
        setNumbers((data as { numbers?: TwilioNumber[] })?.numbers ?? []);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (enabled) fetchNumbers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  const save = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await onUpdate({ from_number_e164: selected });
      toast({ title: "Phone number saved" });
    } finally {
      setSaving(false);
    }
  };

  const isComplete = !!settings?.from_number_e164;

  return (
    <Card className={!enabled ? "opacity-60" : ""}>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="text-lg">Step 2 — Choose a phone number</CardTitle>
          <CardDescription>
            Buy a number on Twilio (~$1.15/month for a US local number), then select it below.
          </CardDescription>
        </div>
        <SMSStatusBadge status={isComplete ? "complete" : enabled ? "active" : "pending"} />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" disabled={!enabled}>
            <a
              href="https://console.twilio.com/us1/develop/phone-numbers/manage/search"
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              Buy a number on Twilio
            </a>
          </Button>
          <Button
            variant="outline"
            onClick={fetchNumbers}
            disabled={!enabled || loading}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Refresh list
          </Button>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Your Twilio numbers</label>
          <Select value={selected} onValueChange={setSelected} disabled={!enabled || loading}>
            <SelectTrigger>
              <SelectValue
                placeholder={
                  loading
                    ? "Loading…"
                    : numbers.length === 0
                      ? "No numbers yet — buy one above and refresh"
                      : "Select a number"
                }
              />
            </SelectTrigger>
            <SelectContent>
              {numbers.map((n) => (
                <SelectItem key={n.sid} value={n.phone_number}>
                  {formatPhoneDisplay(n.phone_number)} — {n.friendly_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button onClick={save} disabled={!selected || saving || selected === settings?.from_number_e164}>
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
          Save phone number
        </Button>
      </CardContent>
    </Card>
  );
}
