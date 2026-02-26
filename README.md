# WhatsApp Agent Maker (AI Customer Support Automation)

A configurable system that helps businesses spin up WhatsApp-based customer support agents powered by AI. Organizations can provide their business context (FAQs, products/services, pricing rules) and the agent responds in natural language, answers FAQs, and can generate quotations based on customer needs.

## Why this exists
Many businesses want WhatsApp customer support that:
- replies instantly
- stays consistent with company policy
- can handle FAQs + product inquiries
- can generate quotations (not just chat)

This project turns that into a reusable system.

---

## Key Features
- ✅ Organization-specific context (FAQs, policies, products/services)
- ✅ Natural language customer support responses
- ✅ FAQ automation
- ✅ Quotation generation from structured product/service info
- ✅ Conversation flow handling + edge-case protection
- ✅ Admin-friendly setup flow (configure once, run continuously)

---

## Tech Stack
- **TypeScript / JavaScript**
- **Node.js** (backend services / orchestration)
- **API integrations** (WhatsApp provider + AI provider)
- **PostgreSQL / Supabase** (optional, if used for persistence)

---

## System Overview (High Level)
1. Business owner configures organization details + knowledge base
2. Incoming WhatsApp messages are received by the server/webhook
3. The system loads the correct org context + chat history
4. The AI generates a response or quotation payload
5. Response is sent back to the user via WhatsApp API

---

## Getting Started (Local)
### Prerequisites
- Node.js (LTS)
- npm / pnpm / yarn

### Setup
1) Clone and install:

git clone https://github.com/malmanyeza/whatsapp-agent-maker.git
cd whatsapp-agent-maker
cp .env.example .env

# WhatsApp Provider
WHATSAPP_WEBHOOK_SECRET=your_secret
WHATSAPP_API_TOKEN=your_token
WHATSAPP_PHONE_NUMBER_ID=your_id

# AI Provider
AI_API_KEY=your_key
AI_MODEL=your_model_name

# Optional: Database
DATABASE_URL=postgres_connection_string

npm install
