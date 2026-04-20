import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, CreditCard, AlertTriangle, CheckCircle2, ExternalLink, Unplug } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSettings } from "@/hooks/useSettings";
import { useToast } from "@/hooks/use-toast";

type Method = "stripe" | "paypal" | "venmo" | "cashapp" | "cash" | "check" | "bank_transfer";

const METHOD_LABELS: Record<Method, string> = {
  stripe: "Stripe (Card / ACH)",
  paypal: "PayPal.Me",
  venmo: "Venmo",
  cashapp: "Cash App",
  cash: "Cash",
  check: "Check",
  bank_transfer: "Bank Transfer",
};

const ALL_METHODS: Method[] = ["stripe", "paypal", "venmo", "cashapp", "cash", "check", "bank_transfer"];

interface ConnectedAccount {
  id: string;
  account_email: string | null;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  display_name: string | null;
  stripe_account_id: string;
}

export default function PaymentMethodsSettings() {
  const { settings, updateSettings, createSettings, loading } = useSettings();
  const { tenantId } = useAuth();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const [enabledMethods, setEnabledMethods] = useState<Method[]>([]);
  const [paypalLink, setPaypalLink] = useState("");
  const [venmoHandle, setVenmoHandle] = useState("");
  const [cashappHandle, setCashappHandle] = useState("");
  const [checkPayableTo, setCheckPayableTo] = useState("");
  const [bankInstructions, setBankInstructions] = useState("");
  const [paymentInstructions, setPaymentInstructions] = useState("");
  const [saving, setSaving] = useState(false);

  const [account, setAccount] = useState<ConnectedAccount | null>(null);
  const [accountLoading, setAccountLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  // Hydrate form from settings
  useEffect(() => {
    if (!settings) return;
    const ps = (settings.payment_settings ?? {}) as any;
    setEnabledMethods(
      Array.isArray(ps.enabled_methods) && ps.enabled_methods.length > 0
        ? ps.enabled_methods
        : // sensible defaults from legacy fields
          [
            ps.paypal_me_link ? "paypal" : null,
            ps.venmo_handle ? "venmo" : null,
          ].filter(Boolean) as Method[]
    );
    setPaypalLink(ps.paypal_me_link ?? "");
    setVenmoHandle(ps.venmo_handle ?? "");
    setCashappHandle(ps.cashapp_handle ?? "");
    setCheckPayableTo(ps.check_payable_to ?? "");
    setBankInstructions(ps.bank_transfer_instructions ?? "");
    setPaymentInstructions(ps.payment_instructions ?? ps.other_instructions ?? "");
  }, [settings]);

  // Load connected stripe account
  const loadAccount = async () => {
    if (!tenantId) return;
    setAccountLoading(true);
    const { data } = await supabase
      .from("stripe_connected_accounts")
      .select("id, account_email, charges_enabled, payouts_enabled, display_name, stripe_account_id, disconnected_at")
      .eq("tenant_id", tenantId)
      .is("disconnected_at", null)
      .maybeSingle();
    setAccount(data ?? null);
    setAccountLoading(false);
  };

  useEffect(() => {
    loadAccount();
  }, [tenantId]);

  // Toast on OAuth return
  useEffect(() => {
    const stripeStatus = searchParams.get("stripe");
    if (stripeStatus === "connected") {
      toast({ title: "Stripe connected", description: "Your Stripe account is now linked." });
      loadAccount();
      searchParams.delete("stripe");
      setSearchParams(searchParams, { replace: true });
    } else if (stripeStatus === "error") {
      const reason = searchParams.get("reason") ?? "unknown";
      toast({
        variant: "destructive",
        title: "Stripe connection failed",
        description: reason,
      });
      searchParams.delete("stripe");
      searchParams.delete("reason");
      setSearchParams(searchParams, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleMethod = (m: Method, checked: boolean) => {
    setEnabledMethods((prev) =>
      checked ? Array.from(new Set([...prev, m])) : prev.filter((x) => x !== m)
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        payment_settings: {
          enabled_methods: enabledMethods,
          paypal_me_link: paypalLink,
          venmo_handle: venmoHandle,
          cashapp_handle: cashappHandle,
          check_payable_to: checkPayableTo,
          bank_transfer_instructions: bankInstructions,
          payment_instructions: paymentInstructions,
        },
      };
      if (settings) await updateSettings(payload as any);
      else await createSettings(payload as any);
      toast({ title: "Payment methods saved" });
    } finally {
      setSaving(false);
    }
  };

  const handleConnectStripe = async () => {
    setConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("stripe-connect-oauth-start");
      if (error) throw error;
      if (data?.url) {
        window.location.href = data.url;
      }
    } catch (e: any) {
      toast({ variant: "destructive", title: "Failed to start Stripe Connect", description: e.message });
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm("Disconnect your Stripe account? You'll need to reconnect to accept Stripe payments again.")) return;
    setDisconnecting(true);
    try {
      const { error } = await supabase.functions.invoke("stripe-connect-disconnect");
      if (error) throw error;
      toast({ title: "Stripe disconnected" });
      await loadAccount();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Failed to disconnect", description: e.message });
    } finally {
      setDisconnecting(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-32">
          <Loader2 className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Payment Methods Customers Can Use</CardTitle>
        <CardDescription>
          Choose which payment options appear on your public invoices. Stripe processes cards and ACH automatically;
          all other methods are tracked manually.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Stripe Row */}
        <div className="rounded-lg border p-4 space-y-4">
          <div className="flex items-start gap-3">
            <Checkbox
              id="method-stripe"
              checked={enabledMethods.includes("stripe")}
              onCheckedChange={(c) => toggleMethod("stripe", !!c)}
              disabled={!account || !account.charges_enabled}
            />
            <div className="flex-1">
              <Label htmlFor="method-stripe" className="text-base font-semibold flex items-center gap-2">
                <CreditCard className="h-4 w-4" />
                {METHOD_LABELS.stripe}
              </Label>
              <p className="text-sm text-muted-foreground mt-1">
                Accept credit/debit cards and US bank transfers. Funds deposit directly into your Stripe account.
              </p>

              <div className="mt-3">
                {accountLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : !account ? (
                  <Button onClick={handleConnectStripe} disabled={connecting} size="sm">
                    {connecting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ExternalLink className="h-4 w-4 mr-2" />}
                    Connect Stripe Account
                  </Button>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      {account.charges_enabled ? (
                        <Badge className="bg-success/10 text-success border-success/20">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Connected{account.account_email ? ` as ${account.account_email}` : ""}
                        </Badge>
                      ) : (
                        <Badge className="bg-warning/10 text-warning border-warning/20">
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          Connected — finish setup in Stripe
                        </Badge>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleDisconnect}
                        disabled={disconnecting}
                      >
                        {disconnecting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Unplug className="h-4 w-4 mr-2" />}
                        Disconnect
                      </Button>
                    </div>
                    {!account.charges_enabled && (
                      <Alert>
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription>
                          Your Stripe account is connected but isn't enabled to accept charges yet.
                          Open your Stripe dashboard to complete verification.
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Manual methods */}
        <div className="space-y-4">
          {(["paypal", "venmo", "cashapp", "cash", "check", "bank_transfer"] as Method[]).map((m) => (
            <div key={m} className="rounded-lg border p-4">
              <div className="flex items-start gap-3">
                <Checkbox
                  id={`method-${m}`}
                  checked={enabledMethods.includes(m)}
                  onCheckedChange={(c) => toggleMethod(m, !!c)}
                />
                <div className="flex-1 space-y-3">
                  <Label htmlFor={`method-${m}`} className="text-base font-semibold">
                    {METHOD_LABELS[m]}
                  </Label>

                  {enabledMethods.includes(m) && (
                    <>
                      {m === "paypal" && (
                        <div>
                          <Label htmlFor="paypal-link" className="text-sm">PayPal.Me link</Label>
                          <Input
                            id="paypal-link"
                            placeholder="https://paypal.me/yourbusiness"
                            value={paypalLink}
                            onChange={(e) => setPaypalLink(e.target.value)}
                          />
                        </div>
                      )}
                      {m === "venmo" && (
                        <div>
                          <Label htmlFor="venmo" className="text-sm">Venmo handle</Label>
                          <Input
                            id="venmo"
                            placeholder="@yourbusiness"
                            value={venmoHandle}
                            onChange={(e) => setVenmoHandle(e.target.value)}
                          />
                        </div>
                      )}
                      {m === "cashapp" && (
                        <div>
                          <Label htmlFor="cashapp" className="text-sm">Cash App $cashtag</Label>
                          <Input
                            id="cashapp"
                            placeholder="$yourbusiness"
                            value={cashappHandle}
                            onChange={(e) => setCashappHandle(e.target.value)}
                          />
                        </div>
                      )}
                      {m === "check" && (
                        <div>
                          <Label htmlFor="check" className="text-sm">Make checks payable to</Label>
                          <Input
                            id="check"
                            placeholder="Your Business LLC"
                            value={checkPayableTo}
                            onChange={(e) => setCheckPayableTo(e.target.value)}
                          />
                        </div>
                      )}
                      {m === "bank_transfer" && (
                        <div>
                          <Label htmlFor="bank" className="text-sm">Bank transfer instructions</Label>
                          <Textarea
                            id="bank"
                            placeholder="Bank name, routing #, account #, etc."
                            className="min-h-[80px]"
                            value={bankInstructions}
                            onChange={(e) => setBankInstructions(e.target.value)}
                          />
                        </div>
                      )}
                      {m === "cash" && (
                        <p className="text-sm text-muted-foreground">
                          Customers will see "Cash accepted in person" on the invoice.
                        </p>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Generic instructions */}
        <div>
          <Label htmlFor="general-instructions">Additional payment notes (optional)</Label>
          <Textarea
            id="general-instructions"
            placeholder="Any other notes shown to customers on the invoice."
            className="min-h-[80px]"
            value={paymentInstructions}
            onChange={(e) => setPaymentInstructions(e.target.value)}
          />
        </div>

        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
          Save Payment Methods
        </Button>
      </CardContent>
    </Card>
  );
}
