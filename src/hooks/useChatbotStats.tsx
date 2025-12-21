import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface ChatbotStats {
  messagesSent: number;
  messagesReceived: number;
  errorCount: number;
}

export const useChatbotStats = (chatbotId: string) => {
  return useQuery({
    queryKey: ["chatbot-stats", chatbotId],
    queryFn: async (): Promise<ChatbotStats> => {
      // Fetch message counts
      const { data: messages, error: messagesError } = await supabase
        .from("messages")
        .select("direction")
        .eq("chatbot_id", chatbotId);

      if (messagesError) {
        console.error("Error fetching messages:", messagesError);
      }

      // Fetch error count
      const { count: errorCount, error: errorsError } = await supabase
        .from("error_logs")
        .select("*", { count: "exact", head: true })
        .eq("chatbot_id", chatbotId);

      if (errorsError) {
        console.error("Error fetching error logs:", errorsError);
      }

      const messagesSent = messages?.filter((m) => m.direction === "outbound").length || 0;
      const messagesReceived = messages?.filter((m) => m.direction === "inbound").length || 0;

      return {
        messagesSent,
        messagesReceived,
        errorCount: errorCount || 0,
      };
    },
    staleTime: 30000, // Cache for 30 seconds
  });
};
