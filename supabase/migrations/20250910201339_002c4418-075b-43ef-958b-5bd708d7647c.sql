-- Update the SELECT RLS policy for customers to allow contractors to view all customers in their tenant
DROP POLICY IF EXISTS "Enable access for users within their tenant" ON public.customers;

CREATE POLICY "Enable access for users within their tenant" 
ON public.customers 
FOR SELECT 
USING ((tenant_id = get_user_tenant_id()) AND ((get_current_user_role() = 'business_admin'::user_role) OR (get_current_user_role() = 'contractor'::user_role)));