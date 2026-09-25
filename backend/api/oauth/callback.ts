import type { VercelRequest, VercelResponse } from "@vercel/node"
import { completeAuthorization } from "../../lib/connections"

// Supabase redirects the user's browser here after they approve (or reject)
// the consent screen. No bearer auth on this route — Supabase can't attach
// our BACKEND_API_TOKEN header to a browser redirect.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { code, state, error, error_description } = req.query as Record<string, string | undefined>

  if (error) {
    res.status(400).send(htmlPage("Connection failed", error_description || error))
    return
  }

  if (!code || !state) {
    res.status(400).send(htmlPage("Connection failed", "Missing code or state in callback"))
    return
  }

  const result = await completeAuthorization(state, code)
  const connectionId = result.connectionId

  // If a dashboard is configured, hand the browser back to it instead of
  // rendering a static page — the dashboard reads the final status itself
  // via GET /api/connections/:id, so it works whether this succeeded or not.
  const dashboardUrl = process.env.DASHBOARD_URL
  if (dashboardUrl && connectionId) {
    res.redirect(302, `${dashboardUrl}/connections/${connectionId}`)
    return
  }

  if (!result.ok) {
    res.status(400).send(htmlPage("Connection failed", result.error ?? "Unknown error"))
    return
  }

  res.status(200).send(htmlPage("Connected", "You can close this tab and return to the terminal."))
}

function htmlPage(title: string, message: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head>
<body style="font-family: system-ui; padding: 2rem;">
<h1>${escapeHtml(title)}</h1>
<p>${escapeHtml(message)}</p>
</body></html>`
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!)
}
