# BPA Quote Engine — Sales Automation & Document Pipeline

An automated, event-driven sales automation engine built for **Brisbane Pump Action (BPA)** and **Gold Coast Pump Action (GCPA)**. 

The system automates the entire inbound sales lifecycle: from listening to incoming emails, AI-driven lead classification, dynamic template generation across modern (`.docx`) and legacy (`.doc`) Word formats, native Microsoft Graph PDF rendering, SharePoint archival, and outbound dispatch with HubSpot deal synchronization and multi-touch follow-up scheduling.

---

## 1. Executive Summary & Flow Architecture

```
[Inbound Email] (EstimateOne / BCI / Direct Builders)
       │
       ▼
[Microsoft Graph Webhook] (Real-time change notification to /api/webhook/mailbox)
       │
       ▼
[AI Triage & Classification] (Claude Haiku)
  ├─ Filter non-leads (Invoices, purchase orders, plant hire tenders, internal bounce-backs)
  └─ Extract Builder Name, Project Location, Fleet Category & Urgency (HOT / WARM / COLD)
       │
       ▼
[Supabase Data Layer] (Persist inbound lead record with full AI analysis metadata)
       │
       ▼
[Dynamic Document Engine]
  ├─ Mobile Boom Rates (.docx) ── OpenXML XML date injection
  ├─ Satellite Line Rates (.doc) ── Binary OLE compound document in-place byte replacement
  └─ Spider Boom Rates (.docx) ── Multi-page condition & date stamping
       │
       ▼
[Native MS Graph PDF Engine] (Server-side Word-fidelity PDF conversion via Drive API)
       │
       ▼
[SharePoint Cloud Archival] (Auto-upload to designated category sent archive folders)
       │
       ▼
[Outbound Dispatch & CRM Trigger]
  ├─ Send branded email via Microsoft Graph API with generated PDF attached
  ├─ Load-bearing subject line triggers automatic HubSpot deal creation
  └─ BCC HubSpot Deal Logger & Accounts
       │
       ▼
[Automated Follow-Up Scheduling]
  ├─ Touch 1 (Day 7): Polite rate check-in email
  ├─ Touch 2 (Day 14): Director personal check-in email (Chris Turner)
  ├─ Touch 3 (Day 21): Phone call prompt assigned to sales team
  └─ Touch 4 (Day 51): Re-engage / final outcome prompt
       │
       ▼
[CRM Management Dashboard] (Live real-time feed into Next.js CRM portal)
```

---

## 2. Core Capabilities & What Has Been Delivered

### A. Real-Time Inbound Webhook Listener (`src/controllers/mailboxController.js`)
- **Direct Event-Driven Architecture**: Connects directly to Microsoft Graph webhooks for the shared sales mailbox (`sales@brisbanepumpaction.com.au`). No periodic polling or brittle IMAP scraping.
- **Subscription Lifecycle Management**: Automatically creates and renews Graph change notification subscriptions on startup and via scheduled crons.
- **Idempotency & Deduplication**: Message ID tracking prevents duplicate processing of incoming emails or Graph retry storms.

### B. Intelligent AI Lead Classification (`src/services/classifyService.js`)
- **Noise Elimination**: Uses Claude Haiku to inspect incoming email subjects and bodies. Automatically identifies and drops non-sales emails (such as plant hire purchase orders from Winslow, vendor bills, and general tender blasts outside concrete pumping).
- **Lead Entity Extraction**: Extracts the client/builder company name, project address, and requested pump type (Mobile Boom, Satellite, Spider Boom).
- **Urgency Scoring**: Labels leads as **HOT** (immediate pour / urgent schedule), **WARM** (upcoming projects with flexible timelines), or **COLD** (long-lead general pricing).

### C. Universal Dual-Format Document Engine (`src/services/documentService.js`)
- **Modern `.docx` Office OpenXML**: Parses XML structures using PizZip/Docxtemplater, dynamically replaces date headers and body placeholders with today's date (`d MMMM yyyy`), and preserves all brand typography and tables.
- **Legacy `.doc` OLE Compound Binary**: Solved legacy binary `.doc` formatting (used by Satellite Line templates). Performs precision in-place byte replacement matching exact string lengths, avoiding OLE sector corruption or "Word cannot open document" errors.
- **Native Microsoft Cloud PDF Rendering**: Uses Microsoft Graph's native document conversion engine rather than third-party headless browsers or unformatted HTML-to-PDF tools. Guarantees 100% desktop Word fidelity, fonts, and pagination.

