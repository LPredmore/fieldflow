-- Update RLS policy for quotes to allow contractors to see only their own quotes
DROP POLICY IF EXISTS "Enable access for users within their tenant" ON public.quotes;

-- Create separate policies for admins and contractors
CREATE POLICY "Admins can view all quotes within tenant" 
ON public.quotes 
FOR SELECT 
USING (
  (tenant_id = get_user_tenant_id()) AND 
  (get_current_user_role() = 'business_admin'::user_role)
);

CREATE POLICY "Contractors can view their own quotes" 
ON public.quotes 
FOR SELECT 
USING (
  (tenant_id = get_user_tenant_id()) AND 
  (get_current_user_role() = 'contractor'::user_role) AND 
  (created_by_user_id = auth.uid())
);