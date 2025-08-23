"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Input } from "./ui/input.tsx"
import { Button } from "@/components/ui/button.tsx"
import {
  ArrowRight,
  Loader2,
  MessageSquare,
  PanelRightOpen,
} from "lucide-react"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./ui/card.tsx"
import {
  type A2ATask,
  type ChatWithHistory,
  checkHealth,
  extractResponseText,
  extractToolCalls,
  streamMessage,
  type ToolCall as ApiToolCall,
} from "../lib/api.ts"
import Markdown from "react-markdown"
import { ToolCallDisplay } from "./tool-call-display.tsx"
import { TaskStatusDisplay } from "./task-status-display.tsx"
import {
  getErrorMessage,
  isRecoverableError,
  type JSONRPCError,
  showErrorToast,
} from "../lib/error-utils.ts"
import { ErrorDisplay } from "./ui/error-display.tsx"
import { ChatSidebar } from "./chat-sidebar.tsx"

type ToolCall = ApiToolCall

type Message = {
  role: "user" | "agent"
  content: string
  isLoading?: boolean
  toolCalls?: ToolCall[]
  task?: A2ATask
  timestamp?: number
}

interface ChatInterfaceProps {
  contextId?: string | null
  initialChatData?: ChatWithHistory | null
  isLoadingChat?: boolean
  onChatCreated?: (chatId: string) => void
  isConversationsOpen?: boolean
  onToggleConversations?: () => void
  onNewChat?: () => void
  currentChatId?: string | null
  onChatSelect?: (chatId: string) => void
  chatsRefreshKey?: number
}

