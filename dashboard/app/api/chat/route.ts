// The one place OAuth and the agent meet, ported to the AI SDK's own MCP
// client (@ai-sdk/mcp) instead of the Claude Agent SDK the TUI uses (see
// tui/src/agent.ts) — this is what lets the chat UI use AI Elements +
// useChat natively. Always fetches a fresh token per request, same as
// tui/src/index.ts's repl() does before every command.
import { streamText, convertToModelMessages, type UIMessage } from "ai"
import { anthropic } from "@ai-sdk/anthropic"
import { createMCPClient } from "@ai-sdk/mcp"
import { getConnection, getConnectionToken } from "@/lib/backend"

export const maxDuration = 60

export async function POST(req: Request) {
  const { messages, connectionId }: { messages: UIMessage[]; connectionId?: string } = await req.json()

  if (!connectionId) {
    return new Response("Missing connectionId", { status: 400 })
  }

  let connection: Awaited<ReturnType<typeof getConnection>>
  try {
    connection = await getConnection(connectionId)
  } catch (err) {
    return new Response(err instanceof Error ? err.message : String(err), { status: 502 })
  }

  if (connection.status !== "authorized") {
    return new Response(`Connection is not authorized (status: ${connection.status})`, { status: 409 })
  }

  const { accessToken } = await getConnectionToken(connectionId)

  const mcpClient = await createMCPClient({
    transport: {
      type: "http",
      url: connection.mcpUrl,
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  })

  const tools = await mcpClient.tools()

  const result = streamText({
    model: anthropic("claude-sonnet-5"),
    system:
      "You are a helpful assistant answering questions about the user's connected Supabase project. Use the available MCP tools to inspect the project (tables, config, logs, etc.) before answering factual questions. Be concise.",
    messages: await convertToModelMessages(messages, { tools }),
    tools,
    onFinish: async () => {
      await mcpClient.close()
    },
  })

  return result.toUIMessageStreamResponse({
    onError: (error) => (error instanceof Error ? error.message : String(error)),
  })
}
