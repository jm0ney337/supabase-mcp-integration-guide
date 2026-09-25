"use client"

import { ChatPanel } from "@/components/chat-panel"
import { FlowVisualization } from "@/components/flow-visualization"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { Connection } from "@/lib/backend"
import { useParams, useRouter } from "next/navigation"
import { useCallback, useEffect, useState } from "react"

export default function ConnectionPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [connection, setConnection] = useState<Connection | null>(null)
  const [busy, setBusy] = useState<"refresh" | "revoke" | null>(null)

  const load = useCallback(async () => {
    const res = await fetch(`/api/connections/${id}`)
    if (res.ok) setConnection(await res.json())
  }, [id])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch-on-mount, setState happens after the awaited response, not synchronously
    void load()
  }, [load])

  async function handleRefresh() {
    setBusy("refresh")
    try {
      await fetch(`/api/connections/${id}/refresh`, { method: "POST" })
      await load()
    } finally {
      setBusy(null)
    }
  }

  async function handleRevoke() {
    setBusy("revoke")
    await fetch(`/api/connections/${id}`, { method: "DELETE" })
    router.push("/")
  }

  if (!connection) {
    return <main className="p-16 text-center text-muted-foreground text-sm">Loading connection…</main>
  }

  return (
    <main className="grid min-h-screen grid-cols-1 lg:grid-cols-[1fr_360px]">
      <section className="min-w-0 border-border lg:border-r">
        <ChatPanel connectionId={id} disabled={connection.status !== "authorized"} />
      </section>
      <aside className="flex flex-col gap-6 overflow-y-auto border-border border-t p-6 lg:border-t-0">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm">Connection</h2>
            <Badge variant={connection.status === "authorized" ? "secondary" : "destructive"}>
              {connection.status}
            </Badge>
          </div>
          <p className="truncate text-muted-foreground text-xs">{connection.mcpUrl}</p>
          {connection.errorMessage && (
            <p className="text-destructive text-xs">{connection.errorMessage}</p>
          )}
          <div className="flex gap-2 pt-2">
            <Button disabled={busy !== null} onClick={handleRefresh} size="sm" variant="secondary">
              {busy === "refresh" ? "Refreshing…" : "Refresh token"}
            </Button>
            <Button disabled={busy !== null} onClick={handleRevoke} size="sm" variant="outline">
              {busy === "revoke" ? "Revoking…" : "Revoke"}
            </Button>
          </div>
        </div>
        <FlowVisualization errorMessage={connection.errorMessage} status={connection.status} />
      </aside>
    </main>
  )
}
