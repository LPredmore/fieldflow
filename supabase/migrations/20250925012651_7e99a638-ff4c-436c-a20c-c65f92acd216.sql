-- Add customer_name column to job_occurrences table
ALTER TABLE public.job_occurrences 
ADD COLUMN customer_name text;

-- Populate customer_name from customers table using customer_id
UPDATE public.job_occurrences 
SET customer_name = customers.name
FROM public.customers 
WHERE job_occurrences.customer_id = customers.id;

-- Make customer_name NOT NULL with default empty string for future records
ALTER TABLE public.job_occurrences 
ALTER COLUMN customer_name SET NOT NULL,
ALTER COLUMN customer_name SET DEFAULT '';