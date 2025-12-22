import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useToast } from "./use-toast";

export interface Chatbot {
  id: string;
  user_id: string;
  company_name: string;
  company_description: string;
  logo_url?: string;
  services_offered: string;
  whatsapp_phone_number_id: string;
  meta_app_id: string;
  meta_app_secret: string;
  access_token: string;
  openai_api_key: string;
  model: string;
  system_instructions: string;
  tone: string;
  allowed_actions: {
    answerQuestions: boolean;
    generateQuotations: boolean;
    collectLeads: boolean;
  };
  status: "connected" | "disconnected" | "pending";
  created_at: string;
  updated_at: string;
}

export interface CreateChatbotData {
  company_name: string;
  company_description: string;
  services_offered: string;
  whatsapp_phone_number_id: string;
  meta_app_id: string;
  meta_app_secret: string;
  access_token: string;
  openai_api_key: string;
  model: string;
  system_instructions: string;
  tone: string;
  allowed_actions: {
    answerQuestions: boolean;
    generateQuotations: boolean;
    collectLeads: boolean;
  };
}

export const useChatbots = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: chatbots = [], isLoading, error } = useQuery({
    queryKey: ["chatbots", user?.id],
    queryFn: async () => {
      if (!user) return [];

      const { data, error } = await supabase
        .from("chatbots")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as Chatbot[];
    },
    enabled: !!user,
  });

  const createChatbot = useMutation({
    mutationFn: async (chatbotData: CreateChatbotData) => {
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("chatbots")
        .insert({
          ...chatbotData,
          user_id: user.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chatbots"] });
      toast({
        title: "Chatbot created!",
        description: "Your AI assistant is ready to deploy.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error creating chatbot",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateChatbot = useMutation({
    mutationFn: async ({ id, ...chatbotData }: Partial<Chatbot> & { id: string }) => {
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("chatbots")
        .update(chatbotData)
        .eq("id", id)
        .eq("user_id", user.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chatbots"] });
      toast({
        title: "Chatbot updated!",
        description: "Your changes have been saved.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error updating chatbot",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteChatbot = useMutation({
    mutationFn: async (id: string) => {
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("chatbots")
        .delete()
        .eq("id", id)
        .eq("user_id", user.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chatbots"] });
      toast({
        title: "Chatbot deleted",
        description: "The chatbot has been removed.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error deleting chatbot",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const toggleChatbotStatus = useMutation({
    mutationFn: async ({ id, currentStatus }: { id: string; currentStatus: string }) => {
      if (!user) throw new Error("Not authenticated");

      const newStatus = currentStatus === "connected" ? "disconnected" : "connected";

      const { data, error } = await supabase
        .from("chatbots")
        .update({ status: newStatus })
        .eq("id", id)
        .eq("user_id", user.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["chatbots"] });
      toast({
        title: data.status === "connected" ? "Bot started!" : "Bot stopped",
        description: data.status === "connected"
          ? "Your chatbot is now active and listening for messages."
          : "Your chatbot has been paused.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error updating status",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const getChatbot = async (id: string) => {
    if (!user) return null;

    const { data, error } = await supabase
      .from("chatbots")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) throw error;
    return data as Chatbot | null;
  };

  return {
    chatbots,
    isLoading,
    error,
    createChatbot,
    updateChatbot,
    deleteChatbot,
    toggleChatbotStatus,
    getChatbot,
  };
};
