"use client"

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { FLOW_ACTOR_LABELS, FLOW_PHASES, FLOW_STEPS, type FlowPhaseId } from "@/lib/flow-steps"
import type { ConnectionStatus } from "@/lib/backend"
import { AlertTriangleIcon, CheckIcon } from "lucide-react"

// Phases a "token-exchange" or later failure implicates — used to mark the
// phase that most likely produced the connection's errorMessage.
const FAILURE_PHASES: FlowPhaseId[] = ["token-exchange", "mcp-access"]

export function FlowVisualization({
  status,
  errorMessage,
}: {
  status: ConnectionStatus
  errorMessage?: string | null
}) {
  const complete = status === "authorized"
  const failed = status === "error"

  return (
    <div className="space-y-1">
      <h3 className="font-semibold text-sm">Connection flow</h3>
      <p className="text-muted-foreground text-xs">
        Mirrors the sequence diagram in the partner guide — expand a phase to see
        each request/response.
      </p>
      <Accordion className="mt-2" defaultValue={failed ? FAILURE_PHASES : []}>
        {FLOW_PHASES.map((phase) => {
          const steps = FLOW_STEPS.filter((s) => s.phase === phase.id)
          const phaseFailed = failed && FAILURE_PHASES.includes(phase.id)
          return (
            <AccordionItem key={phase.id} value={phase.id}>
              <AccordionTrigger>
                <span className="flex items-center gap-2">
                  {complete && !phaseFailed && (
                    <CheckIcon className="size-3.5 text-emerald-500" />
                  )}
                  {phaseFailed && <AlertTriangleIcon className="size-3.5 text-destructive" />}
                  {phase.label}
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <ol className="space-y-3">
                  {steps.map((step) => (
                    <li className="space-y-0.5" key={step.id}>
                      <div className="flex items-center gap-2">
                        <Badge className="font-mono" variant="outline">
                          {step.id}
                        </Badge>
                        <span className="font-medium text-xs">{step.title}</span>
                        <span
                          className={cn(
                            "ml-auto text-[10px] text-muted-foreground uppercase tracking-wide"
                          )}
                        >
                          {FLOW_ACTOR_LABELS[step.actor]}
                        </span>
                      </div>
                      <p className="text-muted-foreground text-xs">{step.description}</p>
                    </li>
                  ))}
                </ol>
                {phaseFailed && errorMessage && (
                  <p className="mt-3 rounded-md bg-destructive/10 p-2 text-destructive text-xs">
                    {errorMessage}
                  </p>
                )}
              </AccordionContent>
            </AccordionItem>
          )
        })}
      </Accordion>
    </div>
  )
}
