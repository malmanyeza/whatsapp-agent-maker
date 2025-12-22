-- Create an index to speed up conversation history retrieval
-- This is critical for the "Context" query: .eq('chatbot_id', ...).eq('whatsapp_user_phone', ...).order('created_at')

CREATE INDEX IF NOT EXISTS idx_messages_context 
ON public.messages (chatbot_id, whatsapp_user_phone, created_at DESC);

-- Also index just created_at for general cleanup/sorting if needed
CREATE INDEX IF NOT EXISTS idx_messages_created_at 
ON public.messages (created_at DESC);
