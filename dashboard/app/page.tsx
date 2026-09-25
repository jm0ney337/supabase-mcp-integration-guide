"use client"

import { ConnectorCard } from "@/components/connector-card"
import type { Connection } from "@/lib/backend"
import { CodeIcon, DatabaseIcon, FileTextIcon, GitBranchIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"

export default function ConnectorsPage() {
  const router = useRouter()
  const [connections, setConnections] = useState<Connection[]>([])
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/connections")
      .then((res) => res.json())
      .then((data) => setConnections(data.connections ?? []))
      .catch(() => {})
  }, [])

  const active = connections.find((c) => c.status === "authorized")

  async function handleConnect() {
    setConnecting(true)
    setError(null)
    try {
      const res = await fetch("/api/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mcpUrl: "https://mcp.supabase.com/mcp?read_only=true" }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Failed to start connection")
      window.location.href = data.authorizeUrl
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setConnecting(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-8 px-6 py-20">
      <header className="space-y-1.5">
        <h1 className="font-semibold text-2xl tracking-tight">Connectors</h1>
        <p className="text-muted-foreground text-sm">
          Connect a data source, then chat with an agent about it.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <ConnectorCard
          description="Query tables, inspect config, and read logs for one project via MCP."
          detail={active ? active.mcpUrl : undefined}
          icon={DatabaseIcon}
          loading={connecting}
          name="Supabase"
          onConnect={handleConnect}
          onOpen={active ? () => router.push(`/connections/${active.id}`) : undefined}
          status={active ? "connected" : "not-connected"}
        />
        <ConnectorCard description="Coming soon" disabled icon={FileTextIcon} name="Notion" />
        <ConnectorCard description="Coming soon" disabled icon={GitBranchIcon} name="Linear" />
        <ConnectorCard description="Coming soon" disabled icon={CodeIcon} name="GitHub" />
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}
    </main>
  )
}
