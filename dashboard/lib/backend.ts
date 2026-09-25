// Server-only thin client for the OAuth backend (backend/api/*), called from
// Next.js route handlers so the browser never sees BACKEND_API_TOKEN.
import "server-only"

export type ConnectionStatus = "pending" | "authorized" | "error" | "revoked"

export type Connection = {
  id: string
  mcpUrl: string
  status: ConnectionStatus
  errorMessage: string | null
}

function env(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required env var: ${name}`)
  return value
}

async function backendFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${env("BACKEND_URL")}${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${env("BACKEND_API_TOKEN")}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  })
  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(`${init?.method ?? "GET"} ${path} -> ${res.status}: ${body}`)
  }
  return (await res.json()) as T
}

export function startConnection(mcpUrl: string) {
  return backendFetch<{ connectionId: string; authorizeUrl: string }>("/api/connections", {
    method: "POST",
    body: JSON.stringify({ mcpUrl }),
  })
}

export function listConnections() {
  return backendFetch<{ connections: Connection[] }>("/api/connections")
}

export function getConnection(id: string) {
  return backendFetch<Connection>(`/api/connections/${id}`)
}

export function getConnectionToken(id: string) {
  return backendFetch<{ accessToken: string; expiresAt: string | null }>(`/api/connections/${id}/token`)
}

export function refreshConnection(id: string) {
  return backendFetch<{ accessToken: string; expiresAt: string | null }>(`/api/connections/${id}/refresh`, {
    method: "POST",
  })
}

export function revokeConnection(id: string) {
  return backendFetch<{ status: string }>(`/api/connections/${id}`, { method: "DELETE" })
}
