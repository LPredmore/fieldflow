-- Add is_emergency column to quotes table
ALTER TABLE public.quotes 
ADD COLUMN is_emergency BOOLEAN NOT NULL DEFAULT false;