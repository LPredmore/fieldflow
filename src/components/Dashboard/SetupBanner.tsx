import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useSettings } from "@/hooks/useSettings";
import { useSmsSettings } from "@/hooks/useSmsSettings";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, X } from "lucide-react";
import { Link } from "react-router-dom";

const DISMISS_KEY = "fieldflow.setup_banner_dismissed_v1";

export function SetupBanner() {
  const { isAdmin } = useAuth();
  const { settings, loading: settingsLoading } = useSettings();
  const { settings: smsSettings, loading: smsLoading } = useSmsSettings();
  const [dismissed, setDismissed] = useState<boolean>(false);

  useEffect(() => {
    setDismissed(typeof window !== "undefined" && !!localStorage.getItem(DISMISS_KEY));
  }, []);

  if (!isAdmin || settingsLoading || smsLoading || dismissed) return null;

  const missingEmail = !settings?.email_from_address;
  const missingSms = !smsSettings || !smsSettings.from_number_e164 || !smsSettings.enabled;

  if (!missingEmail && !missingSms) return null;

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  };

  return (
    <Card className="mb-6 border-warning/40 bg-warning/5">
      <CardContent className="flex items-start gap-4 p-4">
        <AlertCircle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
        <div className="flex-1 space-y-2">
          <div>
            <p className="font-medium">Finish setting up notifications</p>
            <p className="text-sm text-muted-foreground">
              Customer messaging won't go out until you configure these:
            </p>
          </div>
          <ul className="text-sm text-muted-foreground space-y-1 ml-4 list-disc">
            {missingEmail && (
              <li>
                <strong>Email sender</strong> — set a verified "From" address so emails
                aren't sent from the default Resend address.
              </li>
            )}
            {missingSms && (
              <li>
                <strong>SMS</strong> — connect Twilio, choose a number, and turn SMS on.
              </li>
            )}
          </ul>
          <div className="flex flex-wrap gap-2 pt-1">
            {missingEmail && (
              <Button asChild size="sm" variant="outline">
                <Link to="/settings?tab=business">Configure email sender</Link>
              </Button>
            )}
            {missingSms && (
              <Button asChild size="sm" variant="outline">
                <Link to="/settings?tab=notifications">Configure SMS</Link>
              </Button>
            )}
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0"
          onClick={handleDismiss}
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </Button>
      </CardContent>
    </Card>
  );
}
