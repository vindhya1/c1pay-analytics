import { NextRequest } from "next/server";
import OpenAI from "openai";
import { Pool } from "pg";

const client = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

const pool = new Pool({
  host: "localhost",
  port: 5432,
  database: "c1pay",
  user: process.env.PGUSER || process.env.USER,
});

const tools: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "query",
      description: "Run a read-only SQL SELECT query against the c1pay database",
      parameters: {
        type: "object",
        properties: {
          sql: { type: "string", description: "The SQL SELECT query to execute" },
        },
        required: ["sql"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_tables",
      description: "List all tables in the c1pay database",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_dashboard_summary",
      description: "Get a high-level summary: total users, total transaction volume, pending payment requests",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_recent_users",
      description: "List users who registered recently, ordered newest first",
      parameters: {
        type: "object",
        properties: {
          days: { type: "number", description: "Only users within this many days (omit for all)" },
          limit: { type: "number", description: "Max results (default 20)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_transaction_history",
      description: "List recent transactions with sender/recipient usernames and amounts",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Max results (default 50)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_user_details",
      description: "Get full profile for a user by username or user ID, including balance and transaction history",
      parameters: {
        type: "object",
        properties: {
          identifier: { type: "string", description: "Username or numeric user ID" },
        },
        required: ["identifier"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_payment_requests_by_status",
      description: "List payment requests filtered by status",
      parameters: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["PENDING", "PAID", "DECLINED", "CANCELLED"],
            description: "Status to filter by",
          },
          limit: { type: "number", description: "Max results (default 100)" },
        },
        required: ["status"],
      },
    },
  },
];

async function executeTool(name: string, args: Record<string, unknown>): Promise<string> {
  try {
    switch (name) {
      case "query": {
        const sql = args.sql as string;
        const trimmed = sql.trim().toLowerCase();
        if (!trimmed.startsWith("select") && !trimmed.startsWith("with")) {
          return "Only SELECT (and WITH) queries are allowed.";
        }
        const result = await pool.query(sql);
        return result.rows.length === 0
          ? "Query returned no rows."
          : JSON.stringify(result.rows, null, 2);
      }
      case "list_tables": {
        const result = await pool.query(
          `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`
        );
        return JSON.stringify(result.rows.map((r) => r.table_name));
      }
      case "get_dashboard_summary": {
        const [users, txns, pending] = await Promise.all([
          pool.query(`SELECT COUNT(*) AS total_users, ROUND(SUM(balance_cents)/100.0,2) AS total_balance_dollars FROM users`),
          pool.query(`SELECT COUNT(*) AS total_transactions, ROUND(SUM(amount_cents)/100.0,2) AS total_volume_dollars FROM transactions`),
          pool.query(`SELECT COUNT(*) AS pending_requests, ROUND(SUM(amount_cents)/100.0,2) AS pending_dollars FROM payment_requests WHERE status = 'PENDING'`),
        ]);
        return JSON.stringify({
          users: users.rows[0],
          transactions: txns.rows[0],
          pending_payment_requests: pending.rows[0],
        }, null, 2);
      }
      case "get_recent_users": {
        const limit = (args.limit as number) || 20;
        const days = args.days as number | undefined;
        const dateFilter = days ? `AND created_at >= NOW() - INTERVAL '${parseInt(String(days))} days'` : "";
        const result = await pool.query(
          `SELECT id, username, ROUND(balance_cents/100.0,2) AS balance_dollars, created_at
           FROM users WHERE 1=1 ${dateFilter} ORDER BY created_at DESC LIMIT $1`,
          [limit]
        );
        return result.rows.length === 0 ? "No users found." : JSON.stringify(result.rows, null, 2);
      }
      case "get_transaction_history": {
        const limit = (args.limit as number) || 50;
        const result = await pool.query(
          `SELECT t.id, s.username AS sender, r.username AS recipient,
                  ROUND(t.amount_cents/100.0,2) AS amount_dollars, t.note, t.created_at
           FROM transactions t
           JOIN users s ON s.id = t.sender_id
           JOIN users r ON r.id = t.recipient_id
           ORDER BY t.created_at DESC LIMIT $1`,
          [limit]
        );
        return result.rows.length === 0 ? "No transactions found." : JSON.stringify(result.rows, null, 2);
      }
      case "get_user_details": {
        const identifier = args.identifier as string;
        const isId = /^\d+$/.test(identifier.trim());
        const userResult = await pool.query(
          `SELECT id, username, ROUND(balance_cents/100.0,2) AS balance_dollars, created_at
           FROM users WHERE ${isId ? "id = $1" : "username ILIKE $1"}`,
          [isId ? Number(identifier) : identifier]
        );
        if (userResult.rows.length === 0) return `User "${identifier}" not found.`;
        const user = userResult.rows[0];
        const [sent, received] = await Promise.all([
          pool.query(
            `SELECT r.username AS recipient, ROUND(t.amount_cents/100.0,2) AS amount_dollars, t.note, t.created_at
             FROM transactions t JOIN users r ON r.id = t.recipient_id WHERE t.sender_id = $1 ORDER BY t.created_at DESC LIMIT 10`,
            [user.id]
          ),
          pool.query(
            `SELECT s.username AS sender, ROUND(t.amount_cents/100.0,2) AS amount_dollars, t.note, t.created_at
             FROM transactions t JOIN users s ON s.id = t.sender_id WHERE t.recipient_id = $1 ORDER BY t.created_at DESC LIMIT 10`,
            [user.id]
          ),
        ]);
        return JSON.stringify({ user, transactions_sent: sent.rows, transactions_received: received.rows }, null, 2);
      }
      case "get_payment_requests_by_status": {
        const limit = (args.limit as number) || 100;
        const result = await pool.query(
          `SELECT pr.id, req.username AS requester, rec.username AS recipient,
                  ROUND(pr.amount_cents/100.0,2) AS amount_dollars, pr.note, pr.status, pr.created_at
           FROM payment_requests pr
           JOIN users req ON req.id = pr.requester_id
           JOIN users rec ON rec.id = pr.recipient_id
           WHERE pr.status = $1 ORDER BY pr.created_at DESC LIMIT $2`,
          [args.status, limit]
        );
        return result.rows.length === 0
          ? `No ${args.status} payment requests found.`
          : JSON.stringify(result.rows, null, 2);
      }
      default:
        return `Unknown tool: ${name}`;
    }
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

export async function POST(request: NextRequest) {
  const { messages } = await request.json();

  const systemPrompt = `You are an analytics assistant for c1pay, a payment application.
You have access to the c1pay PostgreSQL database containing users, transactions, and payment requests.
Use the available tools to answer questions about the data. Present numbers clearly (e.g. "$1,234.56" for dollar amounts).
Be concise and helpful.`;

  const chatMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...messages,
  ];

  // Agentic loop — Grok calls tools until it produces a final text response
  for (let i = 0; i < 10; i++) {
    const response = await client.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: chatMessages,
      tools,
      tool_choice: "auto",
    });

    const message = response.choices[0].message;
    chatMessages.push(message);

    if (!message.tool_calls || message.tool_calls.length === 0) {
      return Response.json({ content: message.content });
    }

    // Execute all tool calls in parallel
    const toolResults = await Promise.all(
      message.tool_calls.map(async (tc) => {
        const args = JSON.parse(tc.function.arguments) as Record<string, unknown>;
        const result = await executeTool(tc.function.name, args);
        return {
          role: "tool" as const,
          tool_call_id: tc.id,
          content: result,
        };
      })
    );

    chatMessages.push(...toolResults);
  }

  return Response.json({ content: "Sorry, I could not complete that request." }, { status: 500 });
}
