-- Create ENUM types first
CREATE TYPE public.user_role AS ENUM ('business_admin', 'contractor');
CREATE TYPE public.customer_type AS ENUM ('residential', 'commercial');
CREATE TYPE public.job_status AS ENUM ('scheduled', 'in_progress', 'completed', 'cancelled');
CREATE TYPE public.job_priority AS ENUM ('low', 'medium', 'high', 'urgent');
CREATE TYPE public.job_service_type AS ENUM ('plumbing', 'electrical', 'hvac', 'cleaning', 'landscaping', 'general_maintenance', 'other');
CREATE TYPE public.quote_status AS ENUM ('draft', 'sent', 'accepted', 'declined', 'expired');
CREATE TYPE public.invoice_status AS ENUM ('draft', 'sent', 'paid', 'overdue', 'cancelled');

-- Create profiles table
CREATE TABLE public.profiles (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NULL,
    full_name text NULL,
    email text UNIQUE NULL,
    role user_role NOT NULL,
    parent_admin_id uuid NULL,
    avatar_url text NULL,

    CONSTRAINT profiles_pkey PRIMARY KEY (id),
    CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE,
    CONSTRAINT profiles_parent_admin_id_fkey FOREIGN KEY (parent_admin_id) REFERENCES public.profiles(id) ON DELETE CASCADE
);

-- Create customers table
CREATE TABLE public.customers (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NULL,
    tenant_id uuid NOT NULL,
    created_by_user_id uuid NOT NULL,
    name text NOT NULL,
    email text NULL,
    phone text NOT NULL,
    address jsonb NULL,
    customer_type customer_type NOT NULL DEFAULT 'residential',
    notes text NULL,
    total_jobs_count integer DEFAULT 0,
    total_revenue_billed numeric(10, 2) DEFAULT 0.00,

    CONSTRAINT customers_pkey PRIMARY KEY (id),
    CONSTRAINT customers_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.profiles(id) ON DELETE CASCADE,
    CONSTRAINT customers_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.profiles(id) ON DELETE SET NULL
);

-- Create services table
CREATE TABLE public.services (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NULL,
    tenant_id uuid NOT NULL,
    created_by_user_id uuid NOT NULL,
    name text NOT NULL,
    description text NULL,
    unit_type text NOT NULL DEFAULT 'item',
    price_per_unit numeric(10, 2) NOT NULL,
    category text NULL,

    CONSTRAINT services_pkey PRIMARY KEY (id),
    CONSTRAINT services_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.profiles(id) ON DELETE CASCADE,
    CONSTRAINT services_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.profiles(id) ON DELETE SET NULL
);

-- Create jobs table
CREATE TABLE public.jobs (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NULL,
    tenant_id uuid NOT NULL,
    created_by_user_id uuid NOT NULL,
    title text NOT NULL,
    customer_id uuid NOT NULL,
    customer_name text NOT NULL,
    status job_status NOT NULL DEFAULT 'scheduled',
    priority job_priority NOT NULL DEFAULT 'medium',
    scheduled_date date NOT NULL,
    scheduled_time text NULL,
    estimated_duration numeric(5, 2) NULL,
    assigned_to_user_id uuid NULL,
    service_type job_service_type NOT NULL DEFAULT 'general_maintenance',
    description text NULL,
    estimated_cost numeric(10, 2) NULL,
    actual_cost numeric(10, 2) NULL,
    materials_needed jsonb NULL,
    completion_notes text NULL,

    CONSTRAINT jobs_pkey PRIMARY KEY (id),
    CONSTRAINT jobs_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.profiles(id) ON DELETE CASCADE,
    CONSTRAINT jobs_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.profiles(id) ON DELETE SET NULL,
    CONSTRAINT jobs_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE,
    CONSTRAINT jobs_assigned_to_user_id_fkey FOREIGN KEY (assigned_to_user_id) REFERENCES public.profiles(id) ON DELETE SET NULL
);

