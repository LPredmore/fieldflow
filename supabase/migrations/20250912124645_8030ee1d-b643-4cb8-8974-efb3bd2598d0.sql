-- Fix foreign key constraint name to match Supabase convention
ALTER TABLE customers DROP CONSTRAINT fk_assigned_user_profiles;
ALTER TABLE customers 
ADD CONSTRAINT customers_assigned_to_user_id_fkey 
FOREIGN KEY (assigned_to_user_id) REFERENCES profiles(id);

-- Fix INSERT policy to allow admins to assign to any contractor
DROP POLICY IF EXISTS "Allow authenticated users to insert within their tenant" ON customers;
CREATE POLICY "Allow authenticated users to insert within their tenant" ON customers
FOR INSERT WITH CHECK (
  tenant_id = get_user_tenant_id() AND
  (
    -- Admins can assign to anyone in their tenant
    (get_current_user_role() = 'business_admin'::user_role) OR
    -- Contractors can only assign to themselves
    (get_current_user_role() = 'contractor'::user_role AND assigned_to_user_id = auth.uid())
  )
);