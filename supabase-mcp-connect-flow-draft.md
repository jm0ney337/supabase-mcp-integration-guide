# Supabase MCP Client Connect Flow — Draft

**Status:** Internal draft, not for publishing. Pulled from Linear tickets and
`#team-ai` / `#initiative-security-scoped-tokens-for-select-conf` Slack threads
as of Sept 2026. Several behaviors below are actively being redesigned
(scoped OAuth apps, project-level authorization) — anything marked
**[IN FLUX]** should be re-verified with the AI/Auth teams before this ships
in the partner guide.

This covers the **greenfield** path: a client with no existing MCP/OAuth code,
building a connection to `mcp.supabase.com` from scratch. Worked example uses
the Claude Agent SDK to run the actual tool-calling loop once auth is done.

---

## 1. Connection requirements

| Thing | Value | Source |
|---|---|---|
| MCP endpoint | `https://mcp.supabase.com/mcp` | existing docs |
| Local dev endpoint | `http://localhost:54321/mcp` | existing docs, **no OAuth today** — see §6 |
| Protected resource metadata | `https://mcp.supabase.com/.well-known/oauth-protected-resource/mcp` | Slack, `#initiative-security-scoped-tokens-for-select-conf` |
| Authorization server metadata | `https://api.supabase.com/.well-known/oauth-authorization-server` | Slack, Pedro Rodrigues (VS Code ticket response) |
| Authorize endpoint | `https://api.supabase.com/v1/oauth/authorize` | Linear AI-767, existing OAuth integration docs |
| Token endpoint | `https://api.supabase.com/v1/oauth/token` | Linear AI-767 |
| Dynamic Client Registration endpoint | `https://api.supabase.com/v1/oauth/register` | Linear AI-767 |

Scoping query params (`project_ref`, `read_only`, `features`) are part of the
**resource URL**, not OAuth scopes. Whatever you append to the MCP URL gets
reflected into the resource metadata URL and into the `resource` param sent
to the authorize/token endpoints. Example: connecting to
`https://mcp.supabase.com/mcp?project_ref=abc123&read_only=true` means your
discovery call and your `resource` param both carry that full query string.
(Source: Matt Rossman, Slack `#initiative-security-scoped-tokens-for-select-conf`,
2026-08-11.)

**Important nuance [IN FLUX]:** the resulting access token is scoped to the
*organization* at the OAuth level. `project_ref` in the URL does **not**
cryptographically bind the token to that project — enforcement for
project-level access happens elsewhere in the request path, not at the OAuth
layer. Don't treat `project_ref` in the connect URL as a hard security
boundary yet.

---

## 2. Known constraints to design around

These are real, currently-open issues. Build defensively around them rather
than assuming spec-clean behavior.

1. **DCR client registrations can go stale server-side, permanently.**
   Once this happens, every retry with the cached `client_id` gets
   `{"message":"Unrecognized client_id"}` (HTTP 422) forever — it does not
   self-heal. (Linear AI-1028, FDBKIN-35492, FDBKIN-27133, FDBKIN-24459 —
   all describing the same failure across Cursor, VS Code, Claude.)
   **Design implication:** your client must detect this specific error
   shape and re-run DCR from scratch (new registration, not a retry of the
   old one) rather than looping on the same `client_id`. The doc's code
   example below does this.

