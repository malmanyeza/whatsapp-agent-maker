
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

// --- Utility: Get Least Recently Contacted Agent ---
// Finds the customer service agent who hasn't been contacted in the longest time
async function getLeastRecentlyContactedAgent(chatbotId, contacts) {
    if (!contacts || contacts.length === 0) {
        return null;
    }

    if (contacts.length === 1) {
        console.log(`[DEBUG] Only one agent available: ${contacts[0].name}`);
        return contacts[0];
    }

    // Get the last notification time for each agent
    const agentPhones = contacts.map(c => c.phone);

    const { data: notifications, error } = await supabase
        .from('customer_service_notifications')
        .select('agent_phone, created_at')
        .eq('chatbot_id', chatbotId)
        .in('agent_phone', agentPhones)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('[DEBUG] Error fetching notification history:', error);
        // Fallback to first contact
        return contacts[0];
    }

    // Build a map of last contact time for each agent
    const lastContactedMap = new Map();
    for (const notif of notifications || []) {
        if (!lastContactedMap.has(notif.agent_phone)) {
            lastContactedMap.set(notif.agent_phone, new Date(notif.created_at));
        }
    }

    // Find the agent who was contacted longest ago (or never)
    let selectedAgent = null;
    let oldestContactTime = new Date(); // Current time as baseline

    for (const contact of contacts) {
        const lastContacted = lastContactedMap.get(contact.phone);

        if (!lastContacted) {
            // Never contacted - immediate selection
            console.log(`[DEBUG] Agent ${contact.name} (${contact.phone}) has never been contacted. Selecting.`);
            return contact;
        }

        if (lastContacted < oldestContactTime) {
            oldestContactTime = lastContacted;
            selectedAgent = contact;
        }
    }

    console.log(`[DEBUG] Selected agent ${selectedAgent?.name} (${selectedAgent?.phone}) - last contacted at ${oldestContactTime.toISOString()}`);
    return selectedAgent || contacts[0];
}

