-- Add taxable field to services table
ALTER TABLE public.services 
ADD COLUMN taxable boolean NOT NULL DEFAULT true;