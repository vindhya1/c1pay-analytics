import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { readFileSync } from "fs";
import { resolve } from "path";

const mcpConfig = JSON.parse(
  readFileSync(resolve(process.cwd(), ".mcp.json"), "utf-8")
);
const serverConfig = mcpConfig.mcpServers["c1pay-db"];

// Singleton — reused across requests in the same Next.js process
declare global {
  // eslint-disable-next-line no-var
  var __mcpClient: Client | undefined;
}

async function getClient(): Promise<Client> {
  if (global.__mcpClient) return global.__mcpClient;

  const transport = new StdioClientTransport({
    command: serverConfig.command,
    args: serverConfig.args,
  });

  const client = new Client({ name: "c1pay-analytics", version: "1.0.0" });
  await client.connect(transport);

  global.__mcpClient = client;
  return client;
}

type ToolResult = string | number | boolean | object | null;

export async function callTool(name: string, args: Record<string, unknown> = {}): Promise<ToolResult> {
  const client = await getClient();
  const result = await client.callTool({ name, arguments: args });

  const text = (result.content as { type: string; text: string }[])
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("\n");

  // Try to parse as JSON for structured data; fall back to raw string
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
