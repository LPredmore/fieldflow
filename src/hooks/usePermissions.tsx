import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { UserPermissions, getDefaultPermissions } from '@/utils/permissionUtils';

export function usePermissions() {
  const [permissions, setPermissions] = useState<UserPermissions | null>(null);
  const [loading, setLoading] = useState(true);
  const { user, userRole } = useAuth();
  const { toast } = useToast();

  const fetchPermissions = async (userId?: string) => {
    if (!user && !userId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const targetUserId = userId || user?.id;
      
      const { data, error } = await supabase
        .from('user_permissions')
        .select('send_quotes, access_services, access_invoicing, supervisor')
        .eq('user_id', targetUserId)
        .single();

      if (error) {
        // If no permissions found, use defaults based on role
        if (error.code === 'PGRST116') {
          const defaultPerms = getDefaultPermissions(userRole);
          setPermissions(defaultPerms);
        } else {
          console.error('Error loading permissions:', error);
          setPermissions(getDefaultPermissions(userRole));
        }
        return;
      }

      setPermissions(data);
    } catch (error: any) {
      console.error('Error loading permissions:', error);
      setPermissions(getDefaultPermissions(userRole));
    } finally {
      setLoading(false);
    }
  };

  const updatePermissions = async (userId: string, updates: Partial<UserPermissions>) => {
    try {
      const { data, error } = await supabase
        .from('user_permissions')
        .update(updates)
        .eq('user_id', userId)
        .select('send_quotes, access_services, access_invoicing, supervisor')
        .single();

      if (error) {
        toast({
          variant: "destructive",
          title: "Error updating permissions",
          description: error.message,
        });
        return { error };
      }

      // If updating current user's permissions, update local state
      if (userId === user?.id) {
        setPermissions(data);
      }

      toast({
        title: "Permissions updated",
        description: "User permissions have been updated successfully.",
      });

      return { data, error: null };
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error updating permissions",
        description: "An unexpected error occurred. Please try again.",
      });
      return { error };
    }
  };

  const createPermissions = async (userId: string, tenantId: string, newPermissions: UserPermissions) => {
    try {
      const { data, error } = await supabase
        .from('user_permissions')
        .insert({
          user_id: userId,
          tenant_id: tenantId,
          ...newPermissions
        })
        .select('send_quotes, access_services, access_invoicing, supervisor')
        .single();

      if (error) {
        toast({
          variant: "destructive",
          title: "Error creating permissions",
          description: error.message,
        });
        return { error };
      }

      return { data, error: null };
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error creating permissions",
        description: "An unexpected error occurred. Please try again.",
      });
      return { error };
    }
  };

  useEffect(() => {
    fetchPermissions();
  }, [user, userRole]);

  return {
    permissions,
    loading,
    updatePermissions,
    createPermissions,
    refetchPermissions: fetchPermissions,
  };
}