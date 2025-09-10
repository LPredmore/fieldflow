-- Add text_color column to settings table
ALTER TABLE public.settings 
ADD COLUMN text_color TEXT DEFAULT '#FFFFFF';

-- Update existing records to have a default text color
UPDATE public.settings 
SET text_color = '#FFFFFF' 
WHERE text_color IS NULL;