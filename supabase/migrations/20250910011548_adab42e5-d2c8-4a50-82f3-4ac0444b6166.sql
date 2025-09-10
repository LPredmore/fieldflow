-- Add share_token column to quotes table for public access
ALTER TABLE public.quotes 
ADD COLUMN share_token TEXT UNIQUE;

-- Create index for share_token lookups
CREATE INDEX idx_quotes_share_token ON public.quotes(share_token);

-- Create quote_responses table to track customer interactions
CREATE TABLE public.quote_responses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  quote_id UUID NOT NULL,
  response_type TEXT NOT NULL CHECK (response_type IN ('viewed', 'accepted', 'declined')),
  customer_email TEXT,
  customer_comments TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for quote_responses lookups
CREATE INDEX idx_quote_responses_quote_id ON public.quote_responses(quote_id);

-- Add RLS policy for public quote access via share_token
CREATE POLICY "Allow public read access via share_token" 
ON public.quotes 
FOR SELECT 
USING (share_token IS NOT NULL);

-- Add RLS policy for quote_responses (public can insert, authenticated users can read)
ALTER TABLE public.quote_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public insert on quote_responses" 
ON public.quote_responses 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Allow authenticated read on quote_responses" 
ON public.quote_responses 
FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM public.quotes 
  WHERE quotes.id = quote_responses.quote_id 
  AND quotes.tenant_id = get_user_tenant_id()
));

-- Function to generate secure share tokens
CREATE OR REPLACE FUNCTION generate_quote_share_token()
RETURNS TEXT AS $$
BEGIN
  RETURN encode(gen_random_bytes(32), 'base64url');
END;
$$ LANGUAGE plpgsql;