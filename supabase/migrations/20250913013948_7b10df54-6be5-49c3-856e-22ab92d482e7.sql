-- Add share_token field to invoices table for public sharing
ALTER TABLE public.invoices 
ADD COLUMN share_token text;

-- Add RLS policy for public access to invoices via share_token
CREATE POLICY "Allow public read access via share_token" 
ON public.invoices 
FOR SELECT 
USING (share_token IS NOT NULL);