-- Add External API configuration to Chatbots table
ALTER TABLE public.chatbots ADD COLUMN IF NOT EXISTS external_product_api_url TEXT;
ALTER TABLE public.chatbots ADD COLUMN IF NOT EXISTS external_product_api_key TEXT;
