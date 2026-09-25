// Orchestrates lib/oauth.ts (protocol) + lib/db.ts (persistence) into the
// operations the API routes need. Keeps api/*.ts files down to HTTP glue.
import * as oauth from "./oauth"
import * as db from "./db"

const REFRESH_SKEW_MS = 60_000 // refresh a bit before actual expiry

export class ConnectionError extends Error {
  constructor(message: string, public code: "not_found" | "not_authorized" | "stale_client") {
    super(message)
  }
}

export async function startConnection(mcpUrl: string, redirectUri: string) {
  const { metadata, resourceUrl } = await oauth.discoverOAuthMetadata(mcpUrl)

  let clientRow = await db.getOAuthClient(redirectUri)
  if (!clientRow) {
    const credentials = await oauth.registerClient(metadata, redirectUri)
    clientRow = { redirect_uri: redirectUri, client_id: credentials.client_id, client_secret: credentials.client_secret ?? null }
    await db.upsertOAuthClient(clientRow)
  }

  const codeVerifier = oauth.generateCodeVerifier()
  const codeChallenge = oauth.generateCodeChallenge(codeVerifier)
  const state = oauth.generateState()

  const connection = await db.createConnection({
    mcp_url: mcpUrl,
    redirect_uri: redirectUri,
    state,
    code_verifier: codeVerifier,
  })

  const authorizeUrl = oauth.buildAuthorizationUrl(
    metadata,
    clientRow.client_id,
    redirectUri,
    codeChallenge,
    state,
    resourceUrl
  )

  return { connectionId: connection.id, authorizeUrl }
}

/** Called from the /api/oauth/callback route. Returns the connection id so
 * the route can render a useful page even on failure. */
export async function completeAuthorization(
  state: string,
  code: string
): Promise<{ connectionId: string | null; ok: boolean; error?: string }> {
  const connection = await db.getConnectionByState(state)
  if (!connection) return { connectionId: null, ok: false, error: "Unknown state (possible CSRF or expired connection)" }

  const clientRow = await db.getOAuthClient(connection.redirect_uri)
  if (!clientRow) {
    await db.updateConnection(connection.id, { status: "error", error_message: "No client registration for this redirect_uri" })
    return { connectionId: connection.id, ok: false, error: "Missing client registration" }
  }

  const { metadata } = await oauth.discoverOAuthMetadata(connection.mcp_url)

  try {
    const tokens = await oauth.exchangeCodeForTokens(
      code,
      connection.code_verifier,
      metadata,
      clientRow.client_id,
      clientRow.client_secret ?? undefined,
      connection.redirect_uri
    )
    await db.updateConnection(connection.id, {
      status: "authorized",
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token ?? null,
      expires_at: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000).toISOString() : null,
      error_message: null,
    })
    return { connectionId: connection.id, ok: true }
  } catch (err) {
    if (err instanceof oauth.StaleClientIdError) {
      // Known Supabase bug (draft §6.3): the reaped client_id never
      // self-heals. Wipe it so the *next* startConnection() re-registers.
      await db.deleteOAuthClient(connection.redirect_uri)
      await db.updateConnection(connection.id, {
        status: "error",
        error_message: "Client registration was stale (Unrecognized client_id). Re-registered — retry POST /api/connections.",
      })
      return { connectionId: connection.id, ok: false, error: "STALE_CLIENT_ID" }
    }
    const message = err instanceof Error ? err.message : String(err)
    await db.updateConnection(connection.id, { status: "error", error_message: message })
    return { connectionId: connection.id, ok: false, error: message }
  }
}

/** Returns a currently-valid access token, refreshing first if it's expired
 * or close to it. Always persists the *new* refresh_token atomically with
 * the access token — draft §6.2's storage failure mode. */
export async function getValidAccessToken(id: string): Promise<{ accessToken: string; expiresAt: string | null }> {
  const connection = await requireAuthorizedConnection(id)

  const expiresAt = connection.expires_at ? new Date(connection.expires_at).getTime() : null
  const needsRefresh = expiresAt !== null && expiresAt - REFRESH_SKEW_MS <= Date.now()

  if (!needsRefresh && connection.access_token) {
    return { accessToken: connection.access_token, expiresAt: connection.expires_at }
  }

  return forceRefresh(id)
}

export async function forceRefresh(id: string): Promise<{ accessToken: string; expiresAt: string | null }> {
  const connection = await requireAuthorizedConnection(id)
  if (!connection.refresh_token) {
    throw new ConnectionError("Connection has no refresh_token to use", "not_authorized")
  }

  const clientRow = await db.getOAuthClient(connection.redirect_uri)
  if (!clientRow) throw new ConnectionError("Missing client registration", "not_authorized")

  const { metadata } = await oauth.discoverOAuthMetadata(connection.mcp_url)

  try {
    const tokens = await oauth.refreshAccessToken(
      connection.refresh_token,
      metadata,
      clientRow.client_id,
      clientRow.client_secret ?? undefined
    )
    const expiresAt = tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000).toISOString() : null
    await db.updateConnection(id, {
      access_token: tokens.access_token,
      // Every refresh issues a NEW refresh_token; the one we sent is spent.
      // Persisting it here, in the same write as the access token, is what
      // avoids draft §6.2's storage bug.
      refresh_token: tokens.refresh_token ?? connection.refresh_token,
      expires_at: expiresAt,
      error_message: null,
    })
    return { accessToken: tokens.access_token, expiresAt }
  } catch (err) {
    if (err instanceof oauth.StaleClientIdError) {
      await db.deleteOAuthClient(connection.redirect_uri)
      await db.updateConnection(id, { status: "error", error_message: "Client registration went stale during refresh. Re-run POST /api/connections." })
      throw new ConnectionError("STALE_CLIENT_ID", "stale_client")
    }
    // The token endpoint answered and refused (spent/revoked refresh token,
    // e.g. "No such refresh token found"). The grant is gone, so stop
    // reporting the connection as authorized — otherwise it sits there
    // looking usable forever. Network-level failures fall through untouched
    // so a blip doesn't force a re-auth.
    const message = err instanceof Error ? err.message : String(err)
    if (message.startsWith("Token request failed:")) {
      await db.updateConnection(id, { status: "error", error_message: message })
    }
    throw err
  }
}

export async function revokeConnection(id: string): Promise<void> {
  const connection = await db.getConnection(id)
  if (!connection) throw new ConnectionError("Connection not found", "not_found")

  const clientRow = await db.getOAuthClient(connection.redirect_uri)

  // Best-effort, and deliberately non-fatal: the endpoint only accepts a
  // refresh_token, and if Supabase rejects the call we still drop our copy
  // of the tokens. Letting this throw would strand the connection as
  // "authorized" with no way for the user to ever disconnect it.
  if (clientRow && connection.refresh_token) {
    try {
      const { metadata } = await oauth.discoverOAuthMetadata(connection.mcp_url)
      await oauth.revokeToken(
        connection.refresh_token,
        metadata,
        clientRow.client_id,
        clientRow.client_secret ?? undefined
      )
    } catch (err) {
      console.warn(`Remote revoke failed for ${id}; clearing local tokens anyway:`, err)
    }
  }

  await db.updateConnection(id, { status: "revoked", access_token: null, refresh_token: null })
}

async function requireAuthorizedConnection(id: string) {
  const connection = await db.getConnection(id)
  if (!connection) throw new ConnectionError("Connection not found", "not_found")
  if (connection.status !== "authorized" || !connection.access_token) {
    throw new ConnectionError(`Connection is not authorized (status: ${connection.status})`, "not_authorized")
  }
  return connection
}
