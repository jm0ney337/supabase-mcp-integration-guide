"use client"

import type { ConnectionStatus } from "@/lib/backend"
import { FLOW_PHASES } from "@/lib/flow-steps"
import { cn } from "@/lib/utils"
import { CheckIcon } from "lucide-react"

/** One MCP tool call observed on the live chat stream. */
export type ToolEvent = {
  id: string
  name: string
  state: "input-streaming" | "input-available" | "output-available" | "output-error" | string
}

type StepState = "done" | "active" | "error" | "pending"

export function FlowDiagram({
  status,
  toolEvents,
}: {
  status?: ConnectionStatus
  toolEvents: ToolEvent[]
}) {
  const connected = status === "authorized"
  const failed = status === "error"

  const running = toolEvents.find(
    (e) => e.state === "input-streaming" || e.state === "input-available"
  )
  const finished = toolEvents.filter((e) => e.state === "output-available")
  const errored = toolEvents.filter((e) => e.state === "output-error")

  function stateFor(index: number): StepState {
    // Everything before MCP access happens during connect.
    if (index < 4) {
      if (failed) return index === 3 ? "error" : "done"
      return connected ? "done" : "pending"
    }
    if (!connected) return "pending"
    if (running) return "active"
    if (errored.length > 0) return "error"
    if (finished.length > 0) return "done"
    return "active"
  }

  function captionFor(index: number, state: StepState): string {
    if (index < 4) {
      if (state === "done") return "Completed"
      if (state === "error") return "Failed"
      return FLOW_PHASES[index].description
    }
    if (!connected) return FLOW_PHASES[index].description
    if (running) return `Calling ${running.name}…`
    if (errored.length > 0) return `${errored.length} call${errored.length === 1 ? "" : "s"} failed`
    if (finished.length > 0) {
      return `${finished.length} tool call${finished.length === 1 ? "" : "s"}`
    }
    return "Ready — ask a question"
  }

  return (
    <div className="space-y-3">
      <div>
        <h3 className="font-semibold text-sm">Connection flow</h3>
        <p className="text-muted-foreground text-xs">
          The phases from the partner guide. MCP calls show up live as the agent works.
        </p>
      </div>

      <ol className="pt-1">
        {FLOW_PHASES.map((phase, index) => {
          const state = stateFor(index)
          const last = index === FLOW_PHASES.length - 1
          return (
            <li className={cn("relative flex gap-3", !last && "pb-6")} key={phase.id}>
              {!last && (
                <span
                  aria-hidden
                  className={cn(
                    "absolute top-8 bottom-0 left-[15px] w-0.5 rounded-full transition-colors",
                    state === "done" ? "bg-emerald-500/70" : "bg-border"
                  )}
                />
              )}
              <StepMarker index={index + 1} state={state} />
              <div className="min-w-0 pt-1">
                <p
                  className={cn(
                    "font-medium text-sm leading-tight",
                    state === "active" && "text-emerald-400",
                    state === "error" && "text-destructive",
                    state === "pending" && "text-muted-foreground"
                  )}
                >
                  {phase.label}
                </p>
                <p className="truncate text-muted-foreground text-xs">
                  {captionFor(index, state)}
                </p>
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

function StepMarker({ index, state }: { index: number; state: StepState }) {
  return (
    <span
      className={cn(
        "relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border-2 font-medium text-xs transition-all",
        state === "done" && "border-emerald-500 bg-emerald-500 text-white",
        state === "active" &&
          "animate-pulse border-emerald-400 bg-background text-emerald-400 shadow-[0_0_0_4px_rgba(16,185,129,0.12),0_0_14px_rgba(16,185,129,0.45)]",
        state === "error" && "border-destructive bg-destructive/10 text-destructive",
        state === "pending" && "border-border bg-background text-muted-foreground"
      )}
    >
      {state === "done" ? <CheckIcon className="size-4" strokeWidth={3} /> : index}
    </span>
  )
}