-- Create quotes table
CREATE TABLE public.quotes (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NULL,
    tenant_id uuid NOT NULL,
    created_by_user_id uuid NOT NULL,
    quote_number text NOT NULL UNIQUE,
    customer_id uuid NOT NULL,
    customer_name text NOT NULL,
    title text NOT NULL,
    status quote_status NOT NULL DEFAULT 'draft',
    valid_until date NULL,
    sent_date timestamptz NULL,
    line_items jsonb NOT NULL,
    subtotal numeric(10, 2) NOT NULL,
    tax_rate numeric(5, 4) NOT NULL DEFAULT 0.0875,
    tax_amount numeric(10, 2) NOT NULL,
    total_amount numeric(10, 2) NOT NULL,
    notes text NULL,
    terms text NOT NULL DEFAULT 'Payment due within 30 days of acceptance',

    CONSTRAINT quotes_pkey PRIMARY KEY (id),
    CONSTRAINT quotes_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.profiles(id) ON DELETE CASCADE,
    CONSTRAINT quotes_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.profiles(id) ON DELETE SET NULL,
    CONSTRAINT quotes_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE
);

-- Create invoices table
CREATE TABLE public.invoices (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NULL,
    tenant_id uuid NOT NULL,
    created_by_user_id uuid NOT NULL,
    invoice_number text NOT NULL UNIQUE,
    customer_id uuid NOT NULL,
    customer_name text NOT NULL,
    job_id uuid NULL,
    status invoice_status NOT NULL DEFAULT 'draft',
    issue_date date NOT NULL,
    due_date date NOT NULL,
    sent_date timestamptz NULL,
    paid_date timestamptz NULL,
    line_items jsonb NOT NULL,
    subtotal numeric(10, 2) NOT NULL,
    tax_rate numeric(5, 4) NOT NULL DEFAULT 0.0875,
    tax_amount numeric(10, 2) NOT NULL,
    total_amount numeric(10, 2) NOT NULL,
    payment_terms text NOT NULL DEFAULT 'Net 30',
    notes text NULL,
    payment_instructions text NULL,
    paypal_me_link text NULL,
    venmo_handle text NULL,

    CONSTRAINT invoices_pkey PRIMARY KEY (id),
    CONSTRAINT invoices_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.profiles(id) ON DELETE CASCADE,
    CONSTRAINT invoices_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.profiles(id) ON DELETE SET NULL,
    CONSTRAINT invoices_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE,
    CONSTRAINT invoices_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE SET NULL
);

-- Create settings table
CREATE TABLE public.settings (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NULL,
    tenant_id uuid NOT NULL UNIQUE,
    created_by_user_id uuid NOT NULL,
    business_name text NULL,
    logo_url text NULL,
    brand_color text NULL,
    business_address jsonb NULL,
    business_phone text NULL,
    business_email text NULL,
    business_website text NULL,
    tax_settings jsonb NULL,
    invoice_settings jsonb NULL,
    payment_settings jsonb NULL,
    service_settings jsonb NULL,
    business_hours jsonb NULL,
    notification_settings jsonb NULL,
    user_preferences jsonb NULL,
    system_settings jsonb NULL,

    CONSTRAINT settings_pkey PRIMARY KEY (id),
    CONSTRAINT settings_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.profiles(id) ON DELETE CASCADE,
    CONSTRAINT settings_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.profiles(id) ON DELETE SET NULL
);

-- Create function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, role)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name', NEW.email, 'business_admin');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for new user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Create function to handle user updates
CREATE OR REPLACE FUNCTION public.handle_user_update()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.profiles
  SET full_name = NEW.raw_user_meta_data->>'full_name', email = NEW.email
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for user updates
CREATE TRIGGER on_auth_user_updated
  AFTER UPDATE ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_user_update();

-- Create function to get user tenant ID for RLS
CREATE OR REPLACE FUNCTION public.get_user_tenant_id()
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  _user_id uuid := auth.uid();
  _user_profile public.profiles;
BEGIN
  SELECT * INTO _user_profile FROM public.profiles WHERE id = _user_id;
  IF _user_profile.role = 'business_admin' THEN
    RETURN _user_profile.id;
  ELSE -- contractor
    RETURN _user_profile.parent_admin_id;
  END IF;
END;
$$;

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies for profiles
CREATE POLICY "Allow authenticated users to read own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Allow authenticated users to update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Allow business admins to read their contractors" ON public.profiles FOR SELECT USING (
  auth.uid() = parent_admin_id OR (
    SELECT role FROM public.profiles WHERE id = auth.uid()
  ) = 'business_admin' AND parent_admin_id = auth.uid()
);

