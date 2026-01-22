
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';
import { generatePDFQuote } from './utils/pdfGenerator.js';
import FormData from 'form-data';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Supabase Configuration
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Static Files
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, 'dist')));

// --- Utility: Upload Buffer to Supabase Storage ---
async function uploadPDF(pdfBuffer, fileName) {
    const { data, error } = await supabase
        .storage
        .from('quotes')
        .upload(fileName, pdfBuffer, {
            contentType: 'application/pdf',
            upsert: true
        });

    if (error) throw error;

    const { data: { publicUrl } } = supabase.storage.from('quotes').getPublicUrl(fileName);
    return publicUrl;
}

// --- Utility: Get Products Tool Handler ---
// --- Utility: Get Products Tool Handler ---
// --- Utility: Get Products Tool Handler ---
async function handleGetProducts(chatbot) {
    // 1. External API (Priority)
    if (chatbot.external_product_api_url) {
        console.log(`[DEBUG] Fetching products from External API: ${chatbot.external_product_api_url}`);
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 5000); // 5s Timeout

            const headers = {};
            if (chatbot.external_product_api_key) {
                headers['Authorization'] = chatbot.external_product_api_key;
            }

            const response = await fetch(chatbot.external_product_api_url, {
                headers,
                signal: controller.signal
            });
            clearTimeout(timeout);

            if (!response.ok) throw new Error(`API returned ${response.status}`);

            const data = await response.json();
            console.log(`[DEBUG] External API success. Items: ${Array.isArray(data) ? data.length : 'Unknown'}`);
            return JSON.stringify(data);
        } catch (err) {
            console.error("[DEBUG] External Product API Failed (or timed out):", err.message);
            console.log("[DEBUG] Falling back to internal database...");
        }
    }

    // 2. Internal Database (Fallback / Default)
    console.log(`[DEBUG] Querying Supabase for products...`);
    const { data, error } = await supabase
        .from('products')
        .select('name, description, unit_price, currency')
        .eq('chatbot_id', chatbot.id);

    if (error) {
        console.error("[DEBUG] Supabase Product Look-up Error:", error);
        return "Error fetching products from database.";
    }

    if (!data || data.length === 0) {
        console.log("[DEBUG] No products found in DB.");
        return "No products found. Please ask the admin to check the product list.";
    }

    console.log(`[DEBUG] Found ${data.length} products in DB.`);
    return JSON.stringify(data.map(p => ({
        name: p.name,
        description: p.description,
        price: p.unit_price,
        currency: p.currency
    })));
}

// --- Utility: Generate Quote Tool Handler ---
async function handleGenerateQuote(args, chatbot, customerPhone) {
    // args: { items: [{ name, qty }], customerName }

    let total = 0;
    const cleanItems = args.items.map(item => {
        const t = (item.price || 0) * (item.qty || 0); // Safety check
        total += t;
        return {
            name: item.name,
            description: item.description || "",
            qty: item.qty,
            unit_price: item.price, // Map 'price' to 'unit_price' for PDF generator
            total: t
        };
    });

    // 2. Generate PDF
    const timestamp = new Date().toISOString().split('T')[0];
    const safeCompanyName = chatbot.company_name.replace(/[^a-zA-Z0-9]/g, '_');

    const pdfBuffer = await generatePDFQuote({
        company: {
            name: chatbot.company_name,
            description: chatbot.company_description,
            logo_url: chatbot.logo_url // Pass the logo URL
        },
        customer: {
            name: args.customerName || 'Valued Customer',
            phone: customerPhone
        },
        items: cleanItems,
        total: total,
        currencySymbol: chatbot.currency_symbol || '$'
    });

    // 3. Upload PDF
    const fileName = `${safeCompanyName}_Quote_${timestamp}_${Math.floor(Math.random() * 1000)}.pdf`;
    const pdfUrl = await uploadPDF(pdfBuffer, fileName);

    // 4. Save to DB
    await supabase.from('quotes').insert({
        chatbot_id: chatbot.id,
        customer_name: args.customerName,
        customer_phone: customerPhone, // Important for "Collect Leads"
        total_amount: total,
        pdf_url: pdfUrl,
        items: cleanItems
    });

    return pdfUrl;
}

