# c1pay Analytics

An internal analytics dashboard and AI chat interface for the c1pay payment platform. Built with Next.js 16, powered by Groq (Llama 3.3 70B), and connected to the c1pay PostgreSQL database through an MCP server.

---

## How It Works

This app never connects to the database directly. Instead, it talks to a separate **MCP server** (`postgres-db-mcp-server`) that owns all database access. Here is the exact flow:

### Dashboard (`/dashboard`)

```
Browser opens localhost:3000/dashboard
  │
  ├── Next.js serves app/dashboard/page.tsx (React UI)
  │
  └── Page calls fetch("/api/dashboard") on load (and every 10s if auto-refresh is on)
        │
        └── app/api/dashboard/route.ts
              │   (no SQL here — only tool names)
              │
              └── lib/mcp-client.ts
                    │
                    ├── Reads .mcp.json to get the server command + args
                    ├── On first request: spawns postgres-db-mcp-server as a child process
                    │     command: node postgres-db-mcp-server/src/index.js
                    ├── MCP handshake over stdin/stdout (JSON-RPC)
                    ├── Stores client as a singleton (reused for all future requests)
                    │
                    └── Calls these named tools in parallel:
                          ├── get_dashboard_summary         → KPI cards (users, volume, pending)
                          ├── get_payment_requests_summary_by_status → donut chart
                          ├── get_transaction_volume_by_day → bar chart (last 30 days)
                          ├── get_top_users_by_balance      → horizontal bar chart
                          ├── get_user_registrations_by_day → line chart (last 30 days)
                          └── get_transaction_history       → recent transactions table
                                │
                                └── postgres-db-mcp-server/src/index.js
                                      │   (all SQL lives here)
                                      └── pg Pool → PostgreSQL (c1pay database)
```

**Result:** JSON flows back up the chain → Recharts renders it as graphs in the browser.

---

### AI Chat (`/chat`)

```
User types a question in the browser
  │
  └── app/chat/page.tsx calls POST /api/chat with the message history
        │
        └── app/api/chat/route.ts
              │
              ├── Sends messages to Groq API (Llama 3.3 70B)
              │     with tool definitions (get_user_details, query, get_recent_users, etc.)
              │
              ├── Groq decides which tool(s) to call based on the question
              │
              ├── route.ts calls those tools via lib/mcp-client.ts
              │     (same MCP client, same singleton child process)
              │
              ├── Tool results go back to Groq as context
              │
              └── Groq generates a human-readable answer
                    │
                    └── Displayed as a chat message in the browser
```

Groq runs the agentic loop (up to 10 iterations) — it can call multiple tools in sequence if the question requires it.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Browser                              │
│   localhost:3000/dashboard    localhost:3000/chat       │
└──────────────────┬──────────────────┬───────────────────┘
                   │                  │
┌──────────────────▼──────────────────▼───────────────────┐
│              Next.js App (this repo)                    │
│                                                         │
│  app/dashboard/page.tsx    app/chat/page.tsx            │
│         │                        │                      │
│  app/api/dashboard/route.ts  app/api/chat/route.ts      │
│         │                        │                      │
│         └──────────┬─────────────┘                      │
│                    │                                     │
│           lib/mcp-client.ts                             │
│           (reads .mcp.json)                             │
└────────────────────┬────────────────────────────────────┘
                     │ stdin/stdout (JSON-RPC)
                     │ child process
┌────────────────────▼────────────────────────────────────┐
│         postgres-db-mcp-server (separate repo)          │
│                                                         │
│  Tools: get_dashboard_summary, get_transaction_history  │
│         get_transaction_volume_by_day                   │
│         get_top_users_by_balance                        │
│         get_user_registrations_by_day                   │
│         get_payment_requests_summary_by_status          │
│         get_user_details, get_recent_users              │
│         get_payment_requests_by_status, query, ...      │
└────────────────────┬────────────────────────────────────┘
                     │ pg Pool
┌────────────────────▼────────────────────────────────────┐
│              PostgreSQL — c1pay database                │
│         tables: users, transactions, payment_requests   │
└─────────────────────────────────────────────────────────┘
```

---

## Key Design Decisions

**No SQL in Next.js** — The Next.js app contains zero SQL queries. All database logic lives in the MCP server. To add a new query, add a new tool to `postgres-db-mcp-server/src/index.js`.

**No DB credentials in Next.js** — The app has no Postgres host, port, username, or password. Only `.mcp.json` is referenced, which points to the MCP server binary.

**MCP client is a singleton** — `lib/mcp-client.ts` spawns the MCP server once and reuses the connection for all requests. The child process stays alive for the lifetime of the Next.js process.

**MCP config from `.mcp.json`** — The server command and args are read from `.mcp.json` at startup. To point to a different MCP server, update `.mcp.json` — no code changes needed.

**Groq for AI chat** — The chat uses Groq's OpenAI-compatible API with `llama-3.3-70b-versatile`. Groq is chosen for its speed. The model decides which MCP tools to call based on the user's question.

---

## Project Structure

```
c1pay-analytics/
├── .mcp.json                      # MCP server config (command + path)
├── .env.local                     # GROQ_API_KEY
│
├── app/
│   ├── dashboard/
│   │   └── page.tsx               # Dashboard UI (charts, KPI cards)
│   ├── chat/
│   │   └── page.tsx               # AI chat UI
│   └── api/
│       ├── dashboard/
│       │   └── route.ts           # Calls MCP tools, returns JSON to dashboard
│       └── chat/
│           └── route.ts           # Groq agentic loop + MCP tool execution
│
└── lib/
    └── mcp-client.ts              # Spawns MCP server, exposes callTool()
```

---

## Running Locally

**Prerequisites:**
- Node.js 20+
- `postgres-db-mcp-server` repo cloned and path set in `.mcp.json`
- PostgreSQL running with the `c1pay` database
- Groq API key

**Setup:**
```bash
npm install
```

Create `.env.local`:
```
GROQ_API_KEY=your_groq_api_key
```

**Run:**
```bash
npm run dev
```

| URL | Description |
|---|---|
| `localhost:3000/dashboard` | Analytics dashboard with live charts |
| `localhost:3000/chat` | AI chat — ask questions about your data |
