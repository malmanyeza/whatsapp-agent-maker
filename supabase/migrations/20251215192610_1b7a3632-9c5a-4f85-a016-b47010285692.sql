-- Create messages table to track all messages sent/received
CREATE TABLE public.messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  chatbot_id UUID NOT NULL REFERENCES public.chatbots(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  content TEXT NOT NULL,
  whatsapp_user_phone TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'failed')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create error_logs table to track all errors
CREATE TABLE public.error_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  chatbot_id UUID NOT NULL REFERENCES public.chatbots(id) ON DELETE CASCADE,
  error_type TEXT NOT NULL,
  error_message TEXT NOT NULL,
  context JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;

-- RLS policies for messages (users can only see messages for their chatbots)
CREATE POLICY "Users can view messages for their chatbots"
ON public.messages FOR SELECT
USING (chatbot_id IN (SELECT id FROM public.chatbots WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert messages for their chatbots"
ON public.messages FOR INSERT
WITH CHECK (chatbot_id IN (SELECT id FROM public.chatbots WHERE user_id = auth.uid()));

-- RLS policies for error_logs
CREATE POLICY "Users can view error logs for their chatbots"
ON public.error_logs FOR SELECT
USING (chatbot_id IN (SELECT id FROM public.chatbots WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert error logs for their chatbots"
ON public.error_logs FOR INSERT
WITH CHECK (chatbot_id IN (SELECT id FROM public.chatbots WHERE user_id = auth.uid()));

-- Create indexes for performance
CREATE INDEX idx_messages_chatbot_id ON public.messages(chatbot_id);
CREATE INDEX idx_messages_created_at ON public.messages(created_at DESC);
CREATE INDEX idx_error_logs_chatbot_id ON public.error_logs(chatbot_id);
CREATE INDEX idx_error_logs_created_at ON public.error_logs(created_at DESC);