// --- Utility: Find or Create Conversation ---
async function findOrCreateConversation(chatbotId, customerPhone) {
    // Look for an active (non-resolved) conversation
    const { data: existing, error: findError } = await supabase
        .from('conversations')
        .select('*')
        .eq('chatbot_id', chatbotId)
        .eq('customer_phone', customerPhone)
        .neq('status', 'resolved')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (findError) {
        console.error('[DEBUG] Error finding conversation:', findError);
    }

    if (existing) {
        // Update last_message_at
        await supabase
            .from('conversations')
            .update({ last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() })
            .eq('id', existing.id);
        return existing;
    }

    // Create new conversation
    const { data: newConvo, error: createError } = await supabase
        .from('conversations')
        .insert({
            chatbot_id: chatbotId,
            customer_phone: customerPhone,
            status: 'bot'
        })
        .select()
        .single();

    if (createError) {
        console.error('[DEBUG] Error creating conversation:', createError);
        return null;
    }

    console.log(`[DEBUG] Created new conversation: ${newConvo.id}`);
    return newConvo;
}

// --- Async Message Processor ---
async function processMessage(message, phoneNumberId, chatbot) {
    try {
        const userMessage = message.text.body;
        const senderPhone = message.from;
        const messageId = message.id; // Get Message ID

        console.log(`[DEBUG] Processing message from ${senderPhone}: "${userMessage}"`);

        // 0. Mark as Read (Blue Ticks) - UX Enhancement
        markMessageAsRead(phoneNumberId, chatbot.access_token, messageId);

        // 0.5 Find or create conversation
        const conversation = await findOrCreateConversation(chatbot.id, senderPhone);
        const conversationId = conversation?.id || null;

        // 1. Log Incoming to DB (with conversation_id)
        supabase.from('messages').insert({
            chatbot_id: chatbot.id,
            conversation_id: conversationId,
            content: userMessage,
            direction: 'incoming',
            status: 'received',
            whatsapp_user_phone: senderPhone
        }).then(({ error }) => {
            if (error) console.error("[DEBUG] Background Log Error:", error);
        });

        // 1.5 Check if conversation is being handled by a human agent
        if (conversation && conversation.status === 'human') {
            console.log(`[DEBUG] Conversation ${conversationId} is in HUMAN mode. Skipping AI.`);
            // Don't process with AI - human agent will handle via dashboard
            return;
        }

        // Context Construction
        const systemContext = `
You are a helpful AI assistant for ${chatbot.company_name}.
Company Description: ${chatbot.company_description}
Services/Products Offered: ${chatbot.services_offered}

Your goal is to answer customer questions professionally based on the above information.

IMPORTANT GUARDRAILS:
1. You represent ${chatbot.company_name} ONLY. Do not discuss other companies, general knowledge, sports, politics, or religion.
2. If a user asks about something unrelated to ${chatbot.company_name}'s products or services, politely decline and steer the conversation back to business.
3. Example refusal: "I'm sorry, I can only assist with ${chatbot.company_name} products. Would you like to know about our services?"
4. Never generate content that is racist, sexist, political, or offensive.

${chatbot.system_instructions || ""}
`;

        // 2. Fetch Conversation History (Await this as we need it)
        const { data: historyData } = await supabase
            .from('messages')
            .select('role:direction, content, created_at')
            .eq('chatbot_id', chatbot.id)
            .eq('whatsapp_user_phone', senderPhone)
            .order('created_at', { ascending: false })
            .limit(10); // Remember last 10 messages

        let conversationHistory = [];
        if (historyData) {
            // Reverse to chronological order (oldest first)
            conversationHistory = historyData.reverse().map(msg => ({
                role: msg.role === 'incoming' ? 'user' : 'assistant',
                content: msg.content
            }));
        }

        console.log(`[DEBUG] Loaded ${conversationHistory.length} history items. Model: ${chatbot.model || 'gpt-4o-mini'}`);

        // 1. Define Tools
        const tools = [
            {
                type: "function",
                function: {
                    name: "generate_quote",
                    description: "Generate a PDF quotation for the customer when they explicitly ask for one. Always ask for the customer's name first if you don't know it.",
                    parameters: {
                        type: "object",
                        properties: {
                            customerName: {
                                type: "string",
                                description: "The name of the customer."
                            },
                            items: {
                                type: "array",
                                description: "List of items to include in the quote.",
                                items: {
                                    type: "object",
                                    properties: {
                                        name: { type: "string", description: "Name of the product/service" },
                                        qty: { type: "integer", description: "Quantity" },
                                        price: { type: "number", description: "Unit Price (infer from services_offered context)" }
                                    },
                                    required: ["name", "qty", "price"]
                                }
                            }
                        },
                        required: ["customerName", "items"]
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "get_products",
                    description: "Search for available products and their prices relative to the user's query. Use this to find out how much things cost.",
                    parameters: {
                        type: "object",
                        properties: {
                            query: { type: "string", description: "Search query or category (optional)" }
                        }
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "send_product_images",
                    description: "Send product images to the customer via WhatsApp. Use this when the customer asks to see pictures, images, or photos of specific products.",
                    parameters: {
                        type: "object",
                        properties: {
                            product_names: {
                                type: "array",
                                items: { type: "string" },
                                description: "List of product names to send images for"
                            }
                        },
                        required: ["product_names"]
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "request_human_agent",
                    description: "Transfer the conversation to a human agent. Use this when the customer explicitly asks to speak with a human, real person, manager, or customer service representative.",
                    parameters: {
                        type: "object",
                        properties: {
                            reason: {
                                type: "string",
                                description: "Brief reason for the handover request"
                            }
                        },
                        required: ["reason"]
                    }
                }
            }
        ];

        // 2. Call AI with Tools
        console.log("[DEBUG] Sending request to OpenAI...");
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${chatbot.openai_api_key || process.env.OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: chatbot.model || 'gpt-4o',
                messages: [
                    { role: 'system', content: systemContext },
                    ...conversationHistory,
                    { role: 'user', content: userMessage }
                ],
                tools: tools,
                tool_choice: "auto"
            })
        });

        const data = await response.json();

        if (data.error) {
            console.error("[DEBUG] OpenAI API Error:", JSON.stringify(data.error));
            await sendWhatsAppText(phoneNumberId, chatbot.access_token, senderPhone, "I'm having trouble thinking right now. Please try again later.");
            return;
        }

        const choice = data.choices?.[0];
        const reply = choice?.message?.content;
        const toolCalls = choice?.message?.tool_calls;

        // 3. Handle Tool Calls (Iterative Loop for Chained Calls)
        let currentMessage = choice.message;
        const allMessages = [
            { role: 'system', content: systemContext },
            ...conversationHistory,
            { role: 'user', content: userMessage }
        ];

        let loopCount = 0;
        const MAX_TOOL_LOOPS = 5; // Safety limit to prevent infinite loops

        while (currentMessage?.tool_calls && loopCount < MAX_TOOL_LOOPS) {
            loopCount++;
            const toolCalls = currentMessage.tool_calls;
            console.log(`[DEBUG] Tool Loop ${loopCount}: AI requesting ${toolCalls.length} tool(s)`);

            const toolOutputs = [];

            // Execute all requested tools
            for (const toolCall of toolCalls) {
                const fnName = toolCall.function.name;
                const args = JSON.parse(toolCall.function.arguments);
                let output = "";

                try {
                    if (fnName === 'generate_quote') {
                        console.log(`[DEBUG] Generating Quote for: ${args.customerName}`);

                        // Notify user (only on first PDF generation)
                        if (loopCount === 1 || !toolOutputs.some(t => t.name === 'generate_quote')) {
                            await sendWhatsAppText(phoneNumberId, chatbot.access_token, senderPhone, "📄 *Generating your quotation...*");
                        }

                        // Execute
                        const pdfUrl = await handleGenerateQuote(args, chatbot, senderPhone);

                        // Send PDF immediately
                        await sendWhatsAppPDF(phoneNumberId, chatbot.access_token, senderPhone, pdfUrl);
                        await logOutgoing(chatbot.id, `[System] Generated Quote: ${pdfUrl}`, senderPhone, conversationId);

                        // Tool Output for AI - Don't mention the URL, just confirm and offer help
                        output = JSON.stringify({
                            success: true,
                            message: "Quotation PDF has been successfully sent to the customer. Now politely ask if there's anything else you can help them with."
                        });

                    } else if (fnName === 'get_products') {
                        console.log(`[DEBUG] Fetching product list...`);
                        output = await handleGetProducts(chatbot);
                        console.log(`[DEBUG] Product Data Length: ${output.length} characters`);

                    } else if (fnName === 'send_product_images') {
                        console.log(`[DEBUG] Sending product images for: ${args.product_names.join(', ')}`);

                        try {
                            // Query products by name
                            const { data: products, error } = await supabase
                                .from('products')
                                .select('name, image_url')
                                .eq('chatbot_id', chatbot.id)
                                .in('name', args.product_names);

                            if (error) {
                                throw new Error(`Database error: ${error.message}`);
                            }

                            if (!products || products.length === 0) {
                                output = JSON.stringify({
                                    success: false,
                                    message: "No products found with the requested names."
                                });
                            } else {
                                // Filter products that have images
                                const productsWithImages = products.filter(p => p.image_url);
                                const productsWithoutImages = products.filter(p => !p.image_url);

                                // Send images
                                for (const product of productsWithImages) {
                                    await sendWhatsAppImage(
                                        phoneNumberId,
                                        chatbot.access_token,
                                        senderPhone,
                                        product.image_url,
                                        product.name
                                    );
                                    await logOutgoing(chatbot.id, `[System] Sent image: ${product.name}`, senderPhone, conversationId);
                                }

                                // Build response message
                                let resultMessage = "";
                                if (productsWithImages.length > 0) {
                                    resultMessage += `Successfully sent ${productsWithImages.length} product image(s). `;
                                }
                                if (productsWithoutImages.length > 0) {
                                    resultMessage += `Note: ${productsWithoutImages.length} product(s) don't have images yet: ${productsWithoutImages.map(p => p.name).join(', ')}.`;
                                }

                                output = JSON.stringify({
                                    success: true,
                                    message: resultMessage.trim() + " Now politely ask if there's anything else you can help them with."
                                });
                            }
                        } catch (err) {
                            console.error(`[DEBUG] send_product_images error:`, err);
                            output = JSON.stringify({
                                success: false,
                                error: err.message
                            });
                        }

                    } else if (fnName === 'request_human_agent') {
                        console.log(`[DEBUG] Customer requesting human agent. Reason: ${args.reason}`);

                        try {
                            // Update conversation status to 'human'
                            if (conversationId) {
                                await supabase
                                    .from('conversations')
                                    .update({
                                        status: 'human',
                                        updated_at: new Date().toISOString()
                                    })
                                    .eq('id', conversationId);

                                console.log(`[DEBUG] Conversation ${conversationId} transferred to human agent`);
                            }

                            output = JSON.stringify({
                                success: true,
                                message: "The conversation has been transferred to a human agent. Please inform the customer that a representative will respond shortly."
                            });
                        } catch (err) {
                            console.error(`[DEBUG] request_human_agent error:`, err);
                            output = JSON.stringify({
                                success: false,
                                error: err.message
                            });
                        }
                    }
                } catch (err) {
                    console.error(`[DEBUG] Tool execution failed (${fnName}):`, err);
                    output = JSON.stringify({ error: err.message });

                    if (fnName === 'generate_quote') {
                        await sendWhatsAppText(phoneNumberId, chatbot.access_token, senderPhone, "Sorry, I had trouble creating the quote document.");
                    }
                }

                toolOutputs.push({
                    tool_call_id: toolCall.id,
                    role: 'tool',
                    name: fnName,
                    content: output
                });
            }

            // Add assistant's tool request and tool outputs to message history
            allMessages.push(currentMessage);
            allMessages.push(...toolOutputs);

            // Submit tool outputs back to OpenAI
            console.log(`[DEBUG] Submitting ${toolOutputs.length} tool output(s) to OpenAI...`);

            try {
                const response = await fetch('https://api.openai.com/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${chatbot.openai_api_key || process.env.OPENAI_API_KEY}`
                    },
                    body: JSON.stringify({
                        model: chatbot.model || 'gpt-4o',
                        messages: allMessages,
                        tools: tools
                    })
                });

                console.log(`[DEBUG] OpenAI Response Status: ${response.status}`);
                const responseData = await response.json();

                if (responseData.error) {
                    console.error("[DEBUG] OpenAI Error:", responseData.error);
                    await sendWhatsAppText(phoneNumberId, chatbot.access_token, senderPhone, "My brain is tired (OpenAI Error). Please try again.");
                    return;
                }

                currentMessage = responseData.choices?.[0]?.message;

                // Check if we got a final text reply
                if (currentMessage?.content) {
                    console.log(`[DEBUG] Final Reply (after ${loopCount} loop(s)): "${currentMessage.content}"`);
                    await sendWhatsAppText(phoneNumberId, chatbot.access_token, senderPhone, currentMessage.content);
                    await logOutgoing(chatbot.id, currentMessage.content, senderPhone, conversationId);
                    break; // Exit the loop
                } else if (currentMessage?.tool_calls) {
                    console.log(`[DEBUG] AI wants to call ${currentMessage.tool_calls.length} more tool(s)...`);
                    // Loop continues
                } else {
                    console.warn("[DEBUG] OpenAI returned neither content nor tool_calls. Exiting loop.");
                    break;
                }

            } catch (fetchErr) {
                console.error("[DEBUG] Fetch Error:", fetchErr);
                break;
            }
        }

        if (loopCount >= MAX_TOOL_LOOPS) {
            console.error(`[DEBUG] Reached MAX_TOOL_LOOPS (${MAX_TOOL_LOOPS}). Stopping to prevent infinite loop.`);
            await sendWhatsAppText(phoneNumberId, chatbot.access_token, senderPhone, "I got a bit carried away with my tools! Please try asking again.");
        }

        // If there was a direct reply (no tools)
        if (!choice.message?.tool_calls && reply) {
            console.log(`[DEBUG] Direct Reply: "${reply}"`);
            await sendWhatsAppText(phoneNumberId, chatbot.access_token, senderPhone, reply);
            await logOutgoing(chatbot.id, reply, senderPhone, conversationId);
        }

    } catch (e) {
        console.error("[DEBUG] Processing Error:", e);
    }
}

