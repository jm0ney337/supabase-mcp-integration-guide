// The one place OAuth and the agent meet: uses the AI SDK's own MCP client
// (@ai-sdk/mcp) rather than the Claude Agent SDK, so the chat UI can use AI
// Elements + useChat natively. Fetches a fresh token per request rather
// than caching one, so a long conversation survives token expiry via the
// backend's own refresh logic.
import { streamText, convertToModelMessages, stepCountIs, type UIMessage } from "ai"
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
    // Without this the run stops at the first step — the model emits its tool
    // calls and never gets a turn to write the answer from the results.
    stopWhen: stepCountIs(12),
    onFinish: async () => {
      await mcpClient.close()
    },
  })

  return result.toUIMessageStreamResponse({
    onError: (error) => (error instanceof Error ? error.message : String(error)),
  })
}
