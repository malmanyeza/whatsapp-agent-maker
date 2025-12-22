
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
async function handleGetProducts(chatbot) {
    // 1. External API (Priority)
    if (chatbot.external_product_api_url) {
        console.log(`[DEBUG] Fetching products from External API: ${chatbot.external_product_api_url}`);
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

            const headers = {};
            if (chatbot.external_product_api_key) {
                headers['Authorization'] = chatbot.external_product_api_key;
            }

            const response = await fetch(chatbot.external_product_api_url, {
                headers,
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (response.ok) {
                const data = await response.json();
                console.log(`[DEBUG] External API success.`);
                return JSON.stringify(data).substring(0, 5000); // Limit context
            } else {
                console.error(`[DEBUG] External API Failed: ${response.status}`);
            }
        } catch (err) {
            console.error("[DEBUG] External API Error:", err.message);
        }
    }

    // 2. Internal Database Fallback
    console.log(`[DEBUG] Fetching products from Supabase...`);
    const { data: dbProducts, error } = await supabase
        .from('products')
        .select('name, description, unit_price, currency, qty')
        .eq('chatbot_id', chatbot.id)
        .limit(30);

    if (error) {
        console.error("[DEBUG] Supabase Product Fetch Error:", error);
        return "Error fetching products. Please ask user to contact sales.";
    }

    if (dbProducts && dbProducts.length > 0) {
        console.log(`[DEBUG] Found ${dbProducts.length} products in DB.`);
        return JSON.stringify(dbProducts);
    }

    return "No products found in inventory.";
}
const data = await response.json();
// Expecting array of { name, price, description }
return JSON.stringify(data);
        } catch (err) {
    console.error("[DEBUG] External Product API Failed:", err);
    // Fallback to internal DB? Or just report error?
    // Let's fallback to internal DB as a safety net if the API is down but data exists locally.
    console.log("[DEBUG] Falling back to internal database...");
}
    }

// 2. Internal Database (Fallback / Default)
const { data, error } = await supabase
    .from('products')
    .select('name, description, unit_price, currency')
    .eq('chatbot_id', chatbot.id);

if (error) return "Error fetching products.";
if (!data || data.length === 0) return "No products found. Please ask the admin to check the product list.";

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

