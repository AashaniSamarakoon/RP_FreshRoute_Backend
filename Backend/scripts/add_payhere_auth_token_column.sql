-- Run this in Supabase SQL Editor to add authorization token column
ALTER TABLE public.placed_orders
ADD COLUMN IF NOT EXISTS payhere_authorization_token text;

-- Also ensure payments table has the field used in upsert
ALTER TABLE public.payments
ADD COLUMN IF NOT EXISTS authorization_token text;
