import type { VercelRequest, VercelResponse } from "@vercel/node"
import { requireBackendAuth } from "../../lib/auth"
import { startConnection } from "../../lib/connections"
import { listConnections } from "../../lib/db"

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireBackendAuth(req, res)) return

  if (req.method === "POST") {
    const { mcpUrl } = req.body ?? {}
    if (typeof mcpUrl !== "string" || !mcpUrl) {
      res.status(400).json({ error: "mcpUrl is required" })
      return
    }
    const redirectUri = process.env.OAUTH_REDIRECT_URI
    if (!redirectUri) {
      res.status(500).json({ error: "OAUTH_REDIRECT_URI is not configured" })
      return
    }
    try {
      const result = await startConnection(mcpUrl, redirectUri)
      res.status(201).json(result)
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : String(err) })
    }
    return
  }

  if (req.method === "GET") {
    const rows = await listConnections()
    res.status(200).json({
      connections: rows.map((r) => ({ id: r.id, mcpUrl: r.mcp_url, status: r.status, errorMessage: r.error_message })),
    })
    return
  }

  res.status(405).json({ error: "Method not allowed" })
}
