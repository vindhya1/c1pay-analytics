import { NextRequest } from "next/server";
import OpenAI from "openai";
import { callTool } from "@/lib/mcp-client";

const client = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

const tools: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "query",
      description: "Run any read-only SQL SELECT query against the c1pay database. Tables: users (id, username, balance_cents, created_at), transactions (id, sender_id, recipient_id, amount_cents, note, created_at), payment_requests (id, requester_id, recipient_id, amount_cents, note, status, created_at). Use this for any time-range or custom filter questions.",
      parameters: {
        type: "object",
        properties: {
          sql: { type: "string", description: "A valid SQL SELECT query" },
        },
        required: ["sql"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_dashboard_summary",
      description: "Get totals: number of users, transaction volume, payment request counts by status",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_recent_users",
      description: "List the 20 most recently registered users with their balance",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_transaction_history",
      description: "List the 50 most recent transactions with sender, recipient, and amount",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_user_details",
      description: "Get full profile for a specific user: balance, sent and received transactions, payment requests",
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
          status: { type: "string", description: "One of: PENDING, PAID, DECLINED, CANCELLED" },
        },
        required: ["status"],
      },
    },
  },
];

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

  try {
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

    const toolResults = await Promise.all(
      message.tool_calls.map(async (tc) => {
        const raw = (tc.function.arguments ? JSON.parse(tc.function.arguments) : {}) as Record<string, unknown>;
        // Coerce string numbers to real numbers (Groq sometimes generates "30" instead of 30)
        const args = Object.fromEntries(
          Object.entries(raw ?? {}).map(([k, v]) => [k, typeof v === "string" && /^\d+$/.test(v) ? parseInt(v) : v])
        );
        let result: string;
        try {
          const data = await callTool(tc.function.name, args);
          result = typeof data === "string" ? data : JSON.stringify(data, null, 2);
        } catch (err) {
          result = `Error: ${(err as Error).message}`;
        }
        return { role: "tool" as const, tool_call_id: tc.id, content: result };
      })
    );

    chatMessages.push(...toolResults);
  }

  return Response.json({ content: "Sorry, I could not complete that request." }, { status: 500 });
  } catch (err: unknown) {
    const msg = (err as Error).message ?? "Unknown error";
    // Log full error for debugging
    console.error("Chat error:", JSON.stringify(err, Object.getOwnPropertyNames(err as object)));
    return Response.json({ content: `Error: ${msg}` }, { status: 500 });
  }
}