### D. SharePoint Cloud Archiving (`src/services/archiveService.js`)
- Authenticates against Microsoft Entra / SharePoint Graph drive API.
- Resolves templates dynamically from SharePoint template folders.
- Automatically archives finalized quote PDFs into their designated archive destinations:
  - `Price Lists sent Mobile Pumps`
  - `Price Lists sent - Satellite`
  - `Spider Boom Prices List sent`

### E. Outbound Email & HubSpot Deal Sync (`src/services/mailService.js`)
- Sends the finalized quote email directly from the sales mailbox via Microsoft Graph API.
- Attaches the newly generated PDF price list.
- **Load-Bearing Subject Line**: Employs the exact canonical naming convention:
  `BPA Price List - [Builder Name] - [Project Name]` (or `BPA Sattelite Price List - ...`), which triggers HubSpot's native deal-creation workflow without requiring direct write access to the CRM.
- BCCs the dedicated HubSpot inbox (`441687953@bcc.ap1.hubspot.com`) and Accounts.

### F. Multi-Touch Follow-Up Engine (`src/services/followUpService.js`)
- Schedules 4 standardized follow-up touches in Supabase upon every quote dispatch:
  - **Touch 1 (+7 days)**: Professional check-in email from BPA Sales Team.
  - **Touch 2 (+14 days)**: Executive check-in email from Chris Turner (Director).
  - **Touch 3 (+21 days)**: Phone call prompt logged for sales team follow-up.
  - **Touch 4 (+51 days)**: 30-day post-review re-engage / outcome prompt.
- Includes a daily automated cron (`0 22 * * *` = 8:00 AM AEST) to check and dispatch due touches.

### G. Live CRM Portal Integration & REST APIs
The backend exposes clean REST endpoints consumed by the front-end CRM dashboard:
- `GET /api/dashboard` — Overview statistics (Total Leads, Quotes Sent, Pending Follow-ups) and recent activity feeds.
- `GET /api/quotes/download` — Stream and download generated quote documents.
- `POST /api/quotes/generate-and-send` — Manual quote generation endpoint.
- `GET /api/profile` & `PUT /api/profile` — User profile management.
- `GET /api/settings` & `PUT /api/settings` — System credential and configuration status.
- `GET /api/webhook/recent` — Inspection endpoint for recent mailbox activity.
- `GET /` — Service health check.

---

## 3. Operational Safety Modes

To allow staged testing, dashboard reviews, and safe staging deployments before production VPS cutover, the engine includes built-in safety switches:

### 1. `ENABLE_AUTOMATION` (Default: `false`)
- **When `false` (Staging / Safe Mode)**:
  - All GET API endpoints remain **100% active** to feed the CRM Dashboard.
  - Background mailbox subscriptions and renewal crons are **paused**.
  - Follow-up dispatcher crons are **paused**.
  - Any webhook notifications received are acknowledged (HTTP 202) but not processed into live quotes.
- **When `true` (Production Mode)**:
  - Full automated end-to-end processing and cron dispatchers are active.

### 2. `DISPATCH_EMAILS` (Default: `false`)
- When set to `false`, the document generation, AI triage, and database persistence operate normally, but calls to Microsoft Graph's `/sendMail` endpoint are safely intercepted and logged as `[DRY RUN]`, ensuring no emails are sent to real clients during testing.

---

## 4. Project Structure

