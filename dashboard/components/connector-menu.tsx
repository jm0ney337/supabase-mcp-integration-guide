"use client"

import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"
import type { Connection } from "@/lib/backend"
import { DatabaseIcon, PlusIcon, SettingsIcon } from "lucide-react"
import { useState } from "react"

// The "+" in the chat box: shows what MCP servers this conversation can
// reach, and opens the connectors pane to add more.
export function ConnectorMenu({
  connections,
  onOpenConnectors,
}: {
  connections: Connection[]
  onOpenConnectors: () => void
}) {
  const [open, setOpen] = useState(false)

  function openConnectors() {
    setOpen(false)
    onOpenConnectors()
  }

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger
        render={
          <Button aria-label="Connectors" size="icon-sm" type="button" variant="ghost">
            <PlusIcon className="size-4" />
          </Button>
        }
      />
      <PopoverContent align="start" className="w-64 gap-1" side="top">
        <p className="px-1 font-medium text-muted-foreground text-xs uppercase tracking-wide">
          Connected
        </p>
        {connections.length === 0 ? (
          <p className="px-1 py-1 text-muted-foreground text-xs">Nothing connected yet.</p>
        ) : (
          connections.map((connection) => (
            <div className="flex items-center gap-2 px-1 py-1" key={connection.id}>
              <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-accent">
                <DatabaseIcon className="size-3.5 text-accent-foreground" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm leading-tight">Supabase</p>
                <p className="truncate text-muted-foreground text-xs">{connection.mcpUrl}</p>
              </div>
              <span className="size-1.5 shrink-0 rounded-full bg-emerald-500" />
            </div>
          ))
        )}
        <Separator className="my-1" />
        <Button className="w-full justify-start" onClick={openConnectors} size="sm" variant="ghost">
          <PlusIcon className="size-4" />
          Add connector
        </Button>
        <Button className="w-full justify-start" onClick={openConnectors} size="sm" variant="ghost">
          <SettingsIcon className="size-4" />
          Manage connectors
        </Button>
      </PopoverContent>
    </Popover>
  )
}
