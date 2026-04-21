import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Copy, ExternalLink, Loader2 } from "lucide-react";
import { SMSStatusBadge } from "./SMSStatusBadge";
import { toast } from "@/hooks/use-toast";
import type { SmsSettings } from "@/hooks/useSmsSettings";

interface Props {
  settings: SmsSettings | null;
  onUpdate: (patch: Partial<SmsSettings>) => Promise<SmsSettings | null>;
  businessName: string;
  enabled: boolean;
}

const SAMPLE_MESSAGES = (businessName: string) => [
  `Reminder: ${businessName} is scheduled to visit you tomorrow at 2pm. Reply STOP to opt out.`,
  `Your ${businessName} technician is on the way and will arrive in about 20 minutes.`,
  `Your invoice from ${businessName} is ready: https://example.com/i/abc123. Reply STOP to opt out.`,
];

const OPT_IN_TEMPLATE = (businessName: string) =>
  `Customers receive transactional SMS from ${businessName} only after creating a service account or scheduling work with us. Each first-contact message includes "Reply STOP to opt out, HELP for help." Opt-outs are honored immediately and stored. Customers may also opt in by checking a box on our service request form.`;

export function CampaignRegistrationStep({ settings, onUpdate, businessName, enabled }: Props) {
  const [ein, setEin] = useState(settings?.ein ?? "");
  const [website, setWebsite] = useState(settings?.business_website ?? "");
  const [useCase, setUseCase] = useState(settings?.campaign_use_case ?? "Customer Care");
  const [saving, setSaving] = useState(false);

  const status = settings?.campaign_status ?? "not_started";
  const isComplete = status === "approved";

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: `${label} copied` });
  };

  const saveDraft = async () => {
    setSaving(true);
    try {
      await onUpdate({
        ein,
        business_website: website,
        campaign_use_case: useCase,
      });
      toast({ title: "Draft saved" });
    } finally {
      setSaving(false);
    }
  };

  const markSubmitted = async () => {
    setSaving(true);
    try {
      await onUpdate({
        ein,
        business_website: website,
        campaign_use_case: useCase,
        campaign_status: "pending",
        campaign_status_checked_at: new Date().toISOString(),
      });
      toast({ title: "Marked as pending review" });
    } finally {
      setSaving(false);
    }
  };

  const markApproved = async () => {
    setSaving(true);
    try {
      await onUpdate({ campaign_status: "approved" });
      toast({ title: "Campaign approved ✓" });
    } finally {
      setSaving(false);
    }
  };

  const samples = SAMPLE_MESSAGES(businessName || "Your Business");
  const optIn = OPT_IN_TEMPLATE(businessName || "Your Business");

  return (
    <Card className={!enabled ? "opacity-60" : ""}>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="text-lg">Step 3 — Register A2P 10DLC campaign</CardTitle>
          <CardDescription>
            US carriers require this for application-to-person SMS. Approval typically takes
            1–3 business days. We've pre-filled the tricky bits.
          </CardDescription>
        </div>
        <SMSStatusBadge
          status={
            isComplete
              ? "complete"
              : status === "rejected"
                ? "error"
                : status === "pending"
                  ? "active"
                  : enabled
                    ? "active"
                    : "pending"
          }
          label={
            isComplete
              ? "Approved"
              : status === "rejected"
                ? "Rejected"
                : status === "pending"
                  ? "Pending Review"
                  : "Not Started"
          }
        />
      </CardHeader>
      <CardContent className="space-y-4">
        {settings?.campaign_rejection_reason && status === "rejected" && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm">
            <p className="font-medium text-destructive">Rejection reason</p>
            <p className="text-muted-foreground mt-1">{settings.campaign_rejection_reason}</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Business EIN</Label>
            <Input
              value={ein}
              onChange={(e) => setEin(e.target.value)}
              placeholder="12-3456789"
              disabled={!enabled}
            />
          </div>
          <div className="space-y-2">
            <Label>Business website</Label>
            <Input
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://example.com"
              disabled={!enabled}
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Campaign use case</Label>
            <Select value={useCase} onValueChange={setUseCase} disabled={!enabled}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Customer Care">Customer Care (recommended)</SelectItem>
                <SelectItem value="Account Notification">Account Notification</SelectItem>
                <SelectItem value="Delivery Notification">Delivery Notification</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Sample messages (paste these into Twilio's "Sample Messages" field)</Label>
          {samples.map((msg, i) => (
            <div key={i} className="flex gap-2">
              <Textarea value={msg} readOnly rows={2} className="text-sm font-mono" />
              <Button
                variant="outline"
                size="icon"
                onClick={() => copy(msg, "Sample")}
                className="shrink-0"
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>

        <div className="space-y-2">
          <Label>Opt-in description (paste into "How do end-users consent?")</Label>
          <div className="flex gap-2">
            <Textarea value={optIn} readOnly rows={4} className="text-sm" />
            <Button
              variant="outline"
              size="icon"
              onClick={() => copy(optIn, "Opt-in")}
              className="shrink-0"
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 pt-2">
          <Button asChild variant="outline" disabled={!enabled}>
            <a
              href="https://console.twilio.com/us1/develop/sms/regulatory-compliance/onboarding/a2p-10dlc"
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink className="h-4 w-4 mr-2" /> Open Twilio A2P setup
            </a>
          </Button>
          <Button onClick={saveDraft} variant="outline" disabled={!enabled || saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save draft
          </Button>
          {status !== "pending" && status !== "approved" && (
            <Button onClick={markSubmitted} disabled={!enabled || saving}>
              I submitted my campaign
            </Button>
          )}
          {status === "pending" && (
            <Button onClick={markApproved} disabled={!enabled || saving} variant="default">
              Mark as approved
            </Button>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          Twilio reviews each submission. When you receive Twilio's approval email, click "Mark
          as approved" to enable sending.
        </p>
      </CardContent>
    </Card>
  );
}
