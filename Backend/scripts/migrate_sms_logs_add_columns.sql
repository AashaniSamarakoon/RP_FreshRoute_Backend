-- Migrate existing sms_logs table to add new columns
-- This adds the missing columns without losing existing data

-- Add missing columns to sms_logs table
ALTER TABLE public.sms_logs
  ADD COLUMN IF NOT EXISTS message_type text DEFAULT 'forecast'::text,
  ADD COLUMN IF NOT EXISTS message text,
  ADD COLUMN IF NOT EXISTS retry_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();

-- Add message_type constraint if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE table_name = 'sms_logs' AND constraint_name = 'sms_logs_message_type_check'
  ) THEN
    ALTER TABLE public.sms_logs
      ADD CONSTRAINT sms_logs_message_type_check CHECK (
        message_type = ANY (ARRAY['forecast'::text, 'price_update'::text, 'alert'::text])
      );
  END IF;
END $$;

-- Add missing indexes
CREATE INDEX IF NOT EXISTS idx_sms_logs_status ON public.sms_logs USING btree (status) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_sms_logs_message_type ON public.sms_logs USING btree (message_type) TABLESPACE pg_default;

-- Update existing rows to have default values
UPDATE public.sms_logs 
  SET message_type = 'forecast'::text 
  WHERE message_type IS NULL;

UPDATE public.sms_logs 
  SET retry_count = 0 
  WHERE retry_count IS NULL;

UPDATE public.sms_logs 
  SET created_at = sent_at 
  WHERE created_at IS NULL;

UPDATE public.sms_logs 
  SET updated_at = now() 
  WHERE updated_at IS NULL;

-- Make message_type NOT NULL after setting defaults
ALTER TABLE public.sms_logs
  ALTER COLUMN message_type SET NOT NULL;

ALTER TABLE public.sms_logs
  ALTER COLUMN retry_count SET NOT NULL;

ALTER TABLE public.sms_logs
  ALTER COLUMN created_at SET NOT NULL;

ALTER TABLE public.sms_logs
  ALTER COLUMN updated_at SET NOT NULL;
