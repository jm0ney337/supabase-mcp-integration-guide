#!/usr/bin/env node
import "dotenv/config"
import * as p from "@clack/prompts"
import open from "open"
import { BackendClient } from "./backend-client"
import { runAgentPrompt } from "./agent"

function bail(message: string): never {
  p.cancel(message)
  process.exit(1)
}

async function textOrEnv(envVar: string, opts: Parameters<typeof p.text>[0]) {
  const fromEnv = process.env[envVar]
  if (fromEnv) return fromEnv
  const value = await p.text(opts)
  if (p.isCancel(value)) bail("Cancelled")
  return value as string
}

const HELP = `Commands:
  /tools              list the Supabase MCP tools available on this connection
  /call <tool> [json] call one tool directly, e.g. /call list_tables {}
                      (tool name can be short, e.g. "list_tables", or fully
                      qualified, e.g. "mcp__supabase__list_tables")
  /ask <question>     free-form prompt — Claude picks whatever tool(s) it needs
  /refresh            force a token refresh (confirms rotation, draft §6.2)
  /revoke             revoke this connection and exit
  /help               show this again
  /exit               quit

Anything typed without a leading "/" is treated as /ask.`

/** Runs the interactive slash-command loop once a connection is authorized.
 * Fetches a fresh token from the backend before every call (rather than
 * reusing one captured at authorize time) so a long sampling session
 * survives token expiry via the backend's own refresh logic. */
async function repl(client: BackendClient, connectionId: string, mcpUrl: string) {
  let cachedTools: string[] = []

  p.log.info(`Connected. Type /help for commands.`)

  while (true) {
    const raw = await p.text({ message: "›", placeholder: "/help" })
    if (p.isCancel(raw)) break
    const input = raw.trim()
    if (!input) continue

    if (input === "/exit" || input === "/quit") break

    if (input === "/help") {
      p.note(HELP, "Help")
      continue
    }

    if (input === "/refresh") {
      const s = p.spinner()
      s.start("Refreshing")
      try {
        const { accessToken: before } = await client.getToken(connectionId)
        const { accessToken: after } = await client.refresh(connectionId)
        s.stop(`Refreshed. Access token changed: ${before !== after}`)
      } catch (err) {
        s.stop("Refresh failed", 1)
        p.log.error(err instanceof Error ? err.message : String(err))
      }
      continue
    }

    if (input === "/revoke") {
      await client.revoke(connectionId)
      p.log.success("Revoked.")
      break
    }

    if (input === "/tools") {
      if (cachedTools.length === 0) {
        const s = p.spinner()
        s.start("Discovering tools")
        try {
          const { accessToken } = await client.getToken(connectionId)
          cachedTools = await runAgentPrompt(accessToken, mcpUrl, "Don't call any tools — just say ready.")
          s.stop(`Found ${cachedTools.length} tool(s)`)
        } catch (err) {
          s.stop("Discovery failed", 1)
          p.log.error(err instanceof Error ? err.message : String(err))
          continue
        }
      }
      p.note(cachedTools.join("\n") || "(none)", "Available tools")
      continue
    }

    if (input.startsWith("/call ") || input.startsWith("/ask ")) {
      const isCall = input.startsWith("/call ")
      const rest = input.slice(isCall ? "/call ".length : "/ask ".length).trim()
      if (!rest) {
        p.log.warn(isCall ? "Usage: /call <tool> [json args]" : "Usage: /ask <question>")
        continue
      }

      let prompt: string
      let allowedTools: string[] | undefined
      if (isCall) {
        const [toolArg, ...jsonParts] = rest.split(" ")
        const toolName = toolArg.startsWith("mcp__") ? toolArg : `mcp__supabase__${toolArg}`
        const argsJson = jsonParts.join(" ") || "{}"
        prompt = `Call the tool \`${toolName}\` with arguments ${argsJson}. Show the raw result, don't summarize it.`
        allowedTools = [toolName]
      } else {
        prompt = rest
      }

      try {
        const { accessToken } = await client.getToken(connectionId)
        const tools = await runAgentPrompt(accessToken, mcpUrl, prompt, allowedTools)
        if (tools.length > 0) cachedTools = tools
      } catch (err) {
        p.log.error(err instanceof Error ? err.message : String(err))
      }
      continue
    }

    if (input.startsWith("/")) {
      p.log.warn(`Unknown command: ${input}. Type /help for options.`)
      continue
    }

    // Bare text — shorthand for /ask.
    try {
      const { accessToken } = await client.getToken(connectionId)
      const tools = await runAgentPrompt(accessToken, mcpUrl, input)
      if (tools.length > 0) cachedTools = tools
    } catch (err) {
      p.log.error(err instanceof Error ? err.message : String(err))
    }
  }
}

async function main() {
  p.intro("Supabase MCP OAuth — connect & test")

  const backendUrl = await textOrEnv("BACKEND_URL", {
    message: "Backend base URL",
    initialValue: "http://localhost:3000",
  })
  const token = await textOrEnv("BACKEND_API_TOKEN", { message: "Backend API token" })

  p.note(
    "Only an org OWNER or ADMIN can complete this flow today. A non-admin role gets a 403 at the authorize step — that's a hard requirement of Supabase's current OAuth flow, not a role you can grant your way around.",
    "Before you continue"
  )

  const projectRefRaw = await p.text({
    message: "project_ref (optional — scopes the connection to one project)",
    defaultValue: "",
  })
  if (p.isCancel(projectRefRaw)) bail("Cancelled")

  const readOnly = await p.confirm({ message: "read_only?", initialValue: true })
  if (p.isCancel(readOnly)) bail("Cancelled")

  const params = new URLSearchParams()
  if (projectRefRaw) params.set("project_ref", String(projectRefRaw))
  if (readOnly) params.set("read_only", "true")
  const search = params.toString()
  const mcpUrl = search ? `https://mcp.supabase.com/mcp?${search}` : "https://mcp.supabase.com/mcp"

  const client = new BackendClient(backendUrl, token)

  const s = p.spinner()
  s.start("Starting connection")
  const { connectionId, authorizeUrl } = await client.startConnection(mcpUrl)
  s.stop(`Connection ${connectionId} created`)

  p.note(authorizeUrl, "Opening your browser for Supabase login/consent (use this URL if it doesn't open)")
  await open(authorizeUrl)

  s.start("Waiting for authorization")
  let status = "pending"
  let errorMessage: string | null = null
  while (status === "pending") {
    await new Promise((r) => setTimeout(r, 2000))
    const conn = await client.getConnection(connectionId)
    status = conn.status
    errorMessage = conn.errorMessage
  }

  if (status !== "authorized") {
    s.stop("Failed", 1)
    bail(errorMessage ?? `Connection ended in status: ${status}`)
  }
  s.stop("Authorized")

  await repl(client, connectionId, mcpUrl)

  p.outro("Done")
}

main().catch((err) => {
  p.log.error(err instanceof Error ? err.stack ?? err.message : String(err))
  process.exit(1)
})