// --- WhatsApp Helpers ---
async function markMessageAsRead(phoneId, token, messageId) {
    try {
        await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({
                messaging_product: 'whatsapp',
                status: 'read',
                message_id: messageId
            })
        });
    } catch (e) {
        console.error("[DEBUG] Mark Read Error:", e.message);
    }
}

async function sendWhatsAppText(phoneId, token, to, text) {
    try {
        const response = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({
                messaging_product: 'whatsapp',
                to: to,
                text: { body: text }
            })
        });

        const data = await response.json();
        if (data.error) {
            console.error("[DEBUG] WhatsApp Send Error:", JSON.stringify(data.error));
        } else {
            console.log(`[DEBUG] WhatsApp Message Sent. ID: ${data.messages?.[0]?.id}`);
        }
    } catch (e) {
        console.error("[DEBUG] WhatsApp Fetch Error:", e);
    }
}

async function sendWhatsAppPDF(phoneId, token, to, link) {
    await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: to,
            type: "document",
            document: {
                link: link,
                caption: "Here is your quotation."
            }
        })
    });
}

async function sendWhatsAppImage(phoneId, token, to, imageUrl, caption = "") {
    try {
        const response = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({
                messaging_product: 'whatsapp',
                to: to,
                type: "image",
                image: {
                    link: imageUrl,
                    caption: caption
                }
            })
        });

        const data = await response.json();
        if (data.error) {
            console.error("[DEBUG] WhatsApp Image Send Error:", JSON.stringify(data.error));
        } else {
            console.log(`[DEBUG] WhatsApp Image Sent. ID: ${data.messages?.[0]?.id}`);
        }
    } catch (e) {
        console.error("[DEBUG] WhatsApp Image Fetch Error:", e);
    }
}