export default function ChatInterface({
  contextId: propContextId,
  initialChatData,
  isLoadingChat = false,
  onChatCreated,
  isConversationsOpen,
  onToggleConversations,
  onNewChat,
  currentChatId,
  onChatSelect,
  chatsRefreshKey,
}: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isBackendConnected, setIsBackendConnected] = useState(false)
  const [connectionError, setConnectionError] = useState<
    JSONRPCError | Error | string | null
  >(null)
  const [currentTask, setCurrentTask] = useState<A2ATask | null>(null)
  const [tasks, setTasks] = useState<A2ATask[]>([])
  const [taskStartTimes, setTaskStartTimes] = useState<Record<string, number>>(
    {},
  )
  // Use prop contextId if provided, otherwise defer assignment to backend on first message
  const [contextId, setContextId] = useState<string | null>(
    propContextId || null,
  )
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Start a fresh chat locally and notify parent
  const startNewChat = useCallback(() => {
    // Clear all local UI state immediately so old messages/tasks disappear
    setMessages([])
    setCurrentTask(null)
    setTasks([])
    setTaskStartTimes({})
    setContextId(null)
    // Inform parent to clear its selected chat
    if (onNewChat) onNewChat()
  }, [onNewChat])

  // Build merged timeline of tasks + messages, de-duplicating tasks by id
  const timeline = useMemo(() => {
    type TimelineItem =
      | { kind: "message"; time: number; message: Message }
      | { kind: "task"; time: number; task: A2ATask }

    const msgTime = (
      m: Message,
    ) => (typeof m.timestamp === "number" ? m.timestamp : Date.now() / 1000)
    const taskTime = (t: A2ATask) => {
      const id = t.id
      if (id && taskStartTimes[id] != null) return taskStartTimes[id]
      const created = (t as any).createdAt
      if (typeof created === "number") return created
      if (t.status?.timestamp) return Date.parse(t.status.timestamp) / 1000
      return Date.now() / 1000
    }

    const items: TimelineItem[] = []
    for (const m of messages) {
      items.push({ kind: "message", time: msgTime(m), message: m })
    }

    // Deduplicate tasks by id, prefer the most recent by status timestamp
    const byId = new Map<string, A2ATask>()
    const consider = (t: A2ATask | null | undefined) => {
      if (!t || !t.id) return
      const prev = byId.get(t.id)
      if (!prev) {
        byId.set(t.id, t)
        return
      }
      const prevTime = prev.status?.timestamp
        ? Date.parse(prev.status.timestamp)
        : 0
      const nextTime = t.status?.timestamp ? Date.parse(t.status.timestamp) : 0
      if (nextTime >= prevTime) byId.set(t.id, t)
    }
    for (const t of tasks) consider(t)
    consider(currentTask)
    for (const t of byId.values()) {
      items.push({ kind: "task", time: taskTime(t), task: t })
    }

    items.sort((a, b) => a.time - b.time)
    return items
  }, [messages, tasks, currentTask, taskStartTimes])

  // Initialize state - check backend connection
  useEffect(() => {
    const initializeState = async () => {
      try {
        console.log("Checking backend health...")
        await checkHealth()
        setIsBackendConnected(true)
        setConnectionError(null)
        console.log("Backend connection successful")
      } catch (error) {
        console.error("Backend connection failed:", error)
        setIsBackendConnected(false)
        setConnectionError(error as JSONRPCError | Error)
      }
    }

    initializeState()
  }, [])

  // Update contextId when prop changes
  useEffect(() => {
    setContextId(propContextId || null)
  }, [propContextId])

  // Load initial chat data when provided
  useEffect(() => {
    if (initialChatData) {
      console.log("Loading initial chat data:", initialChatData)

      // Convert backend messages to frontend Message format
      const convertedMessages: Message[] = initialChatData.messages.map(
        (msg: any) => {
          // Normalize role: backend stores 'assistant', UI expects 'agent' for assistant messages
          const role: "user" | "agent" = msg.role === "assistant"
            ? "agent"
            : (msg.role as any)
          // Normalize content: either legacy msg.content or Vercel UIMessage parts array
          const content: string = typeof msg.content === "string"
            ? msg.content
            : Array.isArray(msg.parts)
            ? msg.parts.map((
              p: any,
            ) => (typeof p?.text === "string" ? p.text : "")).join("")
            : ""
          return {
            role,
            content,
            toolCalls: (msg.toolCalls as any) || undefined,
            timestamp: typeof msg.timestamp === "number"
              ? msg.timestamp
              : undefined,
          } as Message
        },
      ).filter((m) => m.content && m.content.trim().length > 0)

      setMessages(convertedMessages)
      // Attach most recent task as current task so status is visible on load
      const loadedTasks = (initialChatData.tasks || []) as any[]
      setTasks(loadedTasks as unknown as A2ATask[])
      // Seed task start times from createdAt
      setTaskStartTimes((prev) => {
        const next = { ...prev }
        for (const t of loadedTasks) {
          const id = (t as any).id
          const createdAt = (t as any).createdAt
          if (id && typeof createdAt === "number" && next[id] == null) {
            next[id] = createdAt
          }
        }
        return next
      })
      if (loadedTasks.length > 0) {
        // Pick latest by updatedAt if present, else by createdAt
        const latest = [...loadedTasks].sort((a, b) =>
          (b.updatedAt || 0) - (a.updatedAt || 0)
        )[0]
        setCurrentTask(latest as unknown as A2ATask)
      } else {
        setCurrentTask(null)
      }
    } else {
      // Clear messages for new chat
      setMessages([])
      setCurrentTask(null)
      setTasks([])
    }
  }, [initialChatData])

  // Scroll to bottom of messages
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [timeline.length, scrollToBottom])

  // New chat now lives in Conversations panel; no local button here

  const handleSendMessage = async () => {
    if (!input.trim() || isLoading) return

    const userMessage = input.trim()
    setInput("")
    setIsLoading(true)

    // Add user message
    setMessages((prev) => [...prev, { role: "user", content: userMessage }])

    // Add placeholder for agent response
    setMessages(
      (prev) => [...prev, { role: "agent", content: "", isLoading: true }],
    )

    try {
      // Use A2A streaming
      let currentResponseText = ""
      let finalToolCalls: ToolCall[] = []

      for await (const event of streamMessage(userMessage, contextId)) {
        console.log("Received A2A event:", event)

        // Handle different event types
        if (event.kind === "task") {
          // Initial task created
          const task = event as A2ATask
          setCurrentTask(task)
          setTasks((prev) => {
            const exists = prev.some((t) => t.id === task.id)
            return exists
              ? prev.map((t) => (t.id === task.id ? task : t))
              : [...prev, task]
          })
          // Record task start time on creation
          setTaskStartTimes((prev) => ({
            ...prev,
            [task.id]: prev[task.id] ??
              (task.status?.timestamp
                ? Date.parse(task.status.timestamp) / 1000
                : Date.now() / 1000),
          }))
          // Capture backend-assigned contextId on first response
          if (!contextId && task.contextId) {
            setContextId(task.contextId)
            // Notify parent component that a new chat was created
            if (onChatCreated) {
              onChatCreated(task.contextId)
            }
          } else if (contextId && task.contextId !== contextId) {
            console.warn("Task contextId changed from expected contextId:", {
              expected: contextId,
              received: task.contextId,
            })
          }
          console.log("Task created:", task.id, "contextId:", task.contextId)
        } else if (event.kind === "message" && event.role === "agent") {
          // Agent message response (could be streaming or final)
          const newText = extractResponseText(event)
          if (newText) {
            currentResponseText = newText

            // Update the agent's message
            setMessages((prev) => {
              const updated = [...prev]
              const lastMessage = updated[updated.length - 1]
              if (lastMessage.role === "agent") {
                lastMessage.content = currentResponseText
                // For simple messages (no task), this is the final response
                lastMessage.isLoading = currentTask !== null
              }
              return updated
            })

            // If no task was created, ensure we capture the contextId from the message
            if (!contextId && (event as any).contextId) {
              setContextId((event as any).contextId)
              if (onChatCreated) onChatCreated((event as any).contextId)
            }

            // If no task was created, this is a simple message and we're done
            if (currentTask === null) {
              setIsLoading(false)
              break
            }
          }
        } else if (event.kind === "status-update") {
          // Handle status updates
          console.log("Status update:", event.status.state)

          // Create or update the task using the event data directly (fixes race condition)
          setCurrentTask((prev: A2ATask | null) => {
            if (prev && prev.id === event.taskId) {
              // Update existing task
              const updated = {
                ...prev,
                status: event.status,
              }
              // Also update in tasks list
              setTasks((list) =>
                list.map((t) => (t.id === updated.id ? updated : t))
              )
              return updated
            } else {
              // Create task from status update event if not exists (race condition case)
              const created: A2ATask = {
                id: event.taskId,
                kind: "task" as const,
                contextId: event.contextId,
                status: event.status,
                history: [],
              }
              setTasks((list) => {
                const exists = list.some((t) => t.id === created.id)
                return exists
                  ? list.map((t) => (t.id === created.id ? created : t))
                  : [...list, created]
              })
              setTaskStartTimes((prevTimes) => ({
                ...prevTimes,
                [created.id]: prevTimes[created.id] ??
                  (created.status?.timestamp
                    ? Date.parse(created.status.timestamp) / 1000
                    : Date.now() / 1000),
              }))
              return created
            }
          })

          if (event.final && event.status.state === "completed") {
            // Extract final response text from the completion status event
            const finalResponseText = extractResponseText(event) ||
              currentResponseText

            // Final completion - extract tool calls from current task and store final task state
            let completedTask: A2ATask | undefined
            setCurrentTask((prev: A2ATask | null) => {
              if (prev && prev.id === event.taskId) {
                finalToolCalls = extractToolCalls(prev)
                // Create final task state with completed status
                completedTask = {
                  ...prev,
                  status: event.status,
                }
              }
              return prev
            })

            // Mark as complete and store the completed task
            setMessages((prev) => {
              const updated = [...prev]
              const lastMessage = updated[updated.length - 1]
              if (lastMessage.role === "agent") {
                lastMessage.content = finalResponseText
                lastMessage.toolCalls = finalToolCalls.length > 0
                  ? finalToolCalls
                  : undefined
                lastMessage.isLoading = false
                lastMessage.task = completedTask
              }
              return updated
            })

            // Clear current task since it's completed
            // Update tasks with final status
            setTasks((list) =>
              list.map((
                t,
              ) => (t.id === event.taskId ? { ...t, status: event.status } : t))
            )
            setCurrentTask(null)
            setIsLoading(false)
            break
          } else if (event.final && event.status.state === "failed") {
            // Clear task and handle failure
            setTasks((list) =>
              list.map((
                t,
              ) => (t.id === event.taskId ? { ...t, status: event.status } : t))
            )
            setCurrentTask(null)
            throw new Error(extractResponseText(event) || "Task failed")
          }
        }
      }
    } catch (error) {
      console.error("Error getting response from agent:", error)

      // Show error toast with development details and specific guidance
      showErrorToast(error, {
        title: "A2A Streaming Error",
        action: isRecoverableError(error)
          ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleSendMessage()}
            >
              Retry
            </Button>
          )
          : undefined,
      })

      // Update with an error message
      setMessages((prev) => {
        const updated = [...prev]
        const lastMessage = updated[updated.length - 1]
        if (lastMessage.role === "agent") {
          lastMessage.content = getErrorMessage(error)
          lastMessage.isLoading = false
        }
        return updated
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  return (
    <div ref={containerRef} className="relative h-full">
      <Card className="flex flex-col h-full overflow-hidden shadow-md">
        <CardHeader className="pb-4 flex flex-row justify-between items-center">
          <div>
            <CardTitle className="flex items-center gap-2 text-xl">
              <MessageSquare className="h-5 w-5 text-primary" />
              Chat with agent
            </CardTitle>
            <CardDescription>
              {!isBackendConnected
                ? "⚠️ Backend not connected. Check your API connection."
                : isLoadingChat
                ? "Loading conversation..."
                : contextId
                ? `Active chat: ${contextId.slice(-8)}`
                : "Start a new conversation"}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              title={isConversationsOpen
                ? "Hide conversations"
                : "Show conversations"}
              onClick={onToggleConversations}
              className="gap-2"
            >
              <MessageSquare className="h-4 w-4" />
              {isConversationsOpen ? "Hide" : "Show"}
            </Button>
            {onNewChat && (
              <Button
                variant="outline"
                size="sm"
                title="New chat"
                onClick={startNewChat}
              >
                New
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent className="flex-1 min-h-0 p-0">
          <div className="h-full w-full flex">
            {/* Messages area */}
            <div className="flex-1 min-w-0 p-4 overflow-y-auto">
              {connectionError && !isBackendConnected && (
                <div className="mb-4">
                  <ErrorDisplay
                    error={connectionError}
                    title="Connection Error"
                    onRetry={() => {
                      const checkBackendHealth = async () => {
                        try {
                          const health = await checkHealth()
                          setIsBackendConnected(health.status === "ok")
                          setConnectionError(null)
                        } catch (error) {
                          console.error("Backend health check failed:", error)
                          setIsBackendConnected(false)
                          setConnectionError(
                            error as JSONRPCError | Error | string,
                          )
                        }
                      }
                      checkBackendHealth()
                    }}
                    onDismiss={() => setConnectionError(null)}
                  />
                </div>
              )}
              {/* Build merged timeline of tasks + messages */}
              <div className="flex flex-col space-y-4">
                {isLoadingChat
                  ? (
                    <div className="flex items-center justify-center h-full text-muted-foreground">
                      <Loader2 className="h-6 w-6 animate-spin mr-2" />
                      Loading conversation...
                    </div>
                  )
                  : messages.length === 0
                  ? (
                    <div className="flex items-center justify-center h-full text-muted-foreground">
                      Send a message to start the conversation
                    </div>
                  )
                  : (
                    timeline.map((item, index) => {
                      if (item.kind === "task") {
                        return (
                          <div key={`task-${item.task.id}`} className="w-full">
                            <TaskStatusDisplay task={item.task} />
                          </div>
                        )
                      }
                      const message = item.message
                      return (
                        <div
                          key={`msg-${index}`}
                          className={`flex ${
                            message.role === "user"
                              ? "justify-end"
                              : "justify-start"
                          }`}
                        >
                          <div className={`max-w-[80%]`}>
                            <div
                              className={`inline-block w-fit align-top rounded-2xl px-4 py-2 break-words max-w-full ${
                                message.role === "user"
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-muted text-left"
                              }`}
                            >
                              {message.role === "agent"
                                ? (
                                  <div className="space-y-2">
                                    {message.toolCalls && (
                                      <ToolCallDisplay
                                        toolCalls={message.toolCalls}
                                      />
                                    )}
                                    <div className="markdown">
                                      <Markdown>{message.content}</Markdown>
                                    </div>
                                  </div>
                                )
                                : (
                                  message.content
                                )}
                              {message.isLoading && (
                                <Loader2 className="h-4 w-4 ml-1 inline animate-spin" />
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })
                  )}
                <div ref={messagesEndRef} />
              </div>
            </div>
            {/* Conversations inline panel */}
            <div
              className={[
                "relative border-l bg-background/50 transition-all duration-300 ease-out",
                isConversationsOpen
                  ? "w-[340px] sm:w-[360px] opacity-100"
                  : "w-0 opacity-0 pointer-events-none",
              ].join(" ")}
            >
              <div className="h-full flex flex-col">
                <div className="flex-1 min-h-0">
                  <ChatSidebar
                    variant="inline"
                    hideTitleBar
                    currentChatId={currentChatId}
                    onChatSelect={(id) => onChatSelect && onChatSelect(id)}
                    onNewChat={startNewChat}
                    refreshKey={chatsRefreshKey}
                  />
                </div>
              </div>
            </div>
          </div>
        </CardContent>

        <CardFooter className="border-t p-4">
          <div className="flex w-full items-center gap-2">
            <Input
              value={input}
              onChange={(e) =>
                setInput(
                  (e.target as HTMLInputElement | HTMLTextAreaElement).value,
                )}
              onKeyDown={handleKeyDown}
              placeholder="Type your message..."
              className="flex-1 rounded-full"
              disabled={isLoading || !isBackendConnected}
            />
            <Button
              onClick={handleSendMessage}
              size="icon"
              className="rounded-full"
              disabled={!input.trim() || isLoading || !isBackendConnected}
            >
              {isLoading
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <ArrowRight className="h-4 w-4" />}
              <span className="sr-only">Send message</span>
            </Button>
          </div>
        </CardFooter>
      </Card>

      {/* Rail button aligned to Chat Interface when panel is hidden */}
      {!isConversationsOpen && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2 z-10">
          <Button
            variant="outline"
            size="icon"
            className="shadow-sm"
            title="Show conversations (Cmd/Ctrl+K)"
            onClick={onToggleConversations}
          >
            <PanelRightOpen className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  )
}
