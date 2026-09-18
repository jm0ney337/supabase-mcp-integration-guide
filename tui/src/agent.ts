// Runs one test query through the Claude Agent SDK against the Supabase MCP
// server, using a token this process fetched from our OAuth backend. This is
// the only point where the OAuth code and the Agent SDK meet — see
// VALIDATION.md corrections #2 and #3 for why the error handling here checks
// two separate things, not just isError.
import { query } from "@anthropic-ai/claude-agent-sdk"
import { createRequire } from "node:module"

function installedSdkVersion(): string {
  try {
    const require = createRequire(import.meta.url)
    return require("@anthropic-ai/claude-agent-sdk/package.json").version
  } catch {
    return "unknown"
  }
}

export async function runTestQuery(accessToken: string, mcpUrl: string, prompt: string): Promise<void> {
  console.log(
    `Using @anthropic-ai/claude-agent-sdk@${installedSdkVersion()} — if every tool call 406s, check this against claude-agent-sdk-typescript#202 before assuming the OAuth code is wrong (see VALIDATION.md).`
  )

  const options = {
    mcpServers: {
      supabase: {
        type: "http" as const,
        url: mcpUrl,
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    },
    allowedTools: ["mcp__supabase__*"],
  }

  for await (const message of query({ prompt, options }) as AsyncIterable<any>) {
    if (message.type === "system" && message.subtype === "init") {
      const unusable = (message.mcp_servers ?? []).filter(
        (s: any) => s.status === "failed" || s.status === "needs-auth"
      )
      if (unusable.length > 0) {
        console.warn("MCP server(s) not usable — the run continues without their tools:", unusable)
      }
    }

    if (message.type === "assistant") {
      for (const block of message.message.content ?? []) {
        if (block.type === "tool_use" && typeof block.name === "string" && block.name.startsWith("mcp__")) {
          console.log("Calling tool:", block.name)
        }
      }
    }

    // Tool results come back as content blocks inside a "user" message, not
    // as a top-level "tool_result" message type (draft's §4/§6 code assumed
    // the latter — corrected in VALIDATION.md).
    if (message.type === "user") {
      const content = message.message?.content
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === "tool_result" && block.is_error) {
            console.warn("Tool call returned isError:", block)
          }
        }
      }
    }

    if (message.type === "result") {
      if (message.subtype === "success") {
        console.log("\nResult:\n" + message.result)
      } else {
        console.error("Run ended without success:", message)
      }
    }
  }
}
