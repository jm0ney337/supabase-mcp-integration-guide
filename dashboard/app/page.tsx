"use client"

import { ChatPanel } from "@/components/chat-panel"
import { ConnectorsDialog } from "@/components/connectors-dialog"
import { FlowVisualization } from "@/components/flow-visualization"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { Connection } from "@/lib/backend"
import { useCallback, useEffect, useState } from "react"

function formatExpiry(iso: string): string {
  const minutes = Math.round((new Date(iso).getTime() - Date.now()) / 60_000)
  if (minutes < 1) return "now"
  if (minutes < 60) return `in ${minutes}m`
  return `in ${Math.round(minutes / 60)}h`
}

export default function Dashboard() {
  const [connections, setConnections] = useState<Connection[]>([])
  // Set by the backend's OAuth callback redirect, so a connection that just
  // came back — including a failed one — is the one we show. Read from the
  // URL rather than useSearchParams() to keep this page out of a Suspense
  // boundary.
  const [justConnectedId, setJustConnectedId] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [connectorsOpen, setConnectorsOpen] = useState(false)
  const [busy, setBusy] = useState<"connect" | "refresh" | "revoke" | null>(null)
  const [expiresAt, setExpiresAt] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setJustConnectedId(new URLSearchParams(window.location.search).get("connection"))
    try {
      const res = await fetch("/api/connections")
      const data = await res.json()
      setConnections(data.connections ?? [])
    } catch {
      setConnections([])
    } finally {
      setLoaded(true)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; setState runs after the awaited response
    void reload()
  }, [reload])

  const live = connections.filter((c) => c.status === "authorized")
  // listConnections() returns newest first, so [0] is the most recent.
  const connection = connections.find((c) => c.id === justConnectedId) ?? live[0]
  const activeConnection = connection?.status === "authorized" ? connection : undefined

  async function handleConnect() {
    setBusy("connect")
    try {
      const res = await fetch("/api/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mcpUrl: "https://mcp.supabase.com/mcp?read_only=true" }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Failed to start connection")
      window.location.href = data.authorizeUrl
    } catch {
      setBusy(null)
    }
  }

  async function handleRefresh() {
    if (!connection) return
    setBusy("refresh")
    try {
      const res = await fetch(`/api/connections/${connection.id}/refresh`, { method: "POST" })
      const data = await res.json()
      if (res.ok) setExpiresAt(data.expiresAt ?? null)
      await reload()
    } finally {
      setBusy(null)
    }
  }

  /** Disconnecting clears every connection that isn't already revoked —
   * revoking just the newest would fall through to an older one, and leaving
   * errored rows behind would keep them cluttering the connector list. */
  async function handleDisconnect() {
    const ids = connections.filter((c) => c.status !== "revoked").map((c) => c.id)
    if (ids.length === 0) return
    setBusy("revoke")
    try {
      await Promise.all(ids.map((id) => fetch(`/api/connections/${id}`, { method: "DELETE" })))
      // Drop ?connection= so a revoked one stops being pinned as active.
      window.history.replaceState(null, "", "/")
      setJustConnectedId(null)
      setExpiresAt(null)
      await reload()
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex h-dvh overflow-hidden">
      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center justify-between border-b px-4">
          <h1 className="font-medium text-sm">Supabase MCP</h1>
          <Button onClick={() => setConnectorsOpen(true)} size="sm" variant="ghost">
            Connectors
          </Button>
        </header>
        <div className="min-h-0 flex-1">
          <ChatPanel
            connection={activeConnection}
            connections={live}
            loading={!loaded}
            onOpenConnectors={() => setConnectorsOpen(true)}
          />
        </div>
      </section>

      <aside className="hidden w-[340px] shrink-0 flex-col gap-6 overflow-y-auto border-l p-5 lg:flex">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm">Connection</h2>
            {connection && (
              <Badge variant={connection.status === "authorized" ? "secondary" : "destructive"}>
                {connection.status}
              </Badge>
            )}
          </div>

          {loaded && !connection && (
            <p className="text-muted-foreground text-xs">
              Nothing connected yet — use the + in the chat box to add a connector.
            </p>
          )}

          {connection && (
            <>
              <p className="truncate text-muted-foreground text-xs">{connection.mcpUrl}</p>
              {connection.errorMessage && (
                <p className="text-destructive text-xs">{connection.errorMessage}</p>
              )}

              <div className="space-y-1.5 pt-1">
                <Button disabled={busy !== null} onClick={handleRefresh} size="sm" variant="secondary">
                  {busy === "refresh" ? "Refreshing…" : "Refresh access token"}
                </Button>
                <p className="text-muted-foreground text-xs">
                  Trades the refresh token for a new access token, no re-consent. The
                  agent does this automatically when one expires — this button just
                  forces it early so you can watch it happen.
                  {expiresAt && (
                    <>
                      {" "}
                      Current token expires{" "}
                      <span className="text-foreground">{formatExpiry(expiresAt)}</span>.
                    </>
                  )}
                </p>
              </div>

              <p className="pt-1 text-muted-foreground text-xs">
                To disconnect, open{" "}
                <button
                  className="text-foreground underline underline-offset-2"
                  onClick={() => setConnectorsOpen(true)}
                  type="button"
                >
                  Connectors
                </button>{" "}
                — that hands the token back to Supabase and ends the grant.
              </p>
            </>
          )}
        </div>

        <FlowVisualization
          errorMessage={connection?.errorMessage}
          status={connection?.status ?? "pending"}
        />
      </aside>

      <ConnectorsDialog
        activeConnection={activeConnection}
        connecting={busy === "connect"}
        disconnecting={busy === "revoke"}
        onConnect={handleConnect}
        onDisconnect={handleDisconnect}
        onOpenChange={setConnectorsOpen}
        open={connectorsOpen}
      />
    </div>
  )
}
