import { createClient, type SupabaseClient } from "@supabase/supabase-js"

export type OAuthClientRow = {
  redirect_uri: string
  client_id: string
  client_secret: string | null
}

export type ConnectionStatus = "pending" | "authorized" | "error" | "revoked"

export type ConnectionRow = {
  id: string
  mcp_url: string
  redirect_uri: string
  state: string
  code_verifier: string
  status: ConnectionStatus
  access_token: string | null
  refresh_token: string | null
  expires_at: string | null
  error_message: string | null
}

let client: SupabaseClient | undefined

function db(): SupabaseClient {
  if (client) return client
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")
  }
  client = createClient(url, key, { auth: { persistSession: false } })
  return client
}

export async function getOAuthClient(redirectUri: string): Promise<OAuthClientRow | null> {
  const { data, error } = await db()
    .from("oauth_clients")
    .select("redirect_uri, client_id, client_secret")
    .eq("redirect_uri", redirectUri)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function upsertOAuthClient(row: OAuthClientRow): Promise<void> {
  const { error } = await db().from("oauth_clients").upsert(row)
  if (error) throw error
}

export async function deleteOAuthClient(redirectUri: string): Promise<void> {
  const { error } = await db().from("oauth_clients").delete().eq("redirect_uri", redirectUri)
  if (error) throw error
}

export async function createConnection(row: {
  mcp_url: string
  redirect_uri: string
  state: string
  code_verifier: string
}): Promise<ConnectionRow> {
  const { data, error } = await db().from("mcp_connections").insert(row).select().single()
  if (error) throw error
  return data
}

export async function listConnections(): Promise<ConnectionRow[]> {
  const { data, error } = await db()
    .from("mcp_connections")
    .select("*")
    .order("created_at", { ascending: false })
  if (error) throw error
  return data
}

export async function getConnection(id: string): Promise<ConnectionRow | null> {
  const { data, error } = await db().from("mcp_connections").select("*").eq("id", id).maybeSingle()
  if (error) throw error
  return data
}

export async function getConnectionByState(state: string): Promise<ConnectionRow | null> {
  const { data, error } = await db().from("mcp_connections").select("*").eq("state", state).maybeSingle()
  if (error) throw error
  return data
}

export async function updateConnection(
  id: string,
  patch: Partial<
    Pick<ConnectionRow, "status" | "access_token" | "refresh_token" | "expires_at" | "error_message">
  >
): Promise<void> {
  const { error } = await db()
    .from("mcp_connections")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
  if (error) throw error
}