// --- Async Message Processor ---
async function processMessage(message, phoneNumberId, chatbot) {
    try {
        const userMessage = message.text.body;
        const senderPhone = message.from;
        const messageId = message.id;

        // 1. Mark as Read (Blue Ticks) - gives immediate feedback
        await sendWhatsAppReadStatus(phoneNumberId, chatbot.access_token, messageId);

        console.log(`[DEBUG] Processing message from ${senderPhone}: "${userMessage}"`);

        // 1. Log Incoming to DB (FIRE AND FORGET - Don't await)
        supabase.from('messages').insert({
            chatbot_id: chatbot.id,
            content: userMessage,
            direction: 'incoming',
            status: 'received',
            whatsapp_user_phone: senderPhone
        }).then(({ error }) => {
            if (error) console.error("[DEBUG] Background Log Error:", error);
        });

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

        // 3. Handle Tool Calls
        if (toolCalls && toolCalls.length > 0) {
            console.log(`[DEBUG] AI chose to use tools: ${toolCalls.length}`);

            for (const toolCall of toolCalls) {
                if (toolCall.function.name === 'generate_quote') {
                    const args = JSON.parse(toolCall.function.arguments);
                    console.log(`[DEBUG] Generating Quote for: ${args.customerName}`);

                    await sendWhatsAppText(phoneNumberId, chatbot.access_token, senderPhone, "📄 *Generating your quotation...* Please wait a moment.");

                    try {
                        const pdfUrl = await handleGenerateQuote(args, chatbot, senderPhone);
                        await sendWhatsAppPDF(phoneNumberId, chatbot.access_token, senderPhone, pdfUrl);
                        await logOutgoing(chatbot.id, `[System] Generated Quote: ${pdfUrl}`, senderPhone);
                    } catch (err) {
                        console.error("[DEBUG] PDF Generation Error:", err);
                        await sendWhatsAppText(phoneNumberId, chatbot.access_token, senderPhone, "Sorry, I encountered an error creating the PDF. Please try again.");
                    }
                } else if (toolCall.function.name === 'get_products') {
                    console.log(`[DEBUG] AI requesting product list...`);
                    const productData = await handleGetProducts(chatbot);

                    // Respond to OpenAI with the tool result (Implementation Note: In a real loop, we would send this back to OpenAI. 
                    // For Simplicity in this one-shot architecture, we will append it to history and recall OpenAI, OR just send the data as context for the final answer.
                    // The standard OpenAI flow requires a second call. Let's do a recursion or a simpler 2-step.)

                    // --- 2-Step recursive call logic (simplified) ---
                    try {
                        console.log("[DEBUG] Calling OpenAI with tool results...");
                        const secondResponse = await fetch('https://api.openai.com/v1/chat/completions', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${chatbot.openai_api_key || process.env.OPENAI_API_KEY}`
                            },
                            body: JSON.stringify({
                                model: chatbot.model || 'gpt-4o-mini', // Ensure consistent model
                                messages: [
                                    { role: 'system', content: systemContext },
                                    ...conversationHistory,
                                    { role: 'user', content: userMessage },
                                    { role: 'assistant', content: null, tool_calls: toolCalls },
                                    { role: 'tool', tool_call_id: toolCall.id, name: 'get_products', content: productData }
                                ],
                                // tools: tools // Optional: Do we allow recursive tools? Maybe safe to omit for now to prevent loops
                            })
                        });

                        const secondData = await secondResponse.json();
                        if (secondData.error) {
                            console.error("[DEBUG] OpenAI (Round 2) Error:", secondData.error);
                            await sendWhatsAppText(phoneNumberId, chatbot.access_token, senderPhone, "I'm having trouble analyzing the product data. Please try asking again.");
                        } else {
                            const finalReply = secondData.choices?.[0]?.message?.content;
                            if (finalReply) {
                                console.log(`[DEBUG] OpenAI Final Reply: "${finalReply}"`);
                                await sendWhatsAppText(phoneNumberId, chatbot.access_token, senderPhone, finalReply);
                                await logOutgoing(chatbot.id, finalReply, senderPhone);
                            }
                        }
                    } catch (e) {
                        console.error("[DEBUG] Error in Secondary OpenAI Call:", e);
                        await sendWhatsAppText(phoneNumberId, chatbot.access_token, senderPhone, "Oops, something went wrong while thinking. Please try again.");
                    }
                }
            }

            const secondData = await secondResponse.json();
            const finalReply = secondData.choices?.[0]?.message?.content;

            if (finalReply) {
                console.log(`[DEBUG] OpenAI Final Reply (after tool): "${finalReply}"`);
                await sendWhatsAppText(phoneNumberId, chatbot.access_token, senderPhone, finalReply);
                await logOutgoing(chatbot.id, finalReply, senderPhone);
            }
        }
    }
        } else if (reply) {
    // Normal Text Reply
    console.log(`[DEBUG] OpenAI Reply: "${reply}"`);
    await sendWhatsAppText(phoneNumberId, chatbot.access_token, senderPhone, reply);
    await logOutgoing(chatbot.id, reply, senderPhone);
}

    } catch (e) {
    console.error("[DEBUG] Processing Error:", e);
}
}

// --- WhatsApp Helpers ---
async function sendWhatsAppReadStatus(phoneId, token, messageId) {
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
        // Ignore read receipt errors
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

async function logOutgoing(chatbotId, content, phone) {
    await supabase.from('messages').insert({
        chatbot_id: chatbotId,
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

app.post('/webhook', handleWebhookPost);
// Also listen on root for POST to match the simple test app if desired
app.post('/', handleWebhookPost);

// Express 5 requires proper regex or named parameters for wildcards
// Using a RegExp object avoids string parsing issues with path-to-regexp
app.get(/.*/, (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
