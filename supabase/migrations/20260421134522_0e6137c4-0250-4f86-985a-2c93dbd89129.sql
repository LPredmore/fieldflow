CREATE OR REPLACE FUNCTION public.is_stripe_enabled_for_customer(_customer_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.customers c
    JOIN public.stripe_connected_accounts sca ON sca.tenant_id = c.tenant_id
    WHERE c.id = _customer_id
      AND c.client_user_id = auth.uid()
      AND sca.disconnected_at IS NULL
      AND sca.charges_enabled = true
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_stripe_enabled_for_customer(uuid) TO authenticated;