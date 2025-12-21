
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
async function handleGetProducts(chatbotId) {
    const { data, error } = await supabase
        .from('products')
        .select('name, description, unit_price, currency')
        .eq('chatbot_id', chatbotId);

    if (error) return "Error fetching products.";
    if (!data || data.length === 0) return "No products found in the database. Please ask the administrator to add products.";

    return JSON.stringify(data);
}

// --- Utility: Generate Quote Tool Handler ---
async function handleGenerateQuote(args, chatbot, customerPhone) {
    // args: { items: [{ name, qty }], customerName }

    let total = 0;
    const cleanItems = args.items.map(item => {
        const t = item.price * item.qty;
        total += t;
        return { ...item, total: t };
    });

    // 2. Generate PDF
    const pdfBuffer = await generatePDFQuote({
        company: {
            name: chatbot.company_name,
            description: chatbot.company_description
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
    const fileName = `quote_${Date.now()}_${Math.floor(Math.random() * 1000)}.pdf`;
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

        console.log(`[DEBUG] Processing message from ${senderPhone}: "${userMessage}"`);

        // Log Incoming to DB
        const { error: logError } = await supabase.from('messages').insert({
            chatbot_id: chatbot.id,
            content: userMessage,
            direction: 'incoming',
            status: 'received',
            whatsapp_user_phone: senderPhone
        });

        if (logError) console.error("[DEBUG] Failed to log incoming message to DB:", logError);

        // Context Construction
        const systemContext = `
You are a helpful AI assistant for ${chatbot.company_name}.
Company Description: ${chatbot.company_description}
Services/Products Offered: ${chatbot.services_offered}

Your goal is to answer customer questions professionally based on the above information.
${chatbot.system_instructions || ""}
`;

        // 1. Call AI
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
                    { role: 'user', content: userMessage }
                ]
            })
        });

        const data = await response.json();

        if (data.error) {
            console.error("[DEBUG] OpenAI API Error:", JSON.stringify(data.error));
            await sendWhatsAppText(phoneNumberId, chatbot.access_token, senderPhone, "I'm having trouble thinking right now. Please try again later.");
            return;
        }

        const reply = data.choices?.[0]?.message?.content;
        console.log(`[DEBUG] OpenAI Reply: "${reply}"`);

        // 2. Send Text Response
        if (reply) {
            console.log("[DEBUG] Sending reply to WhatsApp...");
            await sendWhatsAppText(phoneNumberId, chatbot.access_token, senderPhone, reply);
            await logOutgoing(chatbot.id, reply, senderPhone);
            console.log("[DEBUG] Reply sent successfully.");
        }

    } catch (e) {
        console.error("[DEBUG] Processing Error:", e);
    }
}

// --- WhatsApp Helpers ---
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
