-- Create user_permissions table
CREATE TABLE public.user_permissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  send_quotes BOOLEAN NOT NULL DEFAULT false,
  access_services BOOLEAN NOT NULL DEFAULT false,
  access_invoicing BOOLEAN NOT NULL DEFAULT false,
  supervisor BOOLEAN NOT NULL DEFAULT false,
  tenant_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- Enable Row Level Security
ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for user_permissions
CREATE POLICY "Users can view permissions within their tenant"
ON public.user_permissions
FOR SELECT
USING (tenant_id = get_user_tenant_id());

CREATE POLICY "Business admins can manage permissions within their tenant"
ON public.user_permissions
FOR ALL
USING (
  (tenant_id = get_user_tenant_id()) AND 
  (get_current_user_role() = 'business_admin'::user_role)
);

CREATE POLICY "Users can view their own permissions"
ON public.user_permissions
FOR SELECT
USING (user_id = auth.uid());

-- Create function to get user permissions safely
CREATE OR REPLACE FUNCTION public.get_user_permissions(target_user_id UUID)
RETURNS TABLE(
  send_quotes BOOLEAN,
  access_services BOOLEAN,
  access_invoicing BOOLEAN,
  supervisor BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    up.send_quotes,
    up.access_services,
    up.access_invoicing,
    up.supervisor
  FROM public.user_permissions up
  WHERE up.user_id = target_user_id;
  
  -- If no permissions found, return default (all false)
  IF NOT FOUND THEN
    RETURN QUERY
    SELECT false, false, false, false;
  END IF;
END;
$$;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_user_permissions_updated_at
BEFORE UPDATE ON public.user_permissions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default permissions for all existing users
INSERT INTO public.user_permissions (user_id, send_quotes, access_services, access_invoicing, supervisor, tenant_id)
SELECT 
  p.id,
  CASE 
    WHEN p.role = 'business_admin' THEN true
    ELSE false
  END as send_quotes,
  CASE 
    WHEN p.role = 'business_admin' THEN true
    ELSE false
  END as access_services,
  CASE 
    WHEN p.role = 'business_admin' THEN true
    ELSE false
  END as access_invoicing,
  CASE 
    WHEN p.role = 'business_admin' THEN true
    ELSE false
  END as supervisor,
  CASE 
    WHEN p.role = 'business_admin' THEN p.id
    ELSE p.parent_admin_id
  END as tenant_id
FROM public.profiles p
ON CONFLICT (user_id) DO NOTHING;