-- RLS Policies for customers
CREATE POLICY "Enable access for users within their tenant" ON public.customers FOR SELECT USING (tenant_id = public.get_user_tenant_id());
CREATE POLICY "Allow authenticated users to insert within their tenant" ON public.customers FOR INSERT WITH CHECK (tenant_id = public.get_user_tenant_id());
CREATE POLICY "Allow authenticated users to update within their tenant" ON public.customers FOR UPDATE USING (tenant_id = public.get_user_tenant_id());
CREATE POLICY "Allow authenticated users to delete within their tenant" ON public.customers FOR DELETE USING (tenant_id = public.get_user_tenant_id());

-- RLS Policies for services
CREATE POLICY "Enable access for users within their tenant" ON public.services FOR SELECT USING (tenant_id = public.get_user_tenant_id());
CREATE POLICY "Allow authenticated users to insert within their tenant" ON public.services FOR INSERT WITH CHECK (tenant_id = public.get_user_tenant_id());
CREATE POLICY "Allow authenticated users to update within their tenant" ON public.services FOR UPDATE USING (tenant_id = public.get_user_tenant_id());
CREATE POLICY "Allow authenticated users to delete within their tenant" ON public.services FOR DELETE USING (tenant_id = public.get_user_tenant_id());

-- RLS Policies for jobs
CREATE POLICY "Enable access for users within their tenant" ON public.jobs FOR SELECT USING (
  tenant_id = public.get_user_tenant_id() AND (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'business_admin' OR
    assigned_to_user_id = auth.uid() OR
    created_by_user_id = auth.uid()
  )
);
CREATE POLICY "Allow authenticated users to insert within their tenant" ON public.jobs FOR INSERT WITH CHECK (tenant_id = public.get_user_tenant_id());
CREATE POLICY "Allow authenticated users to update within their tenant" ON public.jobs FOR UPDATE USING (
  tenant_id = public.get_user_tenant_id() AND (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'business_admin' OR
    assigned_to_user_id = auth.uid() OR
    created_by_user_id = auth.uid()
  )
);
CREATE POLICY "Allow authenticated users to delete within their tenant" ON public.jobs FOR DELETE USING (tenant_id = public.get_user_tenant_id());

-- RLS Policies for quotes
CREATE POLICY "Enable access for users within their tenant" ON public.quotes FOR SELECT USING (tenant_id = public.get_user_tenant_id());
CREATE POLICY "Allow authenticated users to insert within their tenant" ON public.quotes FOR INSERT WITH CHECK (tenant_id = public.get_user_tenant_id());
CREATE POLICY "Allow authenticated users to update within their tenant" ON public.quotes FOR UPDATE USING (tenant_id = public.get_user_tenant_id());
CREATE POLICY "Allow authenticated users to delete within their tenant" ON public.quotes FOR DELETE USING (tenant_id = public.get_user_tenant_id());

-- RLS Policies for invoices
CREATE POLICY "Enable access for users within their tenant" ON public.invoices FOR SELECT USING (tenant_id = public.get_user_tenant_id());
CREATE POLICY "Allow authenticated users to insert within their tenant" ON public.invoices FOR INSERT WITH CHECK (tenant_id = public.get_user_tenant_id());
CREATE POLICY "Allow authenticated users to update within their tenant" ON public.invoices FOR UPDATE USING (tenant_id = public.get_user_tenant_id());
CREATE POLICY "Allow authenticated users to delete within their tenant" ON public.invoices FOR DELETE USING (tenant_id = public.get_user_tenant_id());

-- RLS Policies for settings
CREATE POLICY "Enable access for users within their tenant" ON public.settings FOR SELECT USING (tenant_id = public.get_user_tenant_id());
CREATE POLICY "Allow authenticated users to insert within their tenant" ON public.settings FOR INSERT WITH CHECK (tenant_id = public.get_user_tenant_id());
CREATE POLICY "Allow authenticated users to update within their tenant" ON public.settings FOR UPDATE USING (tenant_id = public.get_user_tenant_id());
CREATE POLICY "Allow authenticated users to delete within their tenant" ON public.settings FOR DELETE USING (tenant_id = public.get_user_tenant_id());

-- Create triggers for updated_at timestamps
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_services_updated_at BEFORE UPDATE ON public.services FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_jobs_updated_at BEFORE UPDATE ON public.jobs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_quotes_updated_at BEFORE UPDATE ON public.quotes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_invoices_updated_at BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_settings_updated_at BEFORE UPDATE ON public.settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();