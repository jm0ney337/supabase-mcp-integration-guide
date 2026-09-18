// Thin wrapper around the backend's REST API. Deliberately dumb — it knows
// nothing about OAuth, DCR, or Supabase; it's the same shape a future
// TanStack frontend would call.
export type ConnectionStatus = "pending" | "authorized" | "error" | "revoked"

export type Connection = {
  id: string
  mcpUrl: string
  status: ConnectionStatus
  errorMessage: string | null
}

export class BackendClient {
  constructor(private baseUrl: string, private token: string) {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
    })
    if (!res.ok) {
      const body = await res.text().catch(() => "")
      throw new Error(`${init?.method ?? "GET"} ${path} -> ${res.status}: ${body}`)
    }
    return (await res.json()) as T
  }

  startConnection(mcpUrl: string) {
    return this.request<{ connectionId: string; authorizeUrl: string }>("/api/connections", {
      method: "POST",
      body: JSON.stringify({ mcpUrl }),
    })
  }

  getConnection(id: string) {
    return this.request<Connection>(`/api/connections/${id}`)
  }

  getToken(id: string) {
    return this.request<{ accessToken: string; expiresAt: string | null }>(`/api/connections/${id}/token`)
  }

  refresh(id: string) {
    return this.request<{ accessToken: string; expiresAt: string | null }>(`/api/connections/${id}/refresh`, {
      method: "POST",
    })
  }

  revoke(id: string) {
    return this.request<{ status: string }>(`/api/connections/${id}`, { method: "DELETE" })
  }
}
