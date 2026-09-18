import type { VercelRequest, VercelResponse } from "@vercel/node"
import { requireBackendAuth } from "../../lib/auth"
import { getConnection } from "../../lib/db"
import { ConnectionError, revokeConnection } from "../../lib/connections"

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireBackendAuth(req, res)) return
  const id = req.query.id
  if (typeof id !== "string") {
    res.status(400).json({ error: "Missing connection id" })
    return
  }

  if (req.method === "GET") {
    const connection = await getConnection(id)
    if (!connection) {
      res.status(404).json({ error: "Connection not found" })
      return
    }
    // Deliberately no access_token/refresh_token here — see /token route.
    res.status(200).json({
      id: connection.id,
      mcpUrl: connection.mcp_url,
      status: connection.status,
      errorMessage: connection.error_message,
    })
    return
  }

  if (req.method === "DELETE") {
    try {
      await revokeConnection(id)
      res.status(200).json({ status: "revoked" })
    } catch (err) {
      if (err instanceof ConnectionError && err.code === "not_found") {
        res.status(404).json({ error: err.message })
        return
      }
      res.status(502).json({ error: err instanceof Error ? err.message : String(err) })
    }
    return
  }

  res.status(405).json({ error: "Method not allowed" })
}
