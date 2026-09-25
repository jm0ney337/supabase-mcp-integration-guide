# Supabase MCP OAuth — validation harness

Validates `supabase-mcp-connect-flow-draft.md` (see `VALIDATION.md` for what
was confirmed/corrected) and builds a real, working reference implementation
of the flow it describes.

## Layout

- [`backend/`](backend) — client-agnostic OAuth connection broker, deployed
  to Vercel. Handles discovery, PKCE, dynamic client registration (with
  defensive re-registration around Supabase's stale-`client_id` bug), the
  authorize redirect, token exchange, and refresh. Exposes a small REST API
  (`/api/connections`, `/api/oauth/callback`, `/api/connections/:id/token`,
  `/api/connections/:id/refresh`) that has zero knowledge of MCP tool-calling
  or which agent SDK is on the other end — any frontend can drive the same
  endpoints (`dashboard/` today, a future TanStack app tomorrow).
- [`dashboard/`](dashboard) — Next.js demo UI, the reference client of that
  backend API. Opens straight onto a chat panel (Vercel AI Elements +
  `@ai-sdk/mcp`) for talking to the connected Supabase project, with a
  connectors pane behind the chat box's "+" (using Supabase's official
  "Connect Supabase" button) and a collapsible visualization of the OAuth
  sequence diagram from the partner guide.
- [`VALIDATION.md`](VALIDATION.md) — what in the draft was confirmed live,
  what was corrected, and what's still open.
- [`supabase-mcp-connect-flow-draft.md`](supabase-mcp-connect-flow-draft.md)
  — the original draft, unmodified.

## Storage

The backend's own connection/client state lives in a dedicated Supabase
project (`mcp-oauth-backend`, ref `bbdpvukyhgybtuxhzhnx`) — separate from
whatever Supabase project you actually authorize the MCP connection *to*.
See `backend/db/schema.sql`.

## Running it

```bash
# Backend
cd backend && npm install
cp .env.example .env   # fill in SUPABASE_SECRET_KEY, BACKEND_API_TOKEN, and DASHBOARD_URL
npx vercel dev           # http://localhost:3000

# Dashboard, in another terminal
cd dashboard && npm install
cp .env.example .env    # BACKEND_API_TOKEN must match the backend's; add ANTHROPIC_API_KEY
npm run dev              # http://localhost:3002
```

Clicking Connect in the dashboard opens a browser to Supabase's consent
screen — you'll need to be an **owner or admin** of the org you're
authorizing (see constraint #2 in the draft; the backend doesn't attempt to
work around this, it's a hard requirement of the current flow).

If `DASHBOARD_URL` isn't set on the backend, the OAuth callback falls back
to rendering a plain "Connected" page instead of redirecting back into the
dashboard — useful when driving the backend from something other than
`dashboard/`.

Deploying the backend to Vercel is a separate step (`vercel login` /
`vercel deploy` from `backend/`) — done with an explicit confirmation since
it publishes a public URL, not part of local iteration.
