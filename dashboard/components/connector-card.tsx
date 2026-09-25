"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { Loader2Icon, type LucideIcon } from "lucide-react"

export function ConnectorCard({
  name,
  description,
  icon: Icon,
  status = "not-connected",
  detail,
  loading,
  disabled,
  onConnect,
  onOpen,
}: {
  name: string
  description: string
  icon: LucideIcon
  status?: "connected" | "not-connected"
  detail?: string
  loading?: boolean
  disabled?: boolean
  onConnect?: () => void
  onOpen?: () => void
}) {
  return (
    <Card className={cn("gap-4 p-1", disabled && "opacity-50")}>
      <CardHeader className="flex-row items-start gap-3 space-y-0">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent">
          <Icon className="size-4.5 text-accent-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <CardTitle className="flex items-center gap-2 text-sm">
            {name}
            {status === "connected" && (
              <Badge className="font-normal" variant="secondary">
                Connected
              </Badge>
            )}
          </CardTitle>
          <CardDescription className="line-clamp-2 text-xs">
            {detail ?? description}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {status === "connected" ? (
          <Button className="w-full" onClick={onOpen} size="sm" variant="secondary">
            Open dashboard
          </Button>
        ) : (
          <Button className="w-full" disabled={disabled || loading} onClick={onConnect} size="sm">
            {loading && <Loader2Icon className="size-3.5 animate-spin" />}
            {disabled ? "Coming soon" : loading ? "Redirecting…" : "Connect"}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
