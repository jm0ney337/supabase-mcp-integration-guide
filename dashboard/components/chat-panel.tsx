"use client"

import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation"
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message"
import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input"
import { Tool, ToolContent, ToolHeader, ToolInput, ToolOutput } from "@/components/ai-elements/tool"
import { ConnectorMenu } from "@/components/connector-menu"
import { Badge } from "@/components/ui/badge"
import type { Connection } from "@/lib/backend"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport, type UIMessage } from "ai"
import { DatabaseIcon } from "lucide-react"
import { useMemo } from "react"

function isToolPart(part: UIMessage["parts"][number]) {
  return part.type === "dynamic-tool" || part.type.startsWith("tool-")
}

export function ChatPanel({
  connection,
  connections,
  loading,
  onOpenConnectors,
}: {
  connection?: Connection
  connections: Connection[]
  loading?: boolean
  onOpenConnectors: () => void
}) {
  const connectionId = connection?.id
  const ready = connection?.status === "authorized"

  const transport = useMemo(
    () => new DefaultChatTransport({ api: "/api/chat", body: { connectionId } }),
    [connectionId]
  )
  const { messages, sendMessage, status, error } = useChat({ transport })

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Conversation className="min-h-0 flex-1">
        <ConversationContent className="mx-auto w-full max-w-3xl">
          {messages.length === 0 && !loading && (
            <ConversationEmptyState
              description={
                ready
                  ? 'Try "what tables are in this project?"'
                  : "Connect an MCP server to start the conversation."
              }
              icon={<DatabaseIcon className="size-6" />}
              title={ready ? "Ask about this Supabase project" : "No connector yet"}
            />
          )}
          {messages.map((message) => (
            <Message from={message.role} key={message.id}>
              <MessageContent>
                {message.parts.map((part, i) => {
                  if (part.type === "text") {
                    return <MessageResponse key={i}>{part.text}</MessageResponse>
                  }
                  if (isToolPart(part)) {
                    const toolPart = part as UIMessage["parts"][number] & {
                      type: string
                      state: "input-streaming" | "input-available" | "output-available" | "output-error"
                      input?: unknown
                      output?: unknown
                      errorText?: string
                      toolName?: string
                    }
                    return (
                      <Tool key={i}>
                        {toolPart.type === "dynamic-tool" ? (
                          <ToolHeader state={toolPart.state} toolName={toolPart.toolName ?? "tool"} type="dynamic-tool" />
                        ) : (
                          <ToolHeader state={toolPart.state} type={toolPart.type as `tool-${string}`} />
                        )}
                        <ToolContent>
                          <ToolInput input={toolPart.input} />
                          <ToolOutput errorText={toolPart.errorText} output={toolPart.output} />
                        </ToolContent>
                      </Tool>
                    )
                  }
                  return null
                })}
              </MessageContent>
            </Message>
          ))}
          {error && <p className="text-destructive text-xs">{error.message}</p>}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="shrink-0 px-4 pb-4">
        <PromptInput
          className="mx-auto max-w-3xl"
          onSubmit={({ text }) => {
            if (!text.trim() || !ready) return
            sendMessage({ text })
          }}
        >
          {/* No PromptInputBody wrapper: InputGroup only switches to a
              stacked layout via `:has(> [data-align=block-end])`, which needs
              the footer to be a direct child. */}
          <PromptInputTextarea
            disabled={!ready}
            placeholder={
              ready ? "Ask about this Supabase project…" : "Add a connector to start chatting"
            }
          />
          <PromptInputFooter>
            <PromptInputTools>
              <ConnectorMenu connections={connections} onOpenConnectors={onOpenConnectors} />
              {!loading &&
                (ready ? (
                  <Badge className="gap-1.5 font-normal" variant="secondary">
                    <span className="size-1.5 rounded-full bg-emerald-500" />
                    Supabase
                  </Badge>
                ) : (
                  <Badge className="gap-1.5 font-normal" variant="outline">
                    <span className="size-1.5 rounded-full bg-muted-foreground" />
                    No connector
                  </Badge>
                ))}
            </PromptInputTools>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground text-xs">
                {status === "submitted" || status === "streaming" ? "Thinking…" : ""}
              </span>
              <PromptInputSubmit disabled={!ready} status={status} />
            </div>
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  )
}
