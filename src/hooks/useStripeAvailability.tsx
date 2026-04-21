import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export type StripeAvailabilityStatus = 'loading' | 'enabled' | 'disabled';

export interface UseStripeAvailabilityResult {
  status: StripeAvailabilityStatus;
  refresh: () => Promise<void>;
  lastCheckedAt: Date | null;
}

/**
 * Tri-state hook for checking whether the tenant behind a given customer has
 * Stripe Connect enabled and able to accept charges. Fail-closed: any RPC
 * error resolves to 'disabled' so we never offer Pay Now on indeterminate state.
 */
export function useStripeAvailability(customerId: string | undefined): UseStripeAvailabilityResult {
  const { toast } = useToast();
  const [status, setStatus] = useState<StripeAvailabilityStatus>(
    customerId ? 'loading' : 'disabled'
  );
  const [lastCheckedAt, setLastCheckedAt] = useState<Date | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const check = useCallback(async (id: string) => {
    try {
      const { data, error } = await supabase.rpc('is_stripe_enabled_for_customer', {
        _customer_id: id,
      });

      if (!isMountedRef.current) return;

      if (error) throw error;

      setStatus(data === true ? 'enabled' : 'disabled');
      setLastCheckedAt(new Date());
    } catch (err: any) {
      if (!isMountedRef.current) return;
      console.error('Stripe availability check failed:', err);
      setStatus('disabled');
      setLastCheckedAt(new Date());
      toast({
        title: 'Could not verify payment availability',
        description: err?.message || 'Please try refreshing again.',
        variant: 'destructive',
      });
    }
  }, [toast]);

  // Initial fetch + refetch when customerId changes
  useEffect(() => {
    if (!customerId) {
      setStatus('disabled');
      return;
    }
    setStatus('loading');
    check(customerId);
  }, [customerId, check]);

  const refresh = useCallback(async () => {
    if (!customerId) return;
    setStatus('loading');
    await check(customerId);
  }, [customerId, check]);

  return { status, refresh, lastCheckedAt };
}
