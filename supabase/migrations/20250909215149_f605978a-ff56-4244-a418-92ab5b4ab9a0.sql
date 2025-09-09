-- Update RLS policies to enforce role-based access control

-- Update customers table policies for role-based access
DROP POLICY IF EXISTS "Enable access for users within their tenant" ON public.customers;
CREATE POLICY "Enable access for users within their tenant" ON public.customers 
FOR SELECT 
USING (
  tenant_id = get_user_tenant_id() AND 
  (get_current_user_role() = 'business_admin' OR created_by_user_id = auth.uid())
);

-- Update quotes table policies for role-based access  
DROP POLICY IF EXISTS "Enable access for users within their tenant" ON public.quotes;
CREATE POLICY "Enable access for users within their tenant" ON public.quotes 
FOR SELECT 
USING (
  tenant_id = get_user_tenant_id() AND 
  (get_current_user_role() = 'business_admin' OR created_by_user_id = auth.uid())
);

-- Update invoices table policies for role-based access
DROP POLICY IF EXISTS "Enable access for users within their tenant" ON public.invoices;
CREATE POLICY "Enable access for users within their tenant" ON public.invoices 
FOR SELECT 
USING (
  tenant_id = get_user_tenant_id() AND 
  (get_current_user_role() = 'business_admin' OR created_by_user_id = auth.uid())
);