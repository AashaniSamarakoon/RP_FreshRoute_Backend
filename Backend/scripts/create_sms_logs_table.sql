-- Create SMS Logs Table for tracking all SMS sends
CREATE TABLE IF NOT EXISTS public.sms_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  farmer_id uuid NULL REFERENCES public.users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  phone text NOT NULL,
  message_type text NOT NULL DEFAULT 'forecast'::text,
  forecast_ids uuid[] NULL DEFAULT '{}',
  message text NULL,
  status text NOT NULL DEFAULT 'pending'::text,
  error_message text NULL,
  retry_count integer NOT NULL DEFAULT 0,
  sent_at timestamp with time zone NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT sms_logs_pkey PRIMARY KEY (id),
  CONSTRAINT sms_logs_status_check CHECK (
    (
      status = ANY (
        ARRAY['pending'::text, 'sent'::text, 'failed'::text]
      )
    )
  ),
  CONSTRAINT sms_logs_message_type_check CHECK (
    (
      message_type = ANY (
        ARRAY['forecast'::text, 'price_update'::text, 'alert'::text]
      )
    )
  )
) TABLESPACE pg_default;

-- Create indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_sms_logs_farmer ON public.sms_logs USING btree (farmer_id) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_sms_logs_recent ON public.sms_logs USING btree (sent_at DESC) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_sms_logs_status ON public.sms_logs USING btree (status) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_sms_logs_message_type ON public.sms_logs USING btree (message_type) TABLESPACE pg_default;
