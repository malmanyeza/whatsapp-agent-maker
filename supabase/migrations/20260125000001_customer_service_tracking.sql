-- Customer Service Notification Tracking
-- This table tracks when notifications are sent to customer service team members
-- Used for round-robin/LRU selection to distribute workload evenly

CREATE TABLE IF NOT EXISTS public.customer_service_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chatbot_id UUID NOT NULL REFERENCES public.chatbots(id) ON DELETE CASCADE,
    agent_phone TEXT NOT NULL,
    agent_name TEXT,
    customer_phone TEXT NOT NULL,
    reason TEXT NOT NULL,
    urgency TEXT DEFAULT 'medium',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for finding least recently contacted agent efficiently
CREATE INDEX IF NOT EXISTS idx_cs_notifications_agent 
ON public.customer_service_notifications(chatbot_id, agent_phone, created_at DESC);

-- Index for looking up notifications by customer
CREATE INDEX IF NOT EXISTS idx_cs_notifications_customer 
ON public.customer_service_notifications(chatbot_id, customer_phone);

-- Enable RLS
ALTER TABLE public.customer_service_notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only see notifications for their own chatbots
CREATE POLICY "Users can view notifications for their chatbots"
ON public.customer_service_notifications
FOR SELECT
USING (
    chatbot_id IN (
        SELECT id FROM public.chatbots WHERE user_id = auth.uid()
    )
);

-- Comment for documentation
COMMENT ON TABLE public.customer_service_notifications IS 'Tracks notifications sent to customer service team members for round-robin distribution';
