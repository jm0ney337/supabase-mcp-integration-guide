# Validation notes on `supabase-mcp-connect-flow-draft.md`

Checked live, 2026-09-18, against production endpoints and current
Anthropic docs, ahead of building `backend/` and `tui/`. This file only
*adds* observations — the original draft is left untouched.

## Confirmed as written

- `https://mcp.supabase.com/.well-known/oauth-protected-resource/mcp` is
  live (200) and returns the shape §1 describes: `authorization_servers`
  points at `https://api.supabase.com`, `resource` echoes
  `https://mcp.supabase.com/mcp`.
- `https://api.supabase.com/.well-known/oauth-authorization-server` is live
  (200) and returns `authorization_endpoint` /
  `token_endpoint` exactly as listed in §1's table.
- Current Agent SDK docs confirm the draft's central claim in §3 verbatim
  in substance: *"The SDK doesn't open a browser or run an interactive
  OAuth flow... complete the OAuth flow in your own application and pass
  the resulting access token in the server's `headers`."*
  (`code.claude.com/docs/en/agent-sdk/mcp`, "OAuth2 authentication" section)

## Corrections

1. **§1 table, DCR endpoint is stale.** The table lists
   `https://api.supabase.com/v1/oauth/register`. The live authorization
   server metadata's `registration_endpoint` is actually
   `https://api.supabase.com/platform/oauth/apps/register`. The draft's own
   Step 1 code discovers this URL dynamically from the metadata document
   rather than hardcoding it, so **the code in the draft is unaffected** —
   only the reference table is wrong. Worth a one-line fix if this doc gets
   reused.

2. **§4 Step 7 / §6 code assumes a message shape that doesn't exist.**
   `message.type === "tool_result"` is not a top-level message type in the
   current Agent SDK stream. Tool results arrive nested inside
   `assistant`/`user` message content blocks (`{ type: "tool_result", ... }`
   items inside `message.content`), not as their own top-level `message`.
   The corrected check has to walk content blocks, not `message.type`.

3. **Constraint #6 is incomplete, not wrong.** The draft says permission
   errors are moving toward `isError: true` tool results instead of OAuth
   exceptions — true, but there's a second, separate failure mode the draft
   doesn't mention: if a server's token is rejected at *connection* time
   (not per-tool-call), the current SDK docs say it "reports status
   `needs-auth`" in the `system`/`init` message and **the agent run
   continues silently without that server's tools** — no exception, no
   `isError`, just an absent tool. A client built only around checking
   `isError` on tool results would never notice this case; it has to also
   check `mcp_servers[].status` on the init message (and, per the docs,
   possibly again later via `mcpServerStatus()` if a connected server drops
   and needs-auth mid-session).

## Open — needs a live run to confirm either way

- **Constraint #5 (all-or-nothing consent) vs. discovery metadata.** The
  live authorization-server metadata's `scopes_supported` already lists
  granular scopes (`database:read`, `secrets:read`, `projects:write`,
  `analytics:read`, etc.) — more granular than "full read+write." That the
  metadata *lists* scopes doesn't prove the authorize/consent screen
  actually *requests* a narrowed subset per our `features=`/`read_only=`
  query params; it may just be the server's full supported-scope catalog.
  Only running a real authorize request with `read_only=true` and looking
  at what the consent screen shows (and what scope ends up in the issued
  token) will settle this. Tracked to re-check during the first real TUI
  run in the Build order.
- **`claude-agent-sdk-typescript#202` (406 on HTTP MCP transport):**
  confirmed real, and the issue is now closed. Current
  `@anthropic-ai/claude-agent-sdk` is at `0.3.277`, far past the `0.2.52`
  that reproduced it, so risk of hitting it is low — but the TUI still logs
  the installed SDK version at startup per the draft's own advice, since
  "closed" doesn't guarantee "verified fixed at the version we happen to
  install."
- Everything in the draft's §6.4 ("still unconfirmed") remains unconfirmed
  by this session — refresh token lifetime/expiry policy, CIMD adoption
  timeline, and `supabase/platform#37264`'s ship status weren't checked
  (no access to Supabase's internal repos or ticket trackers from here).

## Later findings (Sept 2026) — comparison against official docs

Prompted by comparing this project against Supabase's own published OAuth
material: [`build-a-supabase-integration`](https://supabase.com/docs/guides/platform/oauth-apps/build-a-supabase-integration)
(Management API OAuth) and the [official `connect-supabase` Edge Function
example](https://github.com/supabase/supabase/tree/master/examples/edge-functions/supabase/functions/connect-supabase).

- **Correction to earlier "not documented anywhere" framing.** Too strong.
  Supabase's [MCP getting-started docs](https://supabase.com/docs/guides/getting-started/mcp)
  state directly: *"By default the hosted Supabase MCP server uses dynamic
  client registration to authenticate with your Supabase org."* So DCR's
  **existence** for MCP is publicly acknowledged. What remains genuinely
  undocumented is the mechanics: no `.well-known` paths, no
  `registration_endpoint` value, nothing about the org-owner-only
  requirement or the stale-`client_id` bug.
- **The manual-OAuth-app fallback (draft §6.4) is also publicly confirmed**,
  not just internal knowledge: the same MCP docs page says *"If your MCP
  client requires an OAuth client ID and secret (e.g. Azure API Center),
  you can manually create an OAuth app."*
- **The Management API OAuth surface (`build-a-supabase-integration`) is a
  different product from the MCP flow**, confirmed by direct comparison —
  manual-only client registration (no DCR mentioned there at all), no
  `.well-known` discovery, and zero mention of MCP. Same `authorize`/`token`
  endpoints, otherwise a different mechanism end to end.
- **Supabase publishes an official "Connect Supabase" button asset**
  specifically for triggering this kind of OAuth redirect — found via
  [brand-assets](https://supabase.com/brand-assets), hosted at
  `https://obuldanrptloktxcffvn.supabase.co/storage/v1/object/public/supabase-brand-assets/connect-supabase/connect-supabase-dark.svg`.
  Not previously referenced anywhere in this project; now used in the HTML
  guide's step 4.

## Simplifications knowingly introduced in this implementation

Not corrections to the draft — just choices made for a validation harness
that a real partner integration should not copy as-is:

- Tokens (`access_token`, `refresh_token`) are stored in plaintext in
  `mcp_connections`. Fine for a single-org test harness; not fine for a
  real multi-tenant product.
- The backend's own API is protected by a single shared-secret bearer
  token (`BACKEND_API_TOKEN`), not per-user auth — this is a one-operator
  test rig, not a multi-tenant service.
