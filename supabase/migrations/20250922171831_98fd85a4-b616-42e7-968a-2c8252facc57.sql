-- Add time_zone column to settings table
ALTER TABLE public.settings 
ADD COLUMN time_zone text DEFAULT 'Eastern';

-- Update existing rows to have a default timezone
UPDATE public.settings 
SET time_zone = 'Eastern' 
WHERE time_zone IS NULL;