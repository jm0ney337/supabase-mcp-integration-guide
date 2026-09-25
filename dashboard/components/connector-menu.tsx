"use client"

import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import type { Connection } from "@/lib/backend"
import { CodeIcon, DatabaseIcon, FileTextIcon, GitBranchIcon, PlusIcon, type LucideIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"

const PLACEHOLDER_CONNECTORS: { name: string; icon: LucideIcon }[] = [
  { icon: FileTextIcon, name: "Notion" },
  { icon: GitBranchIcon, name: "Linear" },
  { icon: CodeIcon, name: "GitHub" },
]

// Opens from the chat box's "+" button — lets you see what's connected and
// add more without leaving the conversation, same idea as the connectors
// screen at "/" but scoped down to fit a popover.
export function ConnectorMenu() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [connections, setConnections] = useState<Connection[]>([])
  const [connecting, setConnecting] = useState(false)

  useEffect(() => {
    if (!open) return
    fetch("/api/connections")
      .then((res) => res.json())
      .then((data) => setConnections(data.connections ?? []))
      .catch(() => {})
  }, [open])

  const active = connections.find((c) => c.status === "authorized")

  async function handleConnect() {
    setConnecting(true)
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
      setConnecting(false)
    }
  }

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger
        render={
          <Button size="icon-sm" type="button" variant="outline">
            <PlusIcon className="size-4" />
          </Button>
        }
      />
      <PopoverContent align="start" className="w-64">
        <p className="px-1 pb-1 font-medium text-muted-foreground text-xs uppercase tracking-wide">
          Connectors
        </p>
        <ConnectorRow active={!!active} icon={DatabaseIcon} loading={connecting} name="Supabase" onConnect={handleConnect} />
        {PLACEHOLDER_CONNECTORS.map((c) => (
          <ConnectorRow disabled icon={c.icon} key={c.name} name={c.name} />
        ))}
        <Button className="mt-1 w-full justify-center" onClick={() => router.push("/")} size="sm" variant="ghost">
          Manage all connectors
        </Button>
      </PopoverContent>
    </Popover>
  )
}

function ConnectorRow({
  name,
  icon: Icon,
  active,
  disabled,
  loading,
  onConnect,
}: {
  name: string
  icon: LucideIcon
  active?: boolean
  disabled?: boolean
  loading?: boolean
  onConnect?: () => void
}) {
  return (
    <div className="flex items-center gap-2 rounded-md px-1 py-1.5">
      <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-accent">
        <Icon className="size-3.5 text-accent-foreground" />
      </div>
      <span className="flex-1 truncate text-sm">{name}</span>
      {active ? (
        <span className="text-emerald-500 text-xs">Connected</span>
      ) : disabled ? (
        <span className="text-muted-foreground text-xs">Soon</span>
      ) : (
        <Button disabled={loading} onClick={onConnect} size="sm" variant="secondary">
          {loading ? "…" : "Connect"}
        </Button>
      )}
    </div>
  )
}
