-- Update the SELECT RLS policy for invoices to allow contractors to view all invoices in their tenant
DROP POLICY IF EXISTS "Enable access for users within their tenant" ON public.invoices;

CREATE POLICY "Enable access for users within their tenant" 
ON public.invoices 
FOR SELECT 
USING ((tenant_id = get_user_tenant_id()) AND ((get_current_user_role() = 'business_admin'::user_role) OR (get_current_user_role() = 'contractor'::user_role)));

-- Update the SELECT RLS policy for quotes to allow contractors to view all quotes in their tenant
DROP POLICY IF EXISTS "Enable access for users within their tenant" ON public.quotes;

CREATE POLICY "Enable access for users within their tenant" 
ON public.quotes 
FOR SELECT 
USING ((tenant_id = get_user_tenant_id()) AND ((get_current_user_role() = 'business_admin'::user_role) OR (get_current_user_role() = 'contractor'::user_role)));