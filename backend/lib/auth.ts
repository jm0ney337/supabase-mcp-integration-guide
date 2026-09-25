import type { VercelRequest, VercelResponse } from "@vercel/node"

/** This backend is a single-operator reference implementation, not a
 * multi-tenant product — one shared secret is the right amount of auth for
 * every route except the OAuth callback, which Supabase itself calls and
 * can't attach our bearer token to. */
export function requireBackendAuth(req: VercelRequest, res: VercelResponse): boolean {
  const expected = process.env.BACKEND_API_TOKEN
  if (!expected) {
    res.status(500).json({ error: "BACKEND_API_TOKEN is not configured" })
    return false
  }
  const header = req.headers["authorization"]
  const token = typeof header === "string" ? header.replace(/^Bearer\s+/i, "") : undefined
  if (token !== expected) {
    res.status(401).json({ error: "Unauthorized" })
    return false
  }
  return true
}
