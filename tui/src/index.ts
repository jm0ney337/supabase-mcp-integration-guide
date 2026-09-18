#!/usr/bin/env node
import "dotenv/config"
import * as p from "@clack/prompts"
import open from "open"
import { BackendClient } from "./backend-client"
import { runTestQuery } from "./agent"

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
  const query = params.toString()
  const mcpUrl = query ? `https://mcp.supabase.com/mcp?${query}` : "https://mcp.supabase.com/mcp"

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

  const { accessToken } = await client.getToken(connectionId)

  const action = await p.select({
    message: "What next?",
    options: [
      { value: "query", label: "Run a test query via the Claude Agent SDK" },
      { value: "refresh", label: "Force a token refresh (confirms rotation, draft §6.2)" },
      { value: "revoke", label: "Revoke this connection" },
      { value: "exit", label: "Exit" },
    ],
  })
  if (p.isCancel(action)) bail("Cancelled")

  if (action === "query") {
    await runTestQuery(accessToken, mcpUrl, "List the tables in this Supabase project.")
  } else if (action === "refresh") {
    const { accessToken: refreshed } = await client.refresh(connectionId)
    p.log.success(`Refreshed. Access token changed: ${refreshed !== accessToken}`)
  } else if (action === "revoke") {
    await client.revoke(connectionId)
    p.log.success("Revoked.")
  }

  p.outro("Done")
}

main().catch((err) => {
  p.log.error(err instanceof Error ? err.stack ?? err.message : String(err))
  process.exit(1)
})
