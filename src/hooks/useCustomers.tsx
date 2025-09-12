import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

export interface Customer {
  id: string;
  name: string;
  email: string | null;
  phone: string;
  address: {
    street?: string;
    city?: string;
    state?: string;
    zip_code?: string;
    country?: string;
  } | null;
  customer_type: 'residential' | 'commercial';
  notes: string | null;
  total_jobs_count: number;
  total_revenue_billed: number;
  assigned_to_user_id: string;
  assigned_user_name?: string;
  created_at: string;
  updated_at: string | null;
}

export interface CustomerFormData {
  name: string;
  customer_type: 'residential' | 'commercial';
  phone: string;
  email?: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    zip_code?: string;
    country?: string;
  };
  notes?: string;
  assigned_to_user_id?: string;
}

export function useCustomers() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const { user, tenantId } = useAuth();
  const { toast } = useToast();

  const fetchCustomers = async () => {
    if (!user || !tenantId) return;

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('customers')
        .select(`
          *,
          assigned_user:profiles!customers_assigned_to_user_id_fkey(
            full_name
          )
        `)
        .order('created_at', { ascending: false });

      if (error) {
        toast({
          variant: "destructive",
          title: "Error loading customers",
          description: error.message,
        });
        return;
      }

      // Transform the data to match our Customer interface
      const transformedCustomers = (data || []).map((customer: any) => ({
        ...customer,
        address: customer.address as Customer['address'],
        assigned_user_name: customer.assigned_user?.full_name || 'Unknown User'
      }));

      setCustomers(transformedCustomers);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error loading customers",
        description: "An unexpected error occurred. Please try again.",
      });
    } finally {
      setLoading(false);
    }
  };

  const createCustomer = async (customerData: CustomerFormData) => {
    if (!user || !tenantId) return { error: 'Not authenticated' };

    try {
      const { data, error } = await supabase
        .from('customers')
        .insert([
          {
            ...customerData,
            tenant_id: tenantId,
            created_by_user_id: user.id,
            assigned_to_user_id: customerData.assigned_to_user_id || user.id,
          },
        ])
        .select(`
          *,
          assigned_user:profiles!customers_assigned_to_user_id_fkey(
            full_name
          )
        `)
        .single();

      if (error) {
        toast({
          variant: "destructive",
          title: "Error creating customer",
          description: error.message,
        });
        return { error };
      }

      const transformedCustomer = {
        ...data,
        address: data.address as Customer['address'],
        assigned_user_name: (data as any).assigned_user?.full_name || 'Unknown User'
      };
      setCustomers((prev) => [transformedCustomer, ...prev]);
      toast({
        title: "Customer created",
        description: `${customerData.name} has been added successfully.`,
      });

      return { data, error: null };
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error creating customer",
        description: "An unexpected error occurred. Please try again.",
      });
      return { error };
    }
  };

  const updateCustomer = async (id: string, customerData: Partial<CustomerFormData>) => {
    if (!user) return { error: 'Not authenticated' };

    try {
      const { data, error } = await supabase
        .from('customers')
        .update(customerData)
        .eq('id', id)
        .select(`
          *,
          assigned_user:profiles!customers_assigned_to_user_id_fkey(
            full_name
          )
        `)
        .single();

      if (error) {
        toast({
          variant: "destructive",
          title: "Error updating customer",
          description: error.message,
        });
        return { error };
      }

      const transformedCustomer = {
        ...data,
        address: data.address as Customer['address'],
        assigned_user_name: (data as any).assigned_user?.full_name || 'Unknown User'
      };
      setCustomers((prev) =>
        prev.map((customer) => (customer.id === id ? transformedCustomer : customer))
      );

      toast({
        title: "Customer updated",
        description: "Customer has been updated successfully.",
      });

      return { data, error: null };
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error updating customer",
        description: "An unexpected error occurred. Please try again.",
      });
      return { error };
    }
  };

  const deleteCustomer = async (id: string) => {
    if (!user) return { error: 'Not authenticated' };

    try {
      const { error } = await supabase
        .from('customers')
        .delete()
        .eq('id', id);

      if (error) {
        toast({
          variant: "destructive",
          title: "Error deleting customer",
          description: error.message,
        });
        return { error };
      }

      setCustomers((prev) => prev.filter((customer) => customer.id !== id));
      toast({
        title: "Customer deleted",
        description: "Customer has been deleted successfully.",
      });

      return { error: null };
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error deleting customer",
        description: "An unexpected error occurred. Please try again.",
      });
      return { error };
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, [user, tenantId]);

  // Statistics calculations
  const stats = {
    total: customers.length,
    residential: customers.filter(c => c.customer_type === 'residential').length,
    commercial: customers.filter(c => c.customer_type === 'commercial').length,
    totalRevenue: customers.reduce((sum, c) => sum + (c.total_revenue_billed || 0), 0),
  };

  return {
    customers,
    loading,
    stats,
    createCustomer,
    updateCustomer,
    deleteCustomer,
    refetchCustomers: fetchCustomers,
  };
}