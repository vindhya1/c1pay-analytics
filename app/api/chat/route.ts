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
          },
          limit: { type: "number", description: "Max results (default 100)" },
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
        const args = JSON.parse(tc.function.arguments) as Record<string, unknown>;
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
}
