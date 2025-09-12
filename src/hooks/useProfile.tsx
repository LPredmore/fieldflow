import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

export interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  company_name: string | null;
  role: 'business_admin' | 'contractor';
  parent_admin_id: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string | null;
}

interface PersonalInfo {
  full_name: string;
  phone: string;
}

export function useProfile() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const { toast } = useToast();

  const fetchCurrentUserProfile = async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (error) {
        console.error('Error loading profile:', error);
        return;
      }

      setProfile(data);
    } catch (error: any) {
      console.error('Error loading profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const updatePersonalInfo = async (personalInfo: PersonalInfo) => {
    if (!user || !profile) {
      return { error: { message: "User not authenticated" } };
    }

    try {
      const { data, error } = await supabase
        .from('profiles')
        .update({
          full_name: personalInfo.full_name,
          phone: personalInfo.phone,
        })
        .eq('id', user.id)
        .select()
        .single();

      if (error) {
        return { error };
      }

      setProfile(data);
      
      toast({
        title: "Profile updated",
        description: "Your personal information has been updated successfully.",
      });

      return { data, error: null };
    } catch (error: any) {
      return { error };
    }
  };

  const updateEmail = async (newEmail: string) => {
    if (!user || !profile) {
      return { error: { message: "User not authenticated" } };
    }

    try {
      // First update the auth email
      const { error: authError } = await supabase.auth.updateUser({
        email: newEmail
      });

      if (authError) {
        return { error: authError };
      }

      // Then update the profile email
      const { data, error: profileError } = await supabase
        .from('profiles')
        .update({ email: newEmail })
        .eq('id', user.id)
        .select()
        .single();

      if (profileError) {
        return { error: profileError };
      }

      setProfile(data);
      
      toast({
        title: "Email updated",
        description: "Your email address has been updated successfully. Please check your new email for confirmation.",
      });

      return { data, error: null };
    } catch (error: any) {
      return { error };
    }
  };

  const updatePassword = async (newPassword: string) => {
    if (!user) {
      return { error: { message: "User not authenticated" } };
    }

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (error) {
        return { error };
      }

      toast({
        title: "Password updated",
        description: "Your password has been updated successfully.",
      });

      return { error: null };
    } catch (error: any) {
      return { error };
    }
  };

  useEffect(() => {
    fetchCurrentUserProfile();
  }, [user]);

  // Update profile state when form data changes to keep it in sync
  useEffect(() => {
    if (profile && user) {
      setProfile(prev => prev ? { ...prev, email: user.email || prev.email } : null);
    }
  }, [user?.email]);

  return {
    profile,
    loading,
    updatePersonalInfo,
    updateEmail,
    updatePassword,
    refetchProfile: fetchCurrentUserProfile,
  };
}
