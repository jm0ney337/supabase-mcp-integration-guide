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
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input"
import { Tool, ToolContent, ToolHeader, ToolInput, ToolOutput } from "@/components/ai-elements/tool"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport, type UIMessage } from "ai"
import { DatabaseIcon } from "lucide-react"
import { useMemo } from "react"

function isToolPart(part: UIMessage["parts"][number]) {
  return part.type === "dynamic-tool" || part.type.startsWith("tool-")
}

export function ChatPanel({ connectionId, disabled }: { connectionId: string; disabled?: boolean }) {
  const transport = useMemo(
    () => new DefaultChatTransport({ api: "/api/chat", body: { connectionId } }),
    [connectionId]
  )
  const { messages, sendMessage, status, error } = useChat({ transport })

  return (
    <div className="flex h-screen flex-col">
      <Conversation>
        <ConversationContent>
          {messages.length === 0 && (
            <ConversationEmptyState
              description='Try "what tables are in this project?"'
              icon={<DatabaseIcon className="size-6" />}
              title="Ask about this Supabase project"
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
          {error && (
            <p className="text-destructive text-xs">{error.message}</p>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>
      <PromptInput
        className="border-t p-4"
        onSubmit={({ text }) => {
          if (!text.trim()) return
          sendMessage({ text })
        }}
      >
        <PromptInputBody>
          <PromptInputTextarea
            disabled={disabled}
            placeholder={disabled ? "Connect Supabase to start chatting" : "Ask about this Supabase project…"}
          />
          <PromptInputFooter>
            <span className="text-muted-foreground text-xs">
              {status === "submitted" || status === "streaming" ? "Thinking…" : ""}
            </span>
            <PromptInputSubmit disabled={disabled} status={status} />
          </PromptInputFooter>
        </PromptInputBody>
      </PromptInput>
    </div>
  )
}
