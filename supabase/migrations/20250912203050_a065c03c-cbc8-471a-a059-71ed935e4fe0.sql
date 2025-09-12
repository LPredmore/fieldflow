-- Add complete_date column to jobs table
ALTER TABLE public.jobs 
ADD COLUMN complete_date date;