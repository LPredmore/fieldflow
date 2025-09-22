import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import type { Database } from '@/integrations/supabase/types';

export interface Settings {
  id: string;
  tenant_id: string;
  created_by_user_id: string;
  business_name: string | null;
  business_email: string | null;
  business_phone: string | null;
  business_website: string | null;
  business_address: any | null;
  logo_url: string | null;
  brand_color: string | null;
  text_color: string | null;
  tax_settings: any | null;
  payment_settings: any | null;
  invoice_settings: any | null;
  notification_settings: any | null;
  service_settings: any | null;
  business_hours: any | null;
  system_settings: any | null;
  user_preferences: any | null;
  time_zone: Database["public"]["Enums"]["time_zones"] | null;
  created_at: string;
  updated_at: string | null;
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const { user, tenantId, isAdmin } = useAuth();
  const { toast } = useToast();

  const fetchSettings = async () => {
    if (!user || !tenantId) return;

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('settings')
        .select('*')
        .eq('tenant_id', tenantId)
        .single();

      if (error) {
        console.error('Error loading settings:', error);
        return;
      }

      setSettings(data ? { ...data, text_color: data.text_color || null, time_zone: data.time_zone || null } : null);
    } catch (error: any) {
      console.error('Error loading settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateSettings = async (settingsData: Partial<Settings>) => {
    if (!user || !tenantId || !settings) return { error: 'Not authenticated or no settings found' };
    
    // Only admins can update settings
    if (!isAdmin) {
      toast({
        variant: "destructive",
        title: "Access denied",
        description: "Only business administrators can update settings.",
      });
      return { error: 'Insufficient permissions' };
    }

    try {
      const { data, error } = await supabase
        .from('settings')
        .update(settingsData)
        .eq('id', settings.id)
        .select()
        .single();

      if (error) {
        toast({
          variant: "destructive",
          title: "Error updating settings",
          description: error.message,
        });
        return { error };
      }

      setSettings({ ...data, text_color: data.text_color || null, time_zone: data.time_zone || null });
      toast({
        title: "Settings updated",
        description: "Your settings have been updated successfully.",
      });

      return { data, error: null };
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error updating settings",
        description: "An unexpected error occurred. Please try again.",
      });
      return { error };
    }
  };

  const createSettings = async (settingsData: Partial<Settings>) => {
    if (!user || !tenantId) return { error: 'Not authenticated' };
    
    // Only admins can create settings
    if (!isAdmin) {
      toast({
        variant: "destructive",
        title: "Access denied",
        description: "Only business administrators can create settings.",
      });
      return { error: 'Insufficient permissions' };
    }

    try {
      const { data, error } = await supabase
        .from('settings')
        .insert([
          {
            ...settingsData,
            tenant_id: tenantId,
            created_by_user_id: user.id,
          },
        ])
        .select()
        .single();

      if (error) {
        toast({
          variant: "destructive",
          title: "Error creating settings",
          description: error.message,
        });
        return { error };
      }

      setSettings({ ...data, text_color: data.text_color || null, time_zone: data.time_zone || null });
      toast({
        title: "Settings created",
        description: "Your settings have been created successfully.",
      });

      return { data, error: null };
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error creating settings",
        description: "An unexpected error occurred. Please try again.",
      });
      return { error };
    }
  };

  useEffect(() => {
    fetchSettings();
  }, [user, tenantId]);

  return {
    settings,
    loading,
    updateSettings,
    createSettings,
    refetchSettings: fetchSettings,
  };
}