
import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
    const { url, method } = req;

    if (method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const supabaseClient = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        );

        if (method === "GET") {
            // Verification request
            const urlParams = new URL(url).searchParams;
            const mode = urlParams.get("hub.mode");
            const token = urlParams.get("hub.verify_token");
            const challenge = urlParams.get("hub.challenge");

            if (mode === "subscribe" && token === "vibecode") {
                console.log("WEBHOOK_VERIFIED");
                return new Response(challenge, { status: 200, headers: corsHeaders });
            } else {
                return new Response("Forbidden", { status: 403, headers: corsHeaders });
            }
        }

        if (method === "POST") {
            const body = await req.json();
            console.log("Received POST request:", JSON.stringify(body));

            const entries = body.entry;
            if (!entries || entries.length === 0) {
                return new Response("No entries found", { status: 200, headers: corsHeaders });
            }

            for (const entry of entries) {
                const changes = entry.changes;
                if (!changes || changes.length === 0) continue;

                for (const change of changes) {
                    const value = change.value;
                    if (!value || !value.messages) continue;

                    const messages = value.messages;
                    const metadata = value.metadata;
                    const phoneNumberId = metadata?.phone_number_id;

                    if (!phoneNumberId) {
                        console.error("No phone number ID found in metadata");
                        continue;
                    }

                    // Find chatbot by metadata.phone_number_id 
                    // In database it is chatbots.whatsapp_phone_number_id
                    const { data: chatbot, error: chatbotError } = await supabaseClient
                        .from("chatbots")
                        .select("*")
                        .eq("whatsapp_phone_number_id", phoneNumberId)
                        .single();

                    if (chatbotError || !chatbot) {
                        console.error("Chatbot not found for phone ID:", phoneNumberId, chatbotError);
                        // Log error if possible without chatbot ID, or generic log
                        await supabaseClient.from("error_logs").insert({
                            chatbot_id: "unknown", // Or handle gracefully if foreign key requires existence
                            error_type: "configuration_error",
                            error_message: `Chatbot not found for phone ID: ${phoneNumberId}`,
                            context: { metadata }
                        });
                        continue;
                    }

                    const chatbotId = chatbot.id;

                    for (const message of messages) {
                        // Log incoming message
                        await supabaseClient.from("messages").insert({
                            chatbot_id: chatbotId,
                            content: message.type === 'text' ? message.text.body : '[Media Message]',
                            direction: 'incoming',
                            status: 'received',
                            whatsapp_user_phone: message.from
                        });

                        if (message.type === "text") {
                            const userMessage = message.text.body;

                            // Call OpenAI
                            const openAiKey = chatbot.openai_api_key;
                            const systemInstructions = chatbot.system_instructions;

                            if (!openAiKey) {
                                console.error("No OpenAI API Key for chatbot:", chatbotId);
                                await supabaseClient.from("error_logs").insert({
                                    chatbot_id: chatbotId,
                                    error_type: "configuration_error",
                                    error_message: "No OpenAI API Key configured",
                                });
                                continue;
                            }

                            // Simple OpenAI completion (Chat)
                            const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
                                method: "POST",
                                headers: {
                                    "Content-Type": "application/json",
                                    "Authorization": `Bearer ${openAiKey}`,
                                },
                                body: JSON.stringify({
                                    model: chatbot.model || "gpt-4o",
                                    messages: [
                                        { role: "system", content: systemInstructions || "You are a helpful assistant." },
                                        { role: "user", content: userMessage }
                                    ],
                                }),
                            });

                            const aiData = await aiResponse.json();

                            if (aiData.error) {
                                console.error("OpenAI Error:", aiData.error);
                                await supabaseClient.from("error_logs").insert({
                                    chatbot_id: chatbotId,
                                    error_type: "openai_api_error",
                                    error_message: JSON.stringify(aiData.error),
                                    context: { userMessage }
                                });
                                continue;
                            }

                            const aiReply = aiData.choices?.[0]?.message?.content;

                            if (aiReply) {
                                // Send response back to WhatsApp
                                const whatsappToken = chatbot.access_token; // Assuming access_token is the Graph API token

                                if (!whatsappToken) {
                                    console.error("No WhatsApp Access Token");
                                    continue;
                                }

                                const sendResponse = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
                                    method: "POST",
                                    headers: {
                                        "Content-Type": "application/json",
                                        "Authorization": `Bearer ${whatsappToken}`
                                    },
                                    body: JSON.stringify({
                                        messaging_product: "whatsapp",
                                        to: message.from,
                                        text: { body: aiReply }
                                    })
                                });

                                const sendData = await sendResponse.json();
                                if (sendData.error) {
                                    console.error("WhatsApp Send Error:", sendData.error);
                                    await supabaseClient.from("error_logs").insert({
                                        chatbot_id: chatbotId,
                                        error_type: "whatsapp_api_error",
                                        error_message: JSON.stringify(sendData.error),
                                        context: { aiReply }
                                    });
                                } else {
                                    // Log outgoing message
                                    await supabaseClient.from("messages").insert({
                                        chatbot_id: chatbotId,
                                        content: aiReply,
                                        direction: 'outgoing',
                                        status: 'sent',
                                        whatsapp_user_phone: message.from
                                    });
                                }
                            }
                        }
                    }
                }
            }

            return new Response("OK", { status: 200, headers: corsHeaders });
        }

        return new Response("Method not allowed", { status: 405, headers: corsHeaders });

    } catch (error) {
        console.error("Internal Server Error:", error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});