async function logOutgoing(chatbotId, content, phone, conversationId = null) {
    await supabase.from('messages').insert({
        chatbot_id: chatbotId,
        conversation_id: conversationId,
        content: content,
        direction: 'outgoing',
        status: 'sent',
        whatsapp_user_phone: phone
    });
}

// --- Routes ---
const verifyWebhook = (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    const verifyToken = process.env.VERIFY_TOKEN || 'vibecode';

    if (mode === 'subscribe' && token === verifyToken) {
        console.log('WEBHOOK_VERIFIED');
        return res.status(200).send(challenge);
    }
    res.sendStatus(403);
};

// Support both /webhook (standard) and / (test app style) for verification
app.get('/webhook', verifyWebhook);
app.get('/', (req, res, next) => {
    // If query params exist, it's likely a verification request
    if (req.query['hub.mode']) {
        return verifyWebhook(req, res);
    }
    // Otherwise serve the frontend
    next();
});

const handleWebhookPost = async (req, res) => {
    // 1. Acknowledge Immediately
    res.sendStatus(200);

    // 2. Async Processing
    try {
        const body = req.body;
        console.log(`Webhook received ${new Date().toISOString()}`);

        if (body.object === 'whatsapp_business_account') {
            const entries = body.entry || [];
            for (const entry of entries) {
                const changes = entry.changes || [];
                for (const change of changes) {
                    const value = change.value;
                    if (value && value.messages) {
                        const metadata = value.metadata;
                        const phoneNumberId = metadata?.phone_number_id;

                        console.log(`[DEBUG] Received Webhook for Phone ID: ${phoneNumberId}`);

                        // DEBUG: List all chatbots to see what's actually in the DB
                        const { data: allBots, error: listError } = await supabase
                            .from('chatbots')
                            .select('company_name, whatsapp_phone_number_id');

                        if (listError) {
                            console.error("[DEBUG] CRITICAL: Could not list chatbots. Is your SUPABASE_SERVICE_ROLE_KEY correct?", listError);
                        } else {
                            console.log("[DEBUG] Available Chatbots in DB:", JSON.stringify(allBots, null, 2));
                        }

                        // Fetch Config
                        const { data: chatbot, error: dbError } = await supabase
                            .from('chatbots')
                            .select('*')
                            .eq('whatsapp_phone_number_id', phoneNumberId)
                            .maybeSingle();

                        if (dbError) {
                            console.error("[DEBUG] Database Error:", dbError);
                        }

                        if (chatbot) {
                            console.log(`[DEBUG] Chatbot "${chatbot.company_name}" found.`);
                            for (const msg of value.messages) {
                                if (msg.type === 'text') {
                                    await processMessage(msg, phoneNumberId, chatbot);
                                }
                            }
                        } else {
                            console.warn(`[DEBUG] No chatbot found in DB for ID: ${phoneNumberId}`);
                            console.warn(`[ACTION] Go to your App -> Create Chatbot -> Enter Phone Number ID: ${phoneNumberId}`);
                        }
                    }
                }
            }
        }
    } catch (e) {
        console.error("Webhook Background Error:", e);
    }
};

