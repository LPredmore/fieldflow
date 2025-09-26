import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

export interface Service {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  price_per_unit: number;
  unit_type: string;
  taxable: boolean;
  created_at: string;
  updated_at: string | null;
}

export function useServices() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const { user, tenantId } = useAuth();
  const { toast } = useToast();

  const fetchServices = async () => {
    if (!user || !tenantId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('services')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        toast({
          variant: "destructive",
          title: "Error loading services",
          description: error.message,
        });
        return;
      }

      setServices(data || []);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error loading services",
        description: "An unexpected error occurred. Please try again.",
      });
    } finally {
      setLoading(false);
    }
  };

  const createService = async (serviceData: Omit<Service, 'id' | 'created_at' | 'updated_at'>) => {
    if (!user || !tenantId) return { error: 'Not authenticated' };

    try {
      const { data, error } = await supabase
        .from('services')
        .insert([
          {
            ...serviceData,
            tenant_id: tenantId,
            created_by_user_id: user.id,
          },
        ])
        .select()
        .single();

      if (error) {
        toast({
          variant: "destructive",
          title: "Error creating service",
          description: error.message,
        });
        return { error };
      }

      setServices((prev) => [data, ...prev]);
      toast({
        title: "Service created",
        description: `${serviceData.name} has been created successfully.`,
      });

      return { data, error: null };
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error creating service",
        description: "An unexpected error occurred. Please try again.",
      });
      return { error };
    }
  };

  const updateService = async (id: string, serviceData: Partial<Service>) => {
    if (!user) return { error: 'Not authenticated' };

    try {
      const { data, error } = await supabase
        .from('services')
        .update(serviceData)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        toast({
          variant: "destructive",
          title: "Error updating service",
          description: error.message,
        });
        return { error };
      }

      setServices((prev) =>
        prev.map((service) => (service.id === id ? data : service))
      );

      toast({
        title: "Service updated",
        description: "Service has been updated successfully.",
      });

      return { data, error: null };
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error updating service",
        description: "An unexpected error occurred. Please try again.",
      });
      return { error };
    }
  };

  const deleteService = async (id: string) => {
    if (!user) return { error: 'Not authenticated' };

    try {
      const { error } = await supabase
        .from('services')
        .delete()
        .eq('id', id);

      if (error) {
        toast({
          variant: "destructive",
          title: "Error deleting service",
          description: error.message,
        });
        return { error };
      }

      setServices((prev) => prev.filter((service) => service.id !== id));
      toast({
        title: "Service deleted",
        description: "Service has been deleted successfully.",
      });

      return { error: null };
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error deleting service",
        description: "An unexpected error occurred. Please try again.",
      });
      return { error };
    }
  };

  useEffect(() => {
    fetchServices();
  }, [user, tenantId]);

  return {
    services,
    loading,
    createService,
    updateService,
    deleteService,
    refetchServices: fetchServices,
  };
}