-- Create conversations table to track chat sessions
CREATE TABLE public.conversations (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    chatbot_id UUID NOT NULL REFERENCES public.chatbots(id) ON DELETE CASCADE,
    customer_phone TEXT NOT NULL,
    customer_name TEXT,
    status TEXT NOT NULL DEFAULT 'bot' CHECK (status IN ('bot', 'human', 'resolved')),
    assigned_agent_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    last_message_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    CONSTRAINT conversations_pkey PRIMARY KEY (id),
    CONSTRAINT conversations_unique_active UNIQUE (chatbot_id, customer_phone, status) 
        WHERE status != 'resolved'
);

-- Create index for fast lookups
CREATE INDEX idx_conversations_chatbot_status ON public.conversations(chatbot_id, status);
CREATE INDEX idx_conversations_phone ON public.conversations(customer_phone);
CREATE INDEX idx_conversations_last_message ON public.conversations(last_message_at DESC);

-- Enable RLS
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can see conversations for chatbots they own
CREATE POLICY "Users can view their chatbot conversations"
    ON public.conversations FOR SELECT
    USING (
        chatbot_id IN (
            SELECT id FROM public.chatbots WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update their chatbot conversations"
    ON public.conversations FOR UPDATE
    USING (
        chatbot_id IN (
            SELECT id FROM public.chatbots WHERE user_id = auth.uid()
        )
    );

-- Allow server (service role) to insert/update conversations
CREATE POLICY "Service role can manage all conversations"
    ON public.conversations FOR ALL
    USING (auth.role() = 'service_role');

-- Add conversation_id to messages table for linking
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL;

-- Create index for message lookups by conversation
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON public.messages(conversation_id, created_at DESC);