app.post('/api/sync-profile', async (req, res) => {
    const { chatbotId } = req.body;
    console.log(`[DEBUG] Syncing Profile for Chatbot: ${chatbotId}`);

    try {
        const { data: chatbot, error } = await supabase
            .from('chatbots')
            .select('*')
            .eq('id', chatbotId)
            .single();

        if (error || !chatbot) throw new Error("Chatbot not found");

        const phoneId = chatbot.whatsapp_phone_number_id;
        const token = chatbot.access_token;
        const logoUrl = chatbot.logo_url;
        const description = chatbot.company_description;
        const companyName = chatbot.company_name;

        const results = {
            about: "skipped",
            photo: "skipped",
            displayName: "skipped"
        };

        // 1. Update "About" (Status)
        if (description) {
            const shortDesc = description.substring(0, 139);
            const aboutRes = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/whatsapp_business_profile`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ messaging_product: "whatsapp", about: shortDesc })
            });
            results.about = aboutRes.ok ? "success" : `failed (${await aboutRes.text()})`;
        }

        // 2. Submit Display Name
        if (companyName) {
            // Note: This often requires 'business_management' permission and might fail if not verified.
            const nameRes = await fetch(`https://graph.facebook.com/v21.0/${phoneId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ messaging_product: "whatsapp", display_name: companyName })
            });
            results.displayName = nameRes.ok ? "submitted" : `failed (${await nameRes.text()})`;
        }

        // 3. Update Profile Picture: SKIPPED (User manages this in WhatsApp Manager)
        results.photo = "Use WhatsApp Manager to update logo";

        res.json({ success: true, results });

    } catch (e) {
        console.error("Sync Profile Error:", e);
        res.status(500).json({ error: e.message });
    }
});

