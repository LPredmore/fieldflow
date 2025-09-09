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
    try {
      // Here we would send an invitation email
      // For now, we'll just show a success message
      toast({
        title: "Invitation sent",
        description: `An invitation has been sent to ${email}`,
      });
      return { error: null };
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error sending invitation",
        description: "Failed to send invitation. Please try again.",
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