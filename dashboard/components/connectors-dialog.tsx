"use client"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { Connection } from "@/lib/backend"
import { cn } from "@/lib/utils"
import { CodeIcon, DatabaseIcon, FileTextIcon, GitBranchIcon, type LucideIcon } from "lucide-react"
import Image from "next/image"

const PLACEHOLDER_CONNECTORS: { name: string; icon: LucideIcon; description: string }[] = [
  { description: "Search and update pages", icon: FileTextIcon, name: "Notion" },
  { description: "Manage issues and projects", icon: GitBranchIcon, name: "Linear" },
  { description: "Read repos, issues and PRs", icon: CodeIcon, name: "GitHub" },
]

export function ConnectorsDialog({
  open,
  onOpenChange,
  activeConnection,
  connecting,
  disconnecting,
  onConnect,
  onDisconnect,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  activeConnection?: Connection
  connecting?: boolean
  disconnecting?: boolean
  onConnect: () => void
  onDisconnect: () => void
}) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Connectors</DialogTitle>
          <DialogDescription>
            Connect an MCP server to give the agent access to your data.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-w-0 flex-col gap-1">
          <ConnectorRow
            description={
              activeConnection
                ? describeMcpUrl(activeConnection.mcpUrl)
                : "Query tables, inspect config, and read logs"
            }
            icon={DatabaseIcon}
            name="Supabase"
          >
            {activeConnection ? (
              <div className="flex shrink-0 items-center gap-2">
                <span className="flex items-center gap-1.5 text-muted-foreground text-xs">
                  <span className="size-1.5 rounded-full bg-emerald-500" />
                  Connected
                </span>
                <Button disabled={disconnecting} onClick={onDisconnect} size="sm" variant="outline">
                  {disconnecting ? "Disconnecting…" : "Disconnect"}
                </Button>
              </div>
            ) : (
              // Supabase's official button asset, per supabase.com/brand-assets
              <button
                aria-label="Connect Supabase"
                className={cn(
                  "transition-opacity hover:opacity-90",
                  connecting && "pointer-events-none opacity-60"
                )}
                disabled={connecting}
                onClick={onConnect}
                type="button"
              >
                <Image alt="Connect Supabase" height={31} src="/connect-supabase.svg" width={156} />
              </button>
            )}
          </ConnectorRow>

          {PLACEHOLDER_CONNECTORS.map((connector) => (
            <ConnectorRow
              description={connector.description}
              icon={connector.icon}
              key={connector.name}
              muted
              name={connector.name}
            >
              <span className="text-muted-foreground text-xs">Soon</span>
            </ConnectorRow>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** "mcp.supabase.com · read-only" reads better in a row than the raw URL. */
function describeMcpUrl(mcpUrl: string): string {
  try {
    const url = new URL(mcpUrl)
    const scopes = [
      url.searchParams.get("read_only") === "true" ? "read-only" : null,
      url.searchParams.get("project_ref"),
    ].filter(Boolean)
    return [url.host, ...scopes].join(" · ")
  } catch {
    return mcpUrl
  }
}

function ConnectorRow({
  name,
  description,
  icon: Icon,
  muted,
  children,
}: {
  name: string
  description: string
  icon: LucideIcon
  muted?: boolean
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border border-transparent px-2 py-2.5 transition-colors",
        muted ? "opacity-55" : "hover:border-border hover:bg-card"
      )}
    >
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent">
        <Icon className="size-4 text-accent-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-sm leading-tight">{name}</p>
        <p className="truncate text-muted-foreground text-xs">{description}</p>
      </div>
      {children}
    </div>
  )
}
