// Generic-OAuth-2.1-plus-Supabase-specific-quirks core. Nothing in here knows
// about HTTP routing, our own database schema, or the Claude Agent SDK — see
// VALIDATION.md and the plan for why this stays isolated from the API layer.
import { randomBytes, createHash } from "node:crypto"

export type OAuthMetadata = {
  issuer: string
  authorization_endpoint: string
  token_endpoint: string
  registration_endpoint?: string
  scopes_supported?: string[]
  code_challenge_methods_supported?: string[]
}

export type ClientCredentials = {
  client_id: string
  client_secret?: string
}

export type TokenResponse = {
  access_token: string
  refresh_token?: string
  expires_in?: number
  token_type: string
}

/** Thrown when Supabase rejects a client_id with its non-spec-shaped
 * `{"message":"Unrecognized client_id"}` body (see VALIDATION.md / draft
 * §6.3). Callers should wipe the stored registration and re-register from
 * scratch, not retry the same client_id. */
export class StaleClientIdError extends Error {
  constructor() {
    super("STALE_CLIENT_ID")
  }
}

export async function discoverOAuthMetadata(
  mcpUrl: string
): Promise<{ metadata: OAuthMetadata; resourceUrl: string }> {
  const url = new URL(mcpUrl)

  // Supabase's protected-resource metadata path includes the /mcp suffix,
  // unlike some other MCP servers.
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

  const metadataUrl = new URL("/.well-known/oauth-authorization-server", authServers[0])
  const metaRes = await fetch(metadataUrl.toString())
  if (!metaRes.ok) {
    throw new Error(`Authorization server metadata fetch failed: ${metaRes.status}`)
  }
  const metadata = (await metaRes.json()) as OAuthMetadata

  // The full mcpUrl (including scoping query params like project_ref /
  // read_only) is what has to be echoed back as `resource` at authorize and
  // token time (draft §1) — not the bare origin+pathname.
  return { metadata, resourceUrl: mcpUrl }
}

export function generateCodeVerifier(): string {
  return base64URLEncode(randomBytes(32))
}

export function generateCodeChallenge(verifier: string): string {
  return base64URLEncode(createHash("sha256").update(verifier).digest())
}

export function generateState(): string {
  return randomBytes(16).toString("hex")
}

function base64URLEncode(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "")
}

export async function registerClient(
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
      client_name: "Supabase MCP OAuth Backend (validation harness)",
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      // Confidential client — Supabase does not register public clients for
      // the MCP flow today (draft §2.7). Expect a client_secret back.
      token_endpoint_auth_method: "client_secret_basic",
    }),
  })

  if (!res.ok) {
    throw new Error(`Client registration failed: ${res.status} - ${await res.text()}`)
  }

  return (await res.json()) as ClientCredentials
}

export function buildAuthorizationUrl(
  metadata: OAuthMetadata,
  clientId: string,
  redirectUri: string,
  codeChallenge: string,
  state: string,
  resourceUrl: string
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

function authHeaders(clientId: string, clientSecret: string | undefined): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json",
  }
  if (clientSecret) {
    headers["Authorization"] = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`
  }
  return headers
}

async function postToken(
  metadata: OAuthMetadata,
  params: URLSearchParams,
  clientId: string,
  clientSecret: string | undefined
): Promise<TokenResponse> {
  const res = await fetch(metadata.token_endpoint, {
    method: "POST",
    headers: authHeaders(clientId, clientSecret),
    body: params.toString(),
  })

  if (!res.ok) {
    const body = await res.text()
    // Non-spec-shaped error body — see StaleClientIdError doc comment.
    if (body.includes("Unrecognized client_id")) throw new StaleClientIdError()
    throw new Error(`Token request failed: ${res.status} - ${body}`)
  }

  return (await res.json()) as TokenResponse
}

export function exchangeCodeForTokens(
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
  return postToken(metadata, params, clientId, clientSecret)
}

export function refreshAccessToken(
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
  return postToken(metadata, params, clientId, clientSecret)
}

/** Best-effort revoke. Not part of the discovered metadata document, so the
 * endpoint is derived from the issuer (draft §2.3 / §6.3). */
export async function revokeToken(
  token: string,
  metadata: OAuthMetadata,
  clientId: string,
  clientSecret: string | undefined
): Promise<void> {
  const revokeUrl = new URL("/v1/oauth/revoke", metadata.issuer)
  const params = new URLSearchParams({ token, client_id: clientId })
  const res = await fetch(revokeUrl.toString(), {
    method: "POST",
    headers: authHeaders(clientId, clientSecret),
    body: params.toString(),
  })
  if (!res.ok) {
    throw new Error(`Revoke failed: ${res.status} - ${await res.text()}`)
  }
}
