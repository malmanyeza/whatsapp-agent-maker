-- Add customer service contacts column to chatbots table
ALTER TABLE public.chatbots ADD COLUMN IF NOT EXISTS customer_service_contacts JSONB DEFAULT '[]';

-- Comment for documentation
COMMENT ON COLUMN public.chatbots.customer_service_contacts IS 'Array of customer service team members, format: [{"name": "John", "phone": "263771234567"}, ...]';