// --- API: Get Conversations for a Chatbot ---
app.get('/api/chatbots/:chatbotId/conversations', async (req, res) => {
    const { chatbotId } = req.params;
    const { status } = req.query;

    try {
        let query = supabase
            .from('conversations')
            .select('*')
            .eq('chatbot_id', chatbotId)
            .order('last_message_at', { ascending: false });

        if (status && status !== 'all') {
            query = query.eq('status', status);
        }

        const { data, error } = await query.limit(50);

        if (error) throw error;
        res.json(data);
    } catch (e) {
        console.error("Get Conversations Error:", e);
        res.status(500).json({ error: e.message });
    }
});

// --- API: Get Single Conversation with Messages ---
app.get('/api/conversations/:conversationId', async (req, res) => {
    const { conversationId } = req.params;

    try {
        // Get conversation
        const { data: conversation, error: convError } = await supabase
            .from('conversations')
            .select('*')
            .eq('id', conversationId)
            .single();

        if (convError) throw convError;

        // Get messages
        const { data: messages, error: msgError } = await supabase
            .from('messages')
            .select('*')
            .eq('conversation_id', conversationId)
            .order('created_at', { ascending: true });

        if (msgError) throw msgError;

        res.json({ conversation, messages });
    } catch (e) {
        console.error("Get Conversation Error:", e);
        res.status(500).json({ error: e.message });
    }
});

