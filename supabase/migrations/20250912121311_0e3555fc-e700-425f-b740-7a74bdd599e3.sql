-- Fix existing contractor with missing parent_admin_id
-- The contractor should have the admin as their parent
UPDATE profiles 
SET parent_admin_id = '7b369be5-679b-4750-8e33-6c95cb1f257c'
WHERE role = 'contractor' AND parent_admin_id IS NULL AND email = 'predmoreluke+zzz@gmail.com';

-- Add constraint to ensure contractors always have a parent_admin_id
ALTER TABLE profiles 
ADD CONSTRAINT check_contractor_parent_admin_id 
CHECK (
  (role = 'business_admin') OR 
  (role = 'contractor' AND parent_admin_id IS NOT NULL)
);