2. **Only org owners/admins can complete the OAuth handshake today.**
   Non-admin roles (e.g. "Developer") get a 403 at authorize time — this is
   not a role permission you can grant, it's a hard requirement of the
   current flow. (FDBKIN-23384, confirmed by Slack `#ext-highlighting-supabase`,
   Peter Soderberg, 2026-09-10: *"MCP access isn't a role permission; with
   the standard OAuth flow only org owners can authorize the connection."*)
   **Design implication:** for a multi-tenant partner platform, the end user
   completing the OAuth flow for their org must be an owner/admin. Surface
   this requirement in your UI before starting the flow, not after a
   confusing 403.

3. **A granted connection doesn't shrink if the granting user's role is
   later downgraded.** The grant is tied to the org, not the member's
   current role, and there's currently no recheck. (Slack `#team-ai`,
   Cemal Kilic, 2026-08-18: *"the oauth grants today are org-wide access...
   the grant is not tied to the member role but to the org."*)
   **Design implication:** don't rely on Supabase-side role changes to
   revoke access on your end. If your platform needs to reflect a
   permission downgrade, you need to detect and act on it yourself.

4. **MCP currently supports one organization per connection.** A user with
   access to multiple Supabase orgs has to pick one at authorize time; there's
   no way to authorize all of them in one grant. (Linear AI-1183, "MCP
   doesn't support multiple organisations," open as of 2026-09-05.)
   **Design implication:** if your platform's end users commonly work
   across multiple orgs, plan for multiple separate connections rather than
   one connection with org-switching.

5. **[IN FLUX] The OAuth consent screen currently asks for full read+write
   access regardless of your `features=`/`read_only=` query params.**
   Scoping via those params changes what tools are *usable*, not what's
   *requested* at consent. (FDBKIN-30143, reproduced across Claude,
   Antigravity, VS Code.) The AI/Auth teams are actively redesigning this
   (see the Sept 2026 thread on narrowing default scopes and per-project
   authorization) — re-verify this behavior close to when you write the
   partner-facing guide, it may have shipped by then.

6. **Permission errors are moving toward tool-result errors, not OAuth
   exceptions.** The emerging pattern (as of the Sept 2026 design thread) is
   that an insufficient-permission call returns a normal MCP tool result with
   `isError: true` and a natural-language message, rather than throwing at
   the OAuth/403 layer — because that's the one channel the spec guarantees
   reaches the calling agent. **Design implication:** don't build your error
   handling around catching an OAuth exception on tool calls; check
   `isError` on tool results too.

7. **Confidential clients only, for now.** Supabase does not currently
   register public (secret-less) OAuth clients for the MCP flow. (Slack
   `#team-partnerships`, Pedro Rodrigues, re: Docker MCP Catalog compatibility,
   2026-06-12.) If your client is fully client-side (e.g. browser-only, no
   backend), confirm whether DCR issues you a `client_secret` you can actually
   hold onto, or whether you need a thin backend to hold it.

---

## 3. Prerequisites

```bash
npm install @anthropic-ai/claude-agent-sdk
npm install express          # for the local OAuth redirect handler in this example
```

The Claude Agent SDK **does not perform the OAuth flow for you.** It only
accepts a bearer token via `headers` on an `http`-type MCP server config.
You have to run the discovery → PKCE → DCR → authorize → token exchange
yourself, then hand the SDK the finished access token. (Confirmed in
Anthropic's own MCP docs: *"The SDK doesn't handle OAuth flows automatically,
but you can pass access tokens via headers after completing the OAuth flow
in your application."*)

**Known SDK issue to watch for while testing:** `claude-agent-sdk-typescript`
issue #202 reports HTTP-transport MCP connections failing with 406 because
the SDK didn't send `Accept: application/json, text/event-stream` on some
versions (`0.2.52` reported). If tool calls fail with a 406 during Claude
Code testing, check the installed SDK version first before assuming this
doc's OAuth code is wrong.

---

## 4. Step-by-step

### Step 1 — OAuth discovery

```typescript
type OAuthMetadata = {
  issuer: string
  authorization_endpoint: string
  token_endpoint: string
  registration_endpoint?: string
  scopes_supported?: string[]
  code_challenge_methods_supported?: string[]
}

async function discoverOAuthMetadata(mcpServerUrl: string): Promise<OAuthMetadata> {
  const url = new URL(mcpServerUrl)

  // NOTE: Supabase's protected-resource metadata path includes the /mcp
  // suffix (unlike some other MCP servers). Confirmed via Slack:
  // https://mcp.supabase.com/.well-known/oauth-protected-resource/mcp
  const protectedResourceUrl = new URL(
    `/.well-known/oauth-protected-resource${url.pathname}${url.search}`,
    url.origin
  )

  const prRes = await fetch(protectedResourceUrl.toString())
  if (!prRes.ok) {
    throw new Error(`Protected resource metadata fetch failed: ${prRes.status}`)
  }
  const protectedResource = await prRes.json()
  const authServers = protectedResource.authorization_servers
  if (!Array.isArray(authServers) || authServers.length === 0) {
    throw new Error("No authorization_servers in protected resource metadata")
  }

  // Confirmed: the auth server is api.supabase.com, not mcp.supabase.com
  const metadataUrl = new URL("/.well-known/oauth-authorization-server", authServers[0])
  const metaRes = await fetch(metadataUrl.toString())
  if (!metaRes.ok) {
    throw new Error(`Authorization server metadata fetch failed: ${metaRes.status}`)
  }
  return (await metaRes.json()) as OAuthMetadata
}
```

### Step 2 — PKCE parameters

Generic OAuth, no Supabase-specific behavior. Same pattern as any RFC 7636
implementation.

```typescript
import { randomBytes, createHash } from "crypto"

function base64URLEncode(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "")
}

function generateCodeVerifier(): string {
  return base64URLEncode(randomBytes(32))
}

function generateCodeChallenge(verifier: string): string {
  return base64URLEncode(createHash("sha256").update(verifier).digest())
}
```

### Step 3 — Dynamic client registration (with defensive re-registration)

This is the step that needs to be defensive against the stale-`client_id`
bug (constraint #1 above). Persist credentials to disk/DB, and on a
confirmed "Unrecognized client_id" failure later in the flow, wipe the
stored registration and register fresh rather than retrying.

```typescript
import { writeFileSync, readFileSync, existsSync } from "fs"

type ClientCredentials = {
  client_id: string
  client_secret?: string
}

const CREDENTIALS_PATH = "./.supabase-mcp-client.json"

async function registerClient(
  metadata: OAuthMetadata,
  redirectUri: string
): Promise<ClientCredentials> {
  if (!metadata.registration_endpoint) {
    throw new Error("Server does not support dynamic client registration")
  }

  const res = await fetch(metadata.registration_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_name: "Your App — Supabase MCP Client",
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      // Confidential client — Supabase does not register public clients
      // for MCP today (Slack #team-partnerships, 2026-06-12). Expect a
      // client_secret back.
      token_endpoint_auth_method: "client_secret_basic",
    }),
  })

  if (!res.ok) {
    throw new Error(`Client registration failed: ${res.status} - ${await res.text()}`)
  }

  const credentials = (await res.json()) as ClientCredentials
  writeFileSync(CREDENTIALS_PATH, JSON.stringify(credentials))
  return credentials
}

async function getOrRegisterClient(
  metadata: OAuthMetadata,
  redirectUri: string,
  forceNew = false
): Promise<ClientCredentials> {
  if (!forceNew && existsSync(CREDENTIALS_PATH)) {
    return JSON.parse(readFileSync(CREDENTIALS_PATH, "utf-8"))
  }
  return registerClient(metadata, redirectUri)
}
```

### Step 4 — Build the authorization URL

The `resource` param must be the **full MCP connection URL, including any
scoping query params** (constraint from §1). Don't just send the bare
`https://mcp.supabase.com/mcp`.

```typescript
function buildAuthorizationUrl(
  metadata: OAuthMetadata,
  clientId: string,
  redirectUri: string,
  codeChallenge: string,
  state: string,
  resourceUrl: string // e.g. "https://mcp.supabase.com/mcp?project_ref=abc123&read_only=true"
): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    resource: resourceUrl,
  })
  return `${metadata.authorization_endpoint}?${params.toString()}`
}
```

Remember constraint #2: the user completing this flow must be an org
owner/admin, or they'll hit a 403 here. Surface that requirement in your UI
before opening this URL, not after.

### Step 5 — Local callback listener

For a CLI/script test harness (what we're building for Claude Code to
exercise), a minimal Express listener is enough. A production partner
integration would do this server-side instead.

```typescript
import express from "express"

function waitForCallback(port: number): Promise<{ code: string; state: string }> {
  return new Promise((resolve, reject) => {
    const app = express()
    const server = app.listen(port)

    app.get("/callback", (req, res) => {
      const { code, state, error, error_description } = req.query as Record<string, string>
      res.send(error ? `Auth failed: ${error_description || error}` : "Connected. You can close this tab.")
      server.close()
      if (error) reject(new Error(`${error}: ${error_description}`))
      else if (!code || !state) reject(new Error("Missing code or state in callback"))
      else resolve({ code, state })
    })
  })
}
```

### Step 6 — Exchange code for tokens

```typescript
type TokenResponse = {
  access_token: string
  refresh_token?: string
  expires_in?: number
  token_type: string
}

async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string,
  metadata: OAuthMetadata,
  clientId: string,
  clientSecret: string | undefined,
  redirectUri: string
): Promise<TokenResponse> {
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: clientId,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  })

  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json",
  }
  if (clientSecret) {
    headers["Authorization"] = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`
  }

  const res = await fetch(metadata.token_endpoint, { method: "POST", headers, body: params.toString() })

  if (!res.ok) {
    const body = await res.text()
    // Constraint #1 — detect the stale-client_id bug specifically so the
    // caller can re-register instead of retrying uselessly.
    if (body.includes("Unrecognized client_id")) {
      throw new Error("STALE_CLIENT_ID")
    }
    throw new Error(`Token exchange failed: ${res.status} - ${body}`)
  }

  return (await res.json()) as TokenResponse
}
```

### Step 7 — Connect with the Claude Agent SDK

Once you have an access token, hand it to the SDK as a bearer header on an
`http`-type MCP server. This is the only integration point between the OAuth
code above and the SDK — the SDK never sees the OAuth flow itself.

```typescript
import { query, type Options } from "@anthropic-ai/claude-agent-sdk"

async function runAgentWithSupabaseMcp(accessToken: string, mcpUrl: string) {
  const options: Options = {
    mcpServers: {
      supabase: {
        type: "http",
        url: mcpUrl, // e.g. "https://mcp.supabase.com/mcp?project_ref=abc123&read_only=true"
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    },
    allowedTools: ["mcp__supabase__*"],
  }

  for await (const message of query({
    prompt: "List the tables in this Supabase project.",
    options,
  })) {
    if (message.type === "result" && message.subtype === "success") {
      console.log(message.result)
    }
    // Constraint #6 — permission errors may come back as a normal tool
    // result with isError: true rather than an exception. Log tool_use /
    // tool_result messages during testing to see this in practice.
    if (message.type === "tool_result" && (message as any).isError) {
      console.warn("Tool call returned an error result:", message)
    }
  }
}
```

---

## 5. Full connect script (for Claude Code to run and test)

```typescript
// connect-supabase-mcp.ts
import "dotenv/config"
import open from "open"

const REDIRECT_URI = "http://localhost:8765/callback"
const MCP_URL = process.env.SUPABASE_MCP_URL || "https://mcp.supabase.com/mcp"

async function main() {
  console.log("Discovering OAuth metadata...")
  const metadata = await discoverOAuthMetadata(MCP_URL)

  console.log("Registering client (or reusing saved registration)...")
  let credentials = await getOrRegisterClient(metadata, REDIRECT_URI)

  const codeVerifier = generateCodeVerifier()
  const codeChallenge = generateCodeChallenge(codeVerifier)
  const state = randomBytes(16).toString("hex")

  const authUrl = buildAuthorizationUrl(
    metadata,
    credentials.client_id,
    REDIRECT_URI,
    codeChallenge,
    state,
    MCP_URL
  )

  console.log("Opening browser for Supabase login/consent...")
  console.log("If this doesn't open automatically, visit:", authUrl)
  await open(authUrl)

  const callback = await waitForCallback(8765)
  if (callback.state !== state) throw new Error("State mismatch — possible CSRF")

  console.log("Exchanging code for tokens...")
  let tokens: TokenResponse
  try {
    tokens = await exchangeCodeForTokens(
      callback.code,
      codeVerifier,
      metadata,
      credentials.client_id,
      credentials.client_secret,
      REDIRECT_URI
    )
  } catch (err) {
    if (err instanceof Error && err.message === "STALE_CLIENT_ID") {
      // Constraint #1 — known bug. Force a fresh registration and tell the
      // user to re-run rather than looping silently.
      console.warn("Registered client_id was rejected as unrecognized (known Supabase MCP issue).")
      console.warn("Re-registering a fresh client. Please re-run this script.")
      await registerClient(metadata, REDIRECT_URI)
      process.exit(1)
    }
    throw err
  }

  console.log("Connected. Running a test query against the MCP server...")
  await runAgentWithSupabaseMcp(tokens.access_token, MCP_URL)
}

main().catch((err) => {
  console.error("Connect flow failed:", err)
  process.exit(1)
})
```

**What to verify when Claude Code runs this:**

1. Discovery resolves both metadata documents without manual URL guessing.
2. The browser consent screen appears and — per constraint #2 — only
   succeeds if the authorizing user is an org owner/admin.
3. Token exchange succeeds and the SDK can actually call a Supabase MCP tool
   (e.g. `list_tables`) end to end.
4. Deliberately test the stale-`client_id` path if possible: manually mangle
   the saved `.supabase-mcp-client.json` and confirm the script detects
   `STALE_CLIENT_ID` and re-registers rather than hanging.
5. Watch for the SDK's known 406 issue (§3) — if every tool call fails with
   406 regardless of a valid token, it's the SDK's HTTP transport, not this
   auth code.
6. Test refresh explicitly (§6): call `refreshAccessToken()` with the saved
   `refresh_token` after the access token would have expired (or just call
   it immediately — the server should still rotate it). Confirm the response
   includes a new `refresh_token` and that you're persisting it, not reusing
   the old one. This won't be exercised by a single short-lived test run
   otherwise, and it's the failure mode most likely to only show up later.

---

## 6. Token refresh handling

Scoped in detail below because the root causes are now well understood from
Linear/Slack, not just "refresh sometimes fails." Three distinct failure
modes, three different fixes. Don't lump them into one retry-and-hope
handler.

### 6.1 Basic mechanics

Standard `grant_type=refresh_token` against
`https://api.supabase.com/v1/oauth/token`. Access tokens run roughly 1 hour
(FDBKIN-20281). Your DCR registration must include `refresh_token` in
`grant_types` (already in the Step 3 code above) or you won't get one issued.

```typescript
async function refreshAccessToken(
  refreshToken: string,
  metadata: OAuthMetadata,
  clientId: string,
  clientSecret: string | undefined
): Promise<TokenResponse> {
  const params = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
  })
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json",
  }
  if (clientSecret) {
    headers["Authorization"] = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`
  }

  const res = await fetch(metadata.token_endpoint, { method: "POST", headers, body: params.toString() })
  if (!res.ok) {
    const body = await res.text()
    if (body.includes("Unrecognized client_id")) throw new Error("STALE_CLIENT_ID")
    throw new Error(`Refresh failed: ${res.status} - ${body}`)
  }
  return (await res.json()) as TokenResponse
}
```

### 6.2 Failure mode 1 — improper storage of rotated refresh tokens

Every refresh issues a **new** refresh token; the one you sent is spent.
This is the actual cause behind at least one reported case (Slack
`#team-ai`, Ali Waseem re: a ChatGPT-based client failing every "few days" —
Greg Richardson's diagnosis: *"the client will need to store and use the
refresh token properly, otherwise will result in a manual re-auth"*). Not a
Supabase bug — a client-side storage bug.

**Design implication:** persist the new `refresh_token` from every refresh
response atomically with the new access token, before making any other
request. If two processes/workers can refresh the same connection
concurrently, serialize it with a lock — a race where both read the same
refresh token and only one write wins will strand the loser with a dead
token on its next attempt.

### 6.3 Failure mode 2 — the client_id reaping mechanism (now root-caused)

This is the "Unrecognized client_id" bug from §2, and Linear/Slack now show
exactly when it bites:

- A **15-minute cron** deletes DCR-registered clients that were **never
  approved** (abandoned mid-consent, or the user never finished the browser
  flow). This is being widened to a longer window (Linear AI-893, still open
  as of writing).
- **Revoking** a connection (`POST /v1/oauth/revoke`, or a dashboard/org
  revoke) deletes the row that otherwise shields an approved client from
  that same reaper. A client that registers, consents, mints a token, and
  is then revoked within roughly an hour can fall back into the reap
  window and lose its registration.
- **A fully approved, actively-refreshed connection is not at ongoing risk**
  from this specific reaper — the danger window is abandoned/incomplete
  registrations and revoked-then-idle ones, not steady-state usage.

**The self-healing gap, and why it matters for what code you write:**
Per RFC 6749 §5.2, a spec-compliant token error response looks like
`{"error": "invalid_client", ...}`. Well-behaved MCP clients (confirmed:
Claude Code, and the shared MCP TypeScript SDK error path that Cursor/VS
Code inherit) already watch for exactly that `error` code and
auto-clear/re-register on it — no custom code needed, in theory. **Today,
Supabase's server returns `{"message": "Unrecognized client_id"}` instead —
no `error` field — so that built-in recovery path never fires.** A fix
(spec-shaped error body) was in draft/CI-green as `supabase/platform#37264`
as of 2026-08-19; check whether it's shipped before finalizing this section,
since it changes whether partners need any custom handling here at all.

**Design implication until that ships:** keep the defensive
`STALE_CLIENT_ID` detection from the Step 6 code (matching the literal
non-standard string, not the spec-shaped field) and re-register on it. Once
the fix ships, a generic RFC-6749-compliant handler (catch `invalid_client`/
`unauthorized_client`, clear, re-register) should be sufficient on its own —
this is the point from earlier in this thread about most of the work being
generic OAuth, not Supabase-specific: the custom part here is a temporary
workaround for a non-compliant error shape, not a permanent Supabase quirk.

**Manual recovery, for testing with Claude Code specifically:**
`claude mcp logout supabase` then `claude mcp login supabase` (or in-session
`/mcp` → pick the server → **Clear authentication** → **Authenticate**).
`login` alone is **not enough** — it preserves the existing registration
when the redirect URI/port haven't changed, which just reproduces the
failure. Logout has to come first. (Confirmed against Claude Code v2.1.236,
Slack `#team-ai`.)

### 6.4 What's still unconfirmed — verify before writing the partner guide

- **Refresh token lifetime/expiry policy.** No ticket gives a concrete
  number for this OAuth 2.1 server (distinct from Supabase Auth's end-user
  refresh tokens, which are a different system — don't conflate the two).
  Don't assume an idle-timeout or absolute max lifetime pattern like some
  other MCP servers use; test empirically or ask the Auth team directly.
- **CIMD as a longer-term fix.** The 2026-07-28 MCP Auth spec revision
  deprecates DCR in favor of CIMD (client ID as a URL you host, so there's
  no registration row for Supabase to reap in the first place — this
  failure mode would mostly disappear). Client support today: Claude Code,
  VS Code, Codex CLI resolve URL client IDs; Cursor, Gemini CLI, mcp-remote,
  and LibreChat don't yet. Supabase's own CIMD implementation attempt was
  blocked (Feb 2026) over an SSRF/DoS concern — `/authorize` would need to
  make an outbound fetch on unauthenticated input. Worth a forward-looking
  mention, not something to build against yet.
- **Local/self-hosted OAuth.** Local dev MCP (`localhost:54321/mcp`) has
  **no OAuth today** — open by default, an accepted tradeoff for local dev.
  A resource-server OAuth implementation for local/self-hosted is in early
  POC (Slack `#team-ai`, Pedro Rodrigues, 2026-09-07) but not shipped.
- **Manual OAuth app fallback.** If a partner's own client can't do DCR,
  the existing manual-OAuth-app flow in `/ai-tools/mcp#manual-authentication`
  still applies — not re-derived here, just link to it.
