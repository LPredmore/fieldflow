-- Add estimated date fields to quotes table
ALTER TABLE public.quotes 
ADD COLUMN estimated_start_date DATE,
ADD COLUMN estimated_completion_date DATE;