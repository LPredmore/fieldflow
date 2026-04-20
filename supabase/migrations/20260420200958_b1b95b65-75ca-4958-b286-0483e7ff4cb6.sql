-- 1. Column to track client who submitted a service request
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS requested_by_client_user_id uuid;

-- 2. Helper: check if a customer_id belongs to the current client user
CREATE OR REPLACE FUNCTION public.is_customer_owned_by_client(_customer_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.customers
    WHERE id = _customer_id
      AND client_user_id = auth.uid()
  );
$$;

-- 3. Quotes — client policies
CREATE POLICY "Clients can view their own quotes"
ON public.quotes
FOR SELECT
TO authenticated
USING (public.is_customer_owned_by_client(customer_id));

CREATE POLICY "Clients can submit service requests"
ON public.quotes
FOR INSERT
TO authenticated
WITH CHECK (
  status = 'requested'::quote_status
  AND requested_by_client_user_id = auth.uid()
  AND public.is_customer_owned_by_client(customer_id)
);

CREATE POLICY "Clients can accept or decline their sent quotes"
ON public.quotes
FOR UPDATE
TO authenticated
USING (
  public.is_customer_owned_by_client(customer_id)
  AND status = 'sent'::quote_status
)
WITH CHECK (
  public.is_customer_owned_by_client(customer_id)
  AND status IN ('accepted'::quote_status, 'declined'::quote_status)
);

-- 4. Job series — client read access
CREATE POLICY "Clients can view their own job series"
ON public.job_series
FOR SELECT
TO authenticated
USING (public.is_customer_owned_by_client(customer_id));

-- 5. Job occurrences — client read access
CREATE POLICY "Clients can view their own job occurrences"
ON public.job_occurrences
FOR SELECT
TO authenticated
USING (public.is_customer_owned_by_client(customer_id));

-- 6. Job files — client read access
CREATE POLICY "Clients can view files on their own jobs"
ON public.job_files
FOR SELECT
TO authenticated
USING (
  (entity_type = 'job_series'::file_entity_type AND EXISTS (
    SELECT 1 FROM public.job_series js
    WHERE js.id = job_files.entity_id
      AND public.is_customer_owned_by_client(js.customer_id)
  ))
  OR (entity_type = 'job_occurrence'::file_entity_type AND EXISTS (
    SELECT 1 FROM public.job_occurrences jo
    WHERE jo.id = job_files.entity_id
      AND public.is_customer_owned_by_client(jo.customer_id)
  ))
  OR (entity_type = 'quote'::file_entity_type AND EXISTS (
    SELECT 1 FROM public.quotes q
    WHERE q.id = job_files.entity_id
      AND public.is_customer_owned_by_client(q.customer_id)
  ))
  OR (entity_type = 'invoice'::file_entity_type AND EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = job_files.entity_id
      AND public.is_customer_owned_by_client(i.customer_id)
  ))
);