// --- API: Agent Send Message ---
app.post('/api/conversations/:conversationId/send', async (req, res) => {
    const { conversationId } = req.params;
    const { message } = req.body;

    try {
        // Get conversation details
        const { data: conversation, error: convError } = await supabase
            .from('conversations')
            .select('*, chatbots(*)')
            .eq('id', conversationId)
            .single();

        if (convError || !conversation) throw new Error("Conversation not found");

        const chatbot = conversation.chatbots;
        const customerPhone = conversation.customer_phone;
        const phoneNumberId = chatbot.whatsapp_phone_number_id;
        const accessToken = chatbot.access_token;

        // Send message via WhatsApp
        await sendWhatsAppText(phoneNumberId, accessToken, customerPhone, message);

        // Log to database
        await supabase.from('messages').insert({
            chatbot_id: chatbot.id,
            conversation_id: conversationId,
            content: message,
            direction: 'outgoing',
            status: 'sent',
            whatsapp_user_phone: customerPhone
        });

        // Update conversation timestamp
        await supabase
            .from('conversations')
            .update({ last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() })
            .eq('id', conversationId);

        res.json({ success: true });
    } catch (e) {
        console.error("Agent Send Error:", e);
        res.status(500).json({ error: e.message });
    }
});

// --- API: Update Conversation Status ---
app.post('/api/conversations/:conversationId/status', async (req, res) => {
    const { conversationId } = req.params;
    const { status } = req.body; // 'bot', 'human', or 'resolved'

    if (!['bot', 'human', 'resolved'].includes(status)) {
        return res.status(400).json({ error: "Invalid status. Must be 'bot', 'human', or 'resolved'" });
    }

    try {
        const { error } = await supabase
            .from('conversations')
            .update({ status, updated_at: new Date().toISOString() })
            .eq('id', conversationId);

        if (error) throw error;

        res.json({ success: true, status });
    } catch (e) {
        console.error("Update Status Error:", e);
        res.status(500).json({ error: e.message });
    }
});

app.post('/webhook', handleWebhookPost);
// Also listen on root for POST to match the simple test app if desired
app.post('/', handleWebhookPost);

// Express 5 requires proper regex or named parameters for wildcards
// Using a RegExp object avoids string parsing issues with path-to-regexp
app.get(/.*/, (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