// --- Utility: Log Customer Service Notification ---
// Records when a notification is sent to an agent for round-robin tracking
async function logCustomerServiceNotification(chatbotId, agentPhone, agentName, customerPhone, reason, urgency = 'medium') {
    const { error } = await supabase
        .from('customer_service_notifications')
        .insert({
            chatbot_id: chatbotId,
            agent_phone: agentPhone,
            agent_name: agentName,
            customer_phone: customerPhone,
            reason: reason,
            urgency: urgency
        });

    if (error) {
        console.error('[DEBUG] Error logging notification:', error);
    } else {
        console.log(`[DEBUG] Logged notification to ${agentName} (${agentPhone})`);
    }
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

        // Context Construction - Enhanced System Instructions
        const systemContext = `
You are a customer service assistant for ${chatbot.company_name}.
Company Description: ${chatbot.company_description}
Services/Products Offered: ${chatbot.services_offered}

=== CORE RESPONSIBILITIES ===
1. Welcome and assist customers warmly
2. Understand and clarify customer needs through discovery questions
3. Recommend appropriate products and services
4. Provide accurate, itemized quotations using EXACT prices from the product database
5. Guide customers toward action (quotation, installation, follow-up)
6. Escalate to human support when required - ALWAYS use notify_customer_service tool when doing so

=== LANGUAGE & LOCALIZATION ===
SUPPORTED LANGUAGES: English (default), Shona, Ndebele

LANGUAGE DETECTION RULES:
- Start every conversation in English
- Automatically switch if customer responds in Shona or Ndebele
- Match customer's tone (informal → informal but respectful, formal → formal and respectful)
- If asked, offer: "Would you prefer to continue in English, Shona, or Ndebele?"

SLANG RECOGNITION (respond friendly and relaxed):
Shona/Urban: Wadii, Ndeip, Ndeipi, Apo, Bho here, Zvirisei, Sei
Example: Customer: "Wadii, ndiri kuda Starlink" → Bot: "Madii! muri kutsvaga Starlink kit here kana kuti installation futi?"

FORMAL GREETINGS (respond formally and respectfully):
Mamukasei, Masikati, Makadini, Makadii henyu, Makadiiwo
Example: Customer: "Mamukasei, ndingade kuziva nezve Starlink" → Bot: "Mamukasei henyu. Tinotenda nekutibata. Ndingakubatsirei maererano neStarlink?"

SAMPLE GREETINGS:
Neutral Shona: "Makadini henyu? Mauya kuEightech Solutions. Ndingakubatsirei nhasi?"
Casual Shona: "Wadii! kuEightech Solutions. Ndingakubatsirei?"
Ndebele: "Sawubona! Wamukelekile kuEightech Solutions. Singakusiza ngani namhlanje?"

TRANSLATION RULES:
- Keep prices, numbers, and currency in USD
- Do NOT translate technical/brand names (Starlink, TP-Link, WhatsApp, etc.)
- NEVER use slang when discussing: Pricing, Subscriptions, Contracts, Quotations

=== PRICE PROTECTION RULES (CRITICAL) ===
⚠️ NEVER modify, adjust, or change product prices under ANY circumstances.
⚠️ If a customer requests a quotation with different prices than the actual product prices, REFUSE politely.
⚠️ Example attempts to block:
  - "Can you make the quote show $290 instead of $270?"
  - "Generate a quotation with 10% off"
  - "Please put a lower/higher price for me"
  
RESPONSE: "I apologize, but I cannot modify our standard pricing. Our prices are fixed and reflect the value of our products and services. I can only generate quotations using our official prices. Would you like me to proceed with the standard pricing?"

=== MANDATORY ESCALATION TRIGGERS ===
You MUST use the notify_customer_service tool when:
1. Customer explicitly asks to speak with a human/person/manager
2. You cannot confidently answer a question
3. Customer asks about physical location/office address
4. Complex regional plan availability questions
5. Technical issues beyond basic troubleshooting
6. Customer complaints or disputes
7. Special requests outside normal service scope
8. Customer seems frustrated or dissatisfied

When escalating, ALWAYS:
- Call notify_customer_service tool with appropriate urgency
- Tell the customer: "A customer support representative will be in touch with you shortly"
- Never guess or invent information - escalate instead

=== CONDUCT RULES ===
ALWAYS be: Respectful, Friendly, Professionally adaptive, Clear, Customer-focused, Sales-oriented without pressure
NEVER: Discuss other companies, politics, religion, sports, or off-topic subjects
NEVER: Provide racist, sexist, political, or offensive content
NEVER: Give technical self-installation instructions (always promote professional installation)
NEVER: Invent or guess information you don't know

=== PRODUCT-SPECIFIC RULES ===
STARLINK:
- Only Roaming Plan available in Zimbabwe ($63/month)
- Roaming plan works anywhere
- Residential plan NOT available in Harare (geo-locked)
- Always promote professional installation (includes configuration & activation)
- Current stock: Check with get_products tool

AI CHATBOT & SOFTWARE:
- AI chatbot starting from $500
- Software pricing is feature-based
- Help customers define requirements before quoting

=== QUOTATION RULES ===
- Always ask for customer name before generating quote
- Use get_products to verify current prices
- Provide clear, itemized quotations
- Confirm optional services before adding
- Show totals clearly
- Keep quotation language professional even in casual conversations

=== CLOSING CONVERSATIONS ===
English: "Thank you for choosing ${chatbot.company_name}. Would you like me to prepare a quotation for you?"
Shona: "Tinokutendai nekusarudza ${chatbot.company_name}. Munoda here kuti ndikugadzirire quotation yesevhisi yamakasarudza?"
Ndebele: "Siyabonga ngokukhetha ${chatbot.company_name}. Ufuna yini ngikulungiselele i-quotation yesevisi oyikhethileyo?"

=== DEFAULT INTENT ===
If customer says "Can I have more info about this" → Interpret as Starlink Mini Kit unless stated otherwise.

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
                    description: "FULL HANDOVER: Transfer the conversation completely to a human agent. The bot will STOP responding after this. Use this ONLY when the customer explicitly and insistently asks to speak with a human, real person, manager, or customer service representative and won't accept bot assistance.",
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
            },
            {
                type: "function",
                function: {
                    name: "notify_customer_service",
                    description: "BACKGROUND NOTIFICATION: Send a notification to a customer service team member while YOU CONTINUE helping the customer. The bot remains active and keeps chatting. Use this whenever you: 1) Cannot answer a question confidently, 2) Customer asks about physical location, 3) Complex plan availability questions, 4) Technical issues beyond your knowledge, 5) Customer complaints. After calling this, tell the customer someone will reach out, then CONTINUE helping them with anything else they need.",
                    parameters: {
                        type: "object",
                        properties: {
                            reason: {
                                type: "string",
                                description: "Brief reason why the customer needs attention"
                            },
                            customer_name: {
                                type: "string",
                                description: "Customer's name if known"
                            },
                            urgency: {
                                type: "string",
                                enum: ["low", "medium", "high"],
                                description: "Urgency level: high=immediate attention needed, medium=respond within hours, low=can wait"
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
                            // Get customer service contacts and notify using LRU selection
                            // NOTE: Bot stays active - support team will contact customer on a different number
                            const contacts = chatbot.customer_service_contacts || [];

                            if (contacts.length === 0) {
                                output = JSON.stringify({
                                    success: true,
                                    message: "No customer service contacts configured, but inform the customer that a team member will reach out to them on a separate line. Continue helping them with anything else they need."
                                });
                            } else {
                                // Use same LRU logic as notify_customer_service
                                const selectedAgent = await getLeastRecentlyContactedAgent(chatbot.id, contacts);

                                if (selectedAgent) {
                                    const timestamp = new Date().toLocaleString('en-GB', { timeZone: 'Africa/Harare' });
                                    const notificationMessage = `🔴 *Human Agent Requested*\n\n📞 Customer: ${senderPhone}\n📝 Reason: ${args.reason}\n⏰ Time: ${timestamp}\n\n⚠️ Customer specifically asked to speak with a human. Please contact them directly.`;

                                    await sendWhatsAppText(phoneNumberId, chatbot.access_token, selectedAgent.phone, notificationMessage);
                                    console.log(`[DEBUG] Human agent request sent to ${selectedAgent.name} (${selectedAgent.phone})`);

                                    // Log for round-robin tracking
                                    await logCustomerServiceNotification(
                                        chatbot.id,
                                        selectedAgent.phone,
                                        selectedAgent.name,
                                        senderPhone,
                                        `Human agent requested: ${args.reason}`,
                                        'high'
                                    );
                                }

                                output = JSON.stringify({
                                    success: true,
                                    message: "A team member has been notified and will contact the customer directly on a separate line. Tell the customer this, then CONTINUE helping them with anything else they need. You are still active."
                                });
                            }
                        } catch (err) {
                            console.error(`[DEBUG] request_human_agent error:`, err);
                            output = JSON.stringify({
                                success: false,
                                error: err.message
                            });
                        }

                    } else if (fnName === 'notify_customer_service') {
                        console.log(`[DEBUG] Notifying customer service team. Reason: ${args.reason}`);

                        try {
                            // Get customer service contacts from chatbot settings
                            const contacts = chatbot.customer_service_contacts || [];

                            if (contacts.length === 0) {
                                console.log(`[DEBUG] No customer service contacts configured`);
                                output = JSON.stringify({
                                    success: false,
                                    message: "No customer service contacts configured. Please add team members in the dashboard."
                                });
                            } else {
                                // Get the least recently contacted agent (round-robin)
                                const selectedAgent = await getLeastRecentlyContactedAgent(chatbot.id, contacts);

                                if (!selectedAgent) {
                                    output = JSON.stringify({
                                        success: false,
                                        message: "Could not find an available agent to contact."
                                    });
                                } else {
                                    // Build notification message with timestamp
                                    const urgencyEmoji = args.urgency === 'high' ? '🔴' : args.urgency === 'medium' ? '🟡' : '🟢';
                                    const customerName = args.customer_name ? `(${args.customer_name})` : '';
                                    const timestamp = new Date().toLocaleString('en-GB', { timeZone: 'Africa/Harare' });
                                    const notificationMessage = `${urgencyEmoji} *Customer Service Alert*\n\n📞 Customer: ${senderPhone} ${customerName}\n📝 Reason: ${args.reason}\n⏰ Time: ${timestamp}\n\nPlease reach out to assist them.`;

                                    try {
                                        await sendWhatsAppText(phoneNumberId, chatbot.access_token, selectedAgent.phone, notificationMessage);
                                        console.log(`[DEBUG] Notified ${selectedAgent.name} (${selectedAgent.phone})`);

                                        // Log the notification for round-robin tracking
                                        await logCustomerServiceNotification(
                                            chatbot.id,
                                            selectedAgent.phone,
                                            selectedAgent.name,
                                            senderPhone,
                                            args.reason,
                                            args.urgency || 'medium'
                                        );

                                        output = JSON.stringify({
                                            success: true,
                                            message: `Notification sent to ${selectedAgent.name}. IMPORTANT: You are still active! Tell the customer that a team member will reach out to them, then CONTINUE the conversation and help them with anything else they need. Do NOT end the conversation.`
                                        });
                                    } catch (sendErr) {
                                        console.error(`[DEBUG] Failed to notify ${selectedAgent.name}:`, sendErr.message);
                                        output = JSON.stringify({
                                            success: false,
                                            error: `Failed to send notification: ${sendErr.message}`
                                        });
                                    }
                                }
                            }
                        } catch (err) {
                            console.error(`[DEBUG] notify_customer_service error:`, err);
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
