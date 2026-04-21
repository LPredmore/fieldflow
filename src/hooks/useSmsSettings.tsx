import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";

export interface SmsNotificationEvents {
  job_reminder_24h: boolean;
  on_the_way: boolean;
  quote_sent: boolean;
  invoice_sent: boolean;
  invoice_overdue: boolean;
}

export interface SmsSettings {
  id: string;
  tenant_id: string;
  twilio_connection_id: string | null;
  from_number_e164: string | null;
  messaging_service_sid: string | null;
  campaign_status: "not_started" | "pending" | "approved" | "rejected";
  campaign_status_checked_at: string | null;
  campaign_rejection_reason: string | null;
  test_message_sent_at: string | null;
  enabled: boolean;
  notification_events: SmsNotificationEvents;
  daily_send_cap: number;
  ein: string | null;
  business_website: string | null;
  campaign_use_case: string | null;
  created_at: string;
  updated_at: string | null;
}

export const DEFAULT_NOTIFICATION_EVENTS: SmsNotificationEvents = {
  job_reminder_24h: true,
  on_the_way: true,
  quote_sent: false,
  invoice_sent: false,
  invoice_overdue: false,
};

export function useSmsSettings() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<SmsSettings | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) {
      setSettings(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("sms_settings")
      .select("*")
      .maybeSingle();
    if (error && error.code !== "PGRST116") {
      console.error("Error loading sms_settings:", error);
    }
    setSettings((data as unknown as SmsSettings | null) ?? null);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const ensureExists = useCallback(async (): Promise<SmsSettings | null> => {
    if (settings) return settings;
    if (!user) return null;
    // Resolve tenant: business_admin's tenant is their own id
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, role, parent_admin_id")
      .eq("id", user.id)
      .maybeSingle();
    if (!profile) return null;
    const tenantId =
      profile.role === "business_admin" ? profile.id : profile.parent_admin_id;
    if (!tenantId) return null;
    const { data, error } = await supabase
      .from("sms_settings")
      .insert({ tenant_id: tenantId })
      .select("*")
      .single();
    if (error) {
      console.error("Error creating sms_settings:", error);
      toast({
        title: "Couldn't initialize SMS settings",
        description: error.message,
        variant: "destructive",
      });
      return null;
    }
    setSettings(data as unknown as SmsSettings);
    return data as unknown as SmsSettings;
  }, [settings, user]);

  const update = useCallback(
    async (patch: Partial<SmsSettings>) => {
      const current = await ensureExists();
      if (!current) return null;
      const { data, error } = await supabase
        .from("sms_settings")
        .update(patch as never)
        .eq("id", current.id)
        .select("*")
        .single();
      if (error) {
        toast({
          title: "Couldn't save SMS settings",
          description: error.message,
          variant: "destructive",
        });
        return null;
      }
      setSettings(data as unknown as SmsSettings);
      return data as unknown as SmsSettings;
    },
    [ensureExists],
  );

  return { settings, loading, reload: load, ensureExists, update };
}
