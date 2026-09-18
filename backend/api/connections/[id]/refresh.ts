import type { VercelRequest, VercelResponse } from "@vercel/node"
import { requireBackendAuth } from "../../../lib/auth"
import { ConnectionError, forceRefresh } from "../../../lib/connections"

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireBackendAuth(req, res)) return
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" })
    return
  }

  const id = req.query.id
  if (typeof id !== "string") {
    res.status(400).json({ error: "Missing connection id" })
    return
  }

  try {
    const { accessToken, expiresAt } = await forceRefresh(id)
    res.status(200).json({ accessToken, expiresAt })
  } catch (err) {
    if (err instanceof ConnectionError) {
      const status = err.code === "not_found" ? 404 : err.code === "stale_client" ? 409 : 400
      res.status(status).json({ error: err.message, code: err.code })
      return
    }
    res.status(502).json({ error: err instanceof Error ? err.message : String(err) })
  }
}
