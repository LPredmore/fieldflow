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
  role: 'business_admin' | 'contractor' | 'client';
  parent_admin_id: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string | null;
}

export function useProfiles() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const { user, tenantId } = useAuth();
  const { toast } = useToast();

  const fetchProfiles = async () => {
    if (!user || !tenantId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .or(`id.eq.${tenantId},parent_admin_id.eq.${tenantId}`)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error loading profiles:', error);
        return;
      }

      setProfiles(data || []);
    } catch (error: any) {
      console.error('Error loading profiles:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateProfile = async (profileId: string, updates: Partial<Profile>) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', profileId)
        .select()
        .single();

      if (error) {
        toast({
          variant: "destructive",
          title: "Error updating profile",
          description: error.message,
        });
        return { error };
      }

      setProfiles(prev => 
        prev.map(profile => 
          profile.id === profileId ? data : profile
        )
      );

      toast({
        title: "Profile updated",
        description: "Profile has been updated successfully.",
      });

      return { data, error: null };
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error updating profile",
        description: "An unexpected error occurred. Please try again.",
      });
      return { error };
    }
  };

  const inviteUser = async (email: string) => {
    if (!user || !tenantId) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Authentication required to invite users.",
      });
      return { error: "Not authenticated" };
    }

    try {
      // First, check if user already exists
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id, email')
        .eq('email', email)
        .single();

      if (existingProfile) {
        toast({
          variant: "destructive",
          title: "User already exists",
          description: "This email is already registered in the system.",
        });
        return { error: "User already exists" };
      }

      // Create a temporary password for the contractor
      const tempPassword = Math.random().toString(36).slice(-8) + 'A1!';
      
      // Sign up the contractor
      const { data: authData, error: signUpError } = await supabase.auth.signUp({
        email,
        password: tempPassword,
        options: {
          data: {
            role: 'contractor',
            parent_admin_id: tenantId,
          }
        }
      });

      if (signUpError) {
        toast({
          variant: "destructive",
          title: "Error creating user",
          description: signUpError.message,
        });
        return { error: signUpError };
      }

      // Update the profile to set parent_admin_id and role
      if (authData.user) {
        const { error: updateError } = await supabase
          .from('profiles')
          .update({
            role: 'contractor',
            parent_admin_id: tenantId,
          })
          .eq('id', authData.user.id);

        if (updateError) {
          console.error('Error updating profile:', updateError);
        }
      }

      // Refresh profiles to show the new user
      await fetchProfiles();

      toast({
        title: "Contractor invited successfully",
        description: `${email} has been added as a contractor. They can sign in with the temporary password: ${tempPassword}`,
      });
      
      return { error: null, tempPassword };
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error inviting user",
        description: "Failed to invite user. Please try again.",
      });
      return { error };
    }
  };

  useEffect(() => {
    fetchProfiles();
  }, [user, tenantId]);

  return {
    profiles,
    loading,
    updateProfile,
    inviteUser,
    refetchProfiles: fetchProfiles,
  };
}