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
  or the Claude Agent SDK — any frontend (this repo's TUI today, a TanStack
  app later) drives the same endpoints.
- [`tui/`](tui) — local CLI, the first client of that API. Drives
  setup/auth end to end and runs one test query through
  `@anthropic-ai/claude-agent-sdk` using the token the backend hands back.
- [`dashboard/`](dashboard) — Next.js demo UI, a second client of the same
  backend API. A connectors screen with a "Connect" redirect button, a chat
  panel (Vercel AI Elements + `@ai-sdk/mcp`) to talk to the connected
  Supabase project, and a collapsible visualization of the OAuth sequence
  diagram from the partner guide.
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
cp .env.example .env   # fill in SUPABASE_SECRET_KEY and BACKEND_API_TOKEN
npx vercel dev           # http://localhost:3000

# TUI, in another terminal
cd tui && npm install
cp .env.example .env    # BACKEND_API_TOKEN must match the backend's
npm start

# Dashboard, in a third terminal
cd dashboard && npm install
cp .env.example .env    # BACKEND_API_TOKEN must match the backend's; add ANTHROPIC_API_KEY
npm run dev              # http://localhost:3002
```

To have the OAuth callback land back on the dashboard instead of the TUI's
plain-text success page, also set `DASHBOARD_URL=http://localhost:3002` in
the backend's `.env` before running `vercel dev`.

The TUI will open a browser to Supabase's consent screen — you'll need to
be an **owner or admin** of the org you're authorizing (see constraint #2 in
the draft; the backend doesn't attempt to work around this, it's a hard
requirement of the current flow).

Deploying the backend to Vercel is a separate step (`vercel login` /
`vercel deploy` from `backend/`) — done with an explicit confirmation since
it publishes a public URL, not part of local iteration.
