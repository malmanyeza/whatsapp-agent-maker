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
<img width="1730" height="837" alt="Screenshot 2026-02-26 113433" src="https://github.com/user-attachments/assets/30257ac0-4f24-4e3a-abbd-8f75f713e6a3" />
<img width="1915" height="866" alt="Screenshot 2026-02-26 121121" src="https://github.com/user-attachments/assets/e38abbdb-0805-42d3-9770-fd6f10669c2e" />
<img width="1898" height="868" alt="Screenshot 2026-02-26 121438" src="https://github.com/user-attachments/assets/5d894ac2-37c4-4774-ba48-33c9cbe447da" />
<img width="1897" height="861" alt="Screenshot 2026-02-26 121540" src="https://github.com/user-attachments/assets/c218af2c-da1d-4064-ac51-2537aef2a3f0" />
