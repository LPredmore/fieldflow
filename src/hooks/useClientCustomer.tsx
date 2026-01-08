import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

export interface ClientCustomerData {
  id: string;
  name: string;
  email: string | null;
  phone: string;
  address: {
    street?: string;
    city?: string;
    state?: string;
    zip?: string;
  } | null;
  notes: string | null;
  customer_type: 'residential' | 'commercial';
  created_at: string;
  updated_at: string | null;
}

export interface ClientCustomerUpdateData {
  name?: string;
  email?: string;
  phone?: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    zip?: string;
  };
  notes?: string;
}

export function useClientCustomer() {
  const [customer, setCustomer] = useState<ClientCustomerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();
  const { toast } = useToast();

  const fetchCustomer = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Fetch customer record linked to this client user
      const { data, error: fetchError } = await supabase
        .from('customers')
        .select('*')
        .eq('client_user_id', user.id)
        .single();

      if (fetchError) {
        if (fetchError.code === 'PGRST116') {
          // No customer record found for this client
          setError('No customer profile found. Please contact your service provider.');
        } else {
          throw fetchError;
        }
      } else {
        setCustomer(data as ClientCustomerData);
      }
    } catch (err: any) {
      console.error('Error fetching client customer data:', err);
      setError('Failed to load your profile. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchCustomer();
  }, [fetchCustomer]);

  const updateCustomer = async (updates: ClientCustomerUpdateData) => {
    if (!user || !customer) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'You must be logged in to update your profile.',
      });
      return false;
    }

    try {
      const { error: updateError } = await supabase
        .from('customers')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('client_user_id', user.id);

      if (updateError) throw updateError;

      // Refresh customer data
      await fetchCustomer();

      toast({
        title: 'Profile updated',
        description: 'Your profile has been updated successfully.',
      });

      return true;
    } catch (err: any) {
      console.error('Error updating client customer data:', err);
      toast({
        variant: 'destructive',
        title: 'Update failed',
        description: 'Failed to update your profile. Please try again.',
      });
      return false;
    }
  };

  return {
    customer,
    loading,
    error,
    updateCustomer,
    refetch: fetchCustomer,
  };
}
