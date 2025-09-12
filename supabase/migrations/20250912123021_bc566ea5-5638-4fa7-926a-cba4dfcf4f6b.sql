-- Add assigned_to_user_id column to customers table
ALTER TABLE customers ADD COLUMN assigned_to_user_id uuid;

-- Set existing customers to be assigned to their creators
UPDATE customers SET assigned_to_user_id = created_by_user_id WHERE assigned_to_user_id IS NULL;

-- Add constraint to ensure assigned user is valid and within same tenant
ALTER TABLE customers 
ADD CONSTRAINT fk_assigned_user_profiles 
FOREIGN KEY (assigned_to_user_id) REFERENCES profiles(id);

-- Update RLS policies for proper admin/contractor visibility
DROP POLICY IF EXISTS "Enable access for users within their tenant" ON customers;

-- New SELECT policy: Admins see all customers, contractors only see assigned customers
CREATE POLICY "Admins can view all customers within tenant" ON customers
FOR SELECT USING (
  tenant_id = get_user_tenant_id() AND 
  get_current_user_role() = 'business_admin'::user_role
);

CREATE POLICY "Contractors can view assigned customers" ON customers
FOR SELECT USING (
  assigned_to_user_id = auth.uid() AND 
  get_current_user_role() = 'contractor'::user_role
);

-- Update INSERT policy to auto-assign to creator
DROP POLICY IF EXISTS "Allow authenticated users to insert within their tenant" ON customers;
CREATE POLICY "Allow authenticated users to insert within their tenant" ON customers
FOR INSERT WITH CHECK (
  tenant_id = get_user_tenant_id() AND
  assigned_to_user_id = auth.uid()
);

-- Update UPDATE policy to allow assignment changes by admins
DROP POLICY IF EXISTS "Allow authenticated users to update within their tenant" ON customers;
CREATE POLICY "Admins can update any customer within tenant" ON customers
FOR UPDATE USING (
  tenant_id = get_user_tenant_id() AND 
  get_current_user_role() = 'business_admin'::user_role
);

CREATE POLICY "Contractors can update assigned customers" ON customers
FOR UPDATE USING (
  assigned_to_user_id = auth.uid() AND 
  get_current_user_role() = 'contractor'::user_role
);