```
bpa-quote-engine/
├── src/
│   ├── app.js                     # Server entry point, route registration & cron setup
│   ├── config/
│   │   ├── env.js                 # Environment configuration loader
│   │   └── graph.js               # Microsoft Graph endpoints & scopes
│   ├── controllers/
│   │   ├── dashboardController.js # Aggregates stats, leads, quotes, and follow-ups
│   │   ├── mailboxController.js   # Main Graph webhook handler & full automation pipeline
│   │   ├── profileController.js   # User profile management API
│   │   ├── quoteController.js     # Manual quote generation & download controller
│   │   └── settingsController.js  # System integration settings API
│   ├── models/
│   │   └── quoteModel.js          # Joi schema validation for quote payloads
│   ├── routes/
│   │   ├── dashboardRoutes.js     # /api/dashboard router
│   │   ├── mailboxRoutes.js       # /api/webhook/mailbox & /recent router
│   │   ├── profileRoutes.js       # /api/profile router
│   │   ├── quoteRoutes.js         # /api/quotes router
│   │   └── settingsRoutes.js      # /api/settings router
│   └── services/
│       ├── archiveService.js      # SharePoint document lookup and quote archival
│       ├── classifyService.js     # Claude Haiku email triage and entity extraction
│       ├── documentService.js     # Word (.doc / .docx) date injection & Graph PDF conversion
│       ├── excelService.js        # SharePoint Excel "The Bible" logging integration
│       ├── followUpService.js     # Follow-up sequence generator & scheduled cron dispatcher
│       ├── graphAuth.js           # Azure AD / Microsoft Entra OAuth2 token manager
│       ├── hubspotService.js      # HubSpot deal stage mirroring & sync verification
│       ├── mailService.js         # Microsoft Graph outbound email sender & HTML builder
│       ├── mailboxService.js      # Microsoft Graph mailbox subscription & message fetcher
│       ├── namingService.js       # Canonical title and file naming engine
│       ├── parseService.js        # Heuristic / regex parser for EstimateOne, BCI, Direct
│       └── supabaseService.js     # Database persistence layer (leads, quotes, sends, follow-ups)
├── .env.example                   # Template of required environment variables
├── package.json                   # Dependencies and npm scripts
└── README.md                      # System documentation & architectural reference
```

---

## 5. Configuration & Environment Variables

Create a `.env` file based on `.env.example`:

| Variable | Description |
| :--- | :--- |
| `PORT` | Local server port (Default: `3000`) |
| `NODE_ENV` | Runtime environment (`development` / `production`) |
| `ENABLE_AUTOMATION` | Set `true` in production to activate live email listeners and crons |
| `DISPATCH_EMAILS` | Set `true` to allow outbound emails via Graph API; `false` for dry run |
| `PUBLIC_URL` | Public-facing domain (e.g. Render URL or ngrok) used for Graph webhooks |
| `AZURE_TENANT_ID` | Microsoft Entra / Azure AD Tenant ID |
| `AZURE_CLIENT_ID` | Azure App Registration Client ID (Application Permissions) |
| `AZURE_CLIENT_SECRET` | Azure App Registration Client Secret |
| `BPA_SALES_EMAIL` | Shared mailbox address (e.g. `sales@brisbanepumpaction.com.au`) |
| `GCPA_SALES_EMAIL` | GCPA sales mailbox address |
| `BPA_HUBSPOT_BCC` | Dedicated BCC logging address for HubSpot deals |
| `ACCOUNTS_BCC` | Accounts team BCC address |
| `BPA_DRIVE_ID` | SharePoint Site / Drive ID for BPA price list folders |
| `GCPA_DRIVE_ID` | SharePoint Site / Drive ID for GCPA price list folders |
| `ANTHROPIC_API_KEY` | Anthropic API key for Claude Haiku triage |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_KEY`| Supabase Service Role Key (full backend access) |
| `MAILBOX_CLIENT_STATE` | Secret token used to validate Graph webhook authenticity |
| `HUBSPOT_ACCESS_TOKEN` | HubSpot Private App Access Token (read-only verification) |
| `TARGET_DEAL_STAGE_IDS`| Comma-separated HubSpot deal stage IDs |
| `EXCEL_BIBLE_ITEM_ID` | SharePoint Item ID for the historical Excel log |

---

## 6. Running Locally

### Prerequisites
- Node.js `>= 20.x`
- npm or pnpm

### Installation
```bash
git clone <repo-url>
cd bpa-quote-engine
npm install
```

### Starting the Server
```bash
# Development mode (auto-restart with nodemon)
npm run dev

# Production start
npm start
```

### Local Webhook Testing (with ngrok)
If testing incoming Microsoft Graph notifications locally:
1. Start ngrok on port 3000:
   ```bash
   ngrok http 3000
   ```
2. Set `PUBLIC_URL` in `.env` to your HTTPS ngrok URL:
   ```env
   PUBLIC_URL="https://your-subdomain.ngrok-free.app"
   ```
3. Restart `npm run dev`. The server will register its webhook URL with Microsoft Graph on boot.
