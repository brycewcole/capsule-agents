"use client"

import { useCallback, useEffect, useRef, useState } from "react"
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
import { Separator } from "./ui/separator.tsx"
import {
  type A2ATask,
  type CapabilityCall,
  type ChatWithHistory,
  checkHealth,
  extractCapabilityCalls,
  extractResponseText,
  streamMessage,
} from "../lib/api.ts"
/* message bubbles removed in favor of tasks-only view */
import { TaskStatusDisplay } from "./task-status-display.tsx"
import {
  getErrorMessage,
  isRecoverableError,
  type JSONRPCError,
  showErrorToast,
} from "../lib/error-utils.ts"
import { ErrorDisplay } from "./ui/error-display.tsx"
import { ChatSidebar } from "./chat-sidebar.tsx"

// CapabilityCall is not used in tasks-only rendering
// type CapabilityCall = ApiCapabilityCall

type Message = {
  role: "user" | "agent"
  content: string
  isLoading?: boolean
  capabilityCalls?: CapabilityCall[]
  task?: A2ATask | null
  timestamp?: number
}

type TimelineTask = {
  id: string
  task: A2ATask
  createdAt: number
}

type TimelineEntry = {
  id: string
  user: {
    content: string
    timestamp: number
  }
  agent?: {
    content: string
    timestamp: number
    isLoading: boolean
    capabilityCalls?: CapabilityCall[]
  }
  tasks: TimelineTask[]
}

const createEntryId = () =>
  globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)

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
  const [timelineEntries, setTimelineEntries] = useState<TimelineEntry[]>([])
  const [taskLocations, setTaskLocations] = useState<Record<string, { entryId: string; index: number }>>({})
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isBackendConnected, setIsBackendConnected] = useState(false)
  const [connectionError, setConnectionError] = useState<
    JSONRPCError | Error | string | null
  >(null)
  // Use prop contextId if provided, otherwise defer assignment to backend on first message
  const [contextId, setContextId] = useState<string | null>(
    propContextId || null,
  )
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const activeEntryIdRef = useRef<string | null>(null)
  const taskLocationsRef = useRef(taskLocations)
  const timelineEntriesRef = useRef<TimelineEntry[]>([])

  const formatTimestamp = useCallback((seconds: number) => {
    return new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "numeric",
    }).format(new Date(seconds * 1000))
  }, [])

  useEffect(() => {
    taskLocationsRef.current = taskLocations
  }, [taskLocations])

  useEffect(() => {
    timelineEntriesRef.current = timelineEntries
  }, [timelineEntries])

  const appendEntry = useCallback((entry: TimelineEntry) => {
    setTimelineEntries((prev) => [...prev, entry])
  }, [])

  const updateEntry = useCallback(
    (entryId: string, updater: (entry: TimelineEntry) => TimelineEntry) => {
      setTimelineEntries((prev) => prev.map((entry) => entry.id === entryId
        ? updater(entry)
        : entry))
    },
    [],
  )

  const upsertTask = useCallback(
    (
      entryId: string,
      taskId: string,
      buildTask: (previous: A2ATask | null) => A2ATask,
    ) => {
      let nextTaskRef: A2ATask | null = null
      let updatedIndex = 0

      const sortTasksByTime = (tasks: TimelineTask[]) =>
        tasks.slice().sort((a, b) => a.createdAt - b.createdAt)

      setTimelineEntries((prev) => prev.map((entry) => {
        if (entry.id !== entryId) return entry

        const existingIndex = entry.tasks.findIndex((item) => item.id === taskId)
        const previousTask = existingIndex >= 0 ? entry.tasks[existingIndex].task : null
        const nextTask = buildTask(previousTask)
        nextTaskRef = nextTask

        const createdAt = (nextTask as { createdAt?: number }).createdAt
          ? Number((nextTask as { createdAt?: number }).createdAt)
          : nextTask.status?.timestamp ? Date.parse(nextTask.status.timestamp) / 1000 : Date.now() / 1000

        if (existingIndex >= 0) {
          const nextTasks = [...entry.tasks]
          nextTasks[existingIndex] = { id: taskId, task: nextTask, createdAt }
          const sortedTasks = sortTasksByTime(nextTasks)
          updatedIndex = sortedTasks.findIndex((item) => item.id === taskId)
          return { ...entry, tasks: sortedTasks }
        }

        const appendedTasks = [...entry.tasks, { id: taskId, task: nextTask, createdAt }]
        const sortedTasks = sortTasksByTime(appendedTasks)
        updatedIndex = sortedTasks.findIndex((item) => item.id === taskId)
        return {
          ...entry,
          tasks: sortedTasks,
        }
      }))

      setTaskLocations((prev) => ({
        ...prev,
        [taskId]: { entryId, index: updatedIndex },
      }))

      return nextTaskRef
    },
    [],
  )

  // Start a fresh chat locally and notify parent
  const startNewChat = useCallback(() => {
    // Clear all local UI state immediately so old messages/tasks disappear
    setTimelineEntries([])
    setTaskLocations({})
    activeEntryIdRef.current = null
    timelineEntriesRef.current = []
    taskLocationsRef.current = {}
    setContextId(null)
    // Inform parent to clear its selected chat
    if (onNewChat) onNewChat()
  }, [onNewChat])

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
    if (!initialChatData) {
      setTimelineEntries([])
      setTaskLocations({})
      activeEntryIdRef.current = null
      return
    }

    console.log("Loading initial chat data:", initialChatData)

    const normalizeTimestamp = (value?: string | number | null) => {
      if (typeof value === "number") return value
      if (typeof value === "string") return new Date(value).getTime() / 1000
      return Date.now() / 1000
    }

    const normalizeMessage = (msg: {
      role?: string
      content?: string
      parts?: Array<{ text?: string }>
      capabilityCalls?: CapabilityCall[]
      metadata?: { timestamp?: string | number }
    }): Message | null => {
      const role: "user" | "agent" = msg.role === "assistant"
        ? "agent"
        : (msg.role as "user" | "agent")
      const rawContent = typeof msg.content === "string"
        ? msg.content
        : Array.isArray(msg.parts)
        ? msg.parts.map((part) => part?.text ?? "").join("")
        : ""
      const content = rawContent.trim()
      if (!content) return null

      return {
        role,
        content,
        capabilityCalls: Array.isArray(msg.capabilityCalls)
          ? msg.capabilityCalls as CapabilityCall[]
          : undefined,
        timestamp: msg.metadata?.timestamp ? normalizeTimestamp(msg.metadata.timestamp) : undefined,
      }
    }

    const convertedMessages: Message[] = (initialChatData.messages as Array<
      {
        role?: string
        content?: string
        parts?: Array<{ text?: string }>
        capabilityCalls?: CapabilityCall[]
        metadata?: { timestamp?: string | number }
      }
    >).map(normalizeMessage).filter((m): m is Message => Boolean(m))

    const nextEntries: TimelineEntry[] = []
    let currentEntry: TimelineEntry | null = null

    for (const message of convertedMessages) {
      const timestamp = message.timestamp ?? Date.now() / 1000
      if (message.role === "user") {
        currentEntry = {
          id: createEntryId(),
          user: {
            content: message.content,
            timestamp,
          },
          agent: undefined,
          tasks: [],
        }
        nextEntries.push(currentEntry)
      } else {
        if (!currentEntry) {
          currentEntry = {
            id: createEntryId(),
            user: {
              content: "",
              timestamp,
            },
            tasks: [],
          }
          nextEntries.push(currentEntry)
        }
        currentEntry.agent = {
          content: message.content,
          timestamp,
          isLoading: false,
          capabilityCalls: message.capabilityCalls,
        }
      }
    }

    for (const entry of nextEntries) {
      if (!entry.agent) {
        entry.agent = {
          content: "",
          timestamp: entry.user.timestamp,
          isLoading: false,
        }
      }
    }

    const nextTaskLocations: Record<string, { entryId: string; index: number }> = {}
    const attachTaskToEntry = (task: A2ATask, entry: TimelineEntry) => {
      if (!task.id) return
      const createdAt = (task as { createdAt?: number }).createdAt
        ? Number((task as { createdAt?: number }).createdAt)
        : task.status?.timestamp ? Date.parse(task.status.timestamp) / 1000 : Date.now() / 1000

      const existingIndex = entry.tasks.findIndex((item) => item.id === task.id)
      if (existingIndex >= 0) {
        entry.tasks[existingIndex] = {
          id: task.id,
          task,
          createdAt,
        }
        nextTaskLocations[task.id] = { entryId: entry.id, index: existingIndex }
        return
      }

      entry.tasks.push({
        id: task.id,
        task,
        createdAt,
      })
      nextTaskLocations[task.id] = {
        entryId: entry.id,
        index: entry.tasks.length - 1,
      }
    }

    const loadedTasks = ((initialChatData.tasks || []) as A2ATask[]).filter(
      (task) => task && typeof task === "object",
    )

    const sortedTasks = [...loadedTasks].sort((a, b) => {
      const aTime = (a as { createdAt?: number }).createdAt
        ? Number((a as { createdAt?: number }).createdAt)
        : a.status?.timestamp ? Date.parse(a.status.timestamp) / 1000 : 0
      const bTime = (b as { createdAt?: number }).createdAt
        ? Number((b as { createdAt?: number }).createdAt)
        : b.status?.timestamp ? Date.parse(b.status.timestamp) / 1000 : 0
      return aTime - bTime
    })

    for (const task of sortedTasks) {
      if (!task?.id) continue
      const taskTime = (task as { createdAt?: number }).createdAt
        ? Number((task as { createdAt?: number }).createdAt)
        : task.status?.timestamp ? Date.parse(task.status.timestamp) / 1000 : 0

      const targetEntry = [...nextEntries]
        .reverse()
        .find((entry) => {
          const anchor = entry.agent?.timestamp ?? entry.user.timestamp
          return anchor <= taskTime + 1 // allow slight drift
        }) ?? nextEntries[nextEntries.length - 1]

      if (targetEntry) {
        attachTaskToEntry(task, targetEntry)
      }
    }

    setTimelineEntries(nextEntries)
    setTaskLocations(nextTaskLocations)
    activeEntryIdRef.current = null
  }, [initialChatData])

  // Scroll to bottom of messages
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [timelineEntries, scrollToBottom])

  // New chat now lives in Conversations panel; no local button here

  const handleSendMessage = async () => {
    if (!input.trim() || isLoading) return

    const userMessage = input.trim()
    setInput("")
    setIsLoading(true)

    const timestamp = Date.now() / 1000
    const entryId = createEntryId()

    appendEntry({
      id: entryId,
      user: {
        content: userMessage,
        timestamp,
      },
      agent: {
        content: "",
        timestamp,
        isLoading: true,
      },
      tasks: [],
    })

    activeEntryIdRef.current = entryId

    const resolveEntryIdForTask = (taskId?: string | null) => {
      if (taskId && taskLocationsRef.current[taskId]) {
        return taskLocationsRef.current[taskId].entryId
      }
      return activeEntryIdRef.current ?? entryId
    }

    try {
      // Use A2A streaming
      let currentResponseText = ""
      let finalCapabilityCalls: CapabilityCall[] = []

      for await (const event of streamMessage(userMessage, contextId)) {
        console.log("Received A2A event:", event)

        // Handle different event types
        if (event.kind === "task") {
          // Initial task created
          const task = event as A2ATask
          if (!task.id) {
            console.warn("Received task event without id", task)
            continue
          }
          const targetEntryId = resolveEntryIdForTask(task.id)
          const mergedTask = upsertTask(
            targetEntryId,
            task.id,
            (prevTask) => {
              if (!prevTask) return task
              return {
                ...prevTask,
                ...task,
                history: Array.isArray(task.history) && task.history.length > 0
                  ? task.history
                  : prevTask.history,
              }
            },
          )
          // Capture backend-assigned contextId on first response
          if (!contextId && task.contextId) {
            setContextId(task.contextId)
            if (onChatCreated) onChatCreated(task.contextId)
          } else if (contextId && task.contextId && task.contextId !== contextId) {
            console.warn("Task contextId changed from expected contextId:", {
              expected: contextId,
              received: task.contextId,
            })
          }
          console.log("Task created:", task.id, "contextId:", task.contextId)
            finalCapabilityCalls = extractCapabilityCalls(mergedTask)
        } else if (event.kind === "message" && event.role === "agent") {
          // Agent message response (could be streaming or final)
          const newText = extractResponseText(event)
          if (newText) {
            currentResponseText = newText

            // Update the agent's message
            const targetEntryId = activeEntryIdRef.current ?? entryId
            updateEntry(targetEntryId, (entry) => ({
              ...entry,
              agent: {
                content: currentResponseText,
                isLoading: false,
                capabilityCalls: entry.agent?.capabilityCalls,
                timestamp: Date.now() / 1000,
              },
            }))

            // If no task was created, ensure we capture the contextId from the message
            if (!contextId && (event as { contextId?: string }).contextId) {
              setContextId((event as { contextId?: string }).contextId!)
              if (onChatCreated) {
                onChatCreated((event as { contextId?: string }).contextId!)
              }
            }
          }
        } else if (event.kind === "status-update") {
          // Handle status updates
          console.log("Status update:", event.status.state)
          const targetEntryId = resolveEntryIdForTask(event.taskId)
          const nextTask = upsertTask(targetEntryId, event.taskId, (prevTask) => {
            if (prevTask) {
              return {
                ...prevTask,
                status: event.status,
              }
            }
            return {
              id: event.taskId,
              kind: "task",
              contextId: event.contextId,
              status: event.status,
              history: [],
            }
          })

          if (event.final && event.status.state === "completed") {
            if (nextTask) {
              finalCapabilityCalls = extractCapabilityCalls(nextTask)
            }
            updateEntry(targetEntryId, (entry) => ({
              ...entry,
              agent: entry.agent
                ? {
                  ...entry.agent,
                  capabilityCalls: finalCapabilityCalls.length > 0
                    ? finalCapabilityCalls
                    : entry.agent.capabilityCalls,
                  isLoading: false,
                }
                : entry.agent,
            }))
            activeEntryIdRef.current = null
          } else if (event.final && event.status.state === "failed") {
            activeEntryIdRef.current = null
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
      activeEntryIdRef.current = null
      const targetEntryId = activeEntryIdRef.current ?? timelineEntriesRef.current.at(-1)?.id
      if (targetEntryId) {
        updateEntry(targetEntryId, (entry) => ({
          ...entry,
          agent: {
            content: getErrorMessage(error),
            isLoading: false,
            timestamp: Date.now() / 1000,
            capabilityCalls: entry.agent?.capabilityCalls,
          },
        }))
      }
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

  const hasEntries = timelineEntries.length > 0

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
              {/* Render unified timeline */}
              <div className="flex flex-col space-y-6">
                {isLoadingChat ? (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    <Loader2 className="h-6 w-6 animate-spin mr-2" />
                    Loading conversation...
                  </div>
                ) : !hasEntries ? (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    Send a message to start the conversation
                  </div>
                ) : (
                  timelineEntries.map((entry, index) => {
                    const showConnector = index < timelineEntries.length - 1

                    return (
                      <div
                        key={entry.id}
                        className="grid grid-cols-[auto_minmax(0,1fr)] gap-4"
                      >
                        <div className="flex flex-col items-center">
                          <div className="h-2 w-2 rounded-full bg-primary" />
                          {showConnector && (
                            <div className="mt-2 w-px flex-1 bg-border" />
                          )}
                        </div>
                        <div className="space-y-3">
                          <Card className="border-muted/40 bg-muted/30">
                            <CardHeader className="p-4 pb-2">
                              <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                <span>You</span>
                                <span>{formatTimestamp(entry.user.timestamp)}</span>
                              </div>
                            </CardHeader>
                            <CardContent className="px-4 pb-4 text-sm whitespace-pre-wrap break-words">
                              {entry.user.content || (
                                <span className="text-muted-foreground">(empty message)</span>
                              )}
                            </CardContent>
                          </Card>

                          {entry.agent && (
                            <Card className="border-primary/20 bg-primary/5">
                              <CardHeader className="p-4 pb-2">
                                <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                  <span>Agent</span>
                                  <span>{formatTimestamp(entry.agent.timestamp)}</span>
                                </div>
                              </CardHeader>
                              <CardContent className="px-4 pb-4 text-sm text-foreground">
                                {entry.agent.isLoading ? (
                                  <span className="inline-flex items-center gap-2 text-muted-foreground">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Thinking...
                                  </span>
                                ) : entry.agent.content ? (
                                  <div className="whitespace-pre-wrap break-words">
                                    {entry.agent.content}
                                  </div>
                                ) : (
                                  <span className="text-muted-foreground">No response</span>
                                )}
                                {!entry.agent.isLoading &&
                                  entry.agent.capabilityCalls &&
                                  entry.agent.capabilityCalls.length > 0 && (
                                    <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                                      <div className="font-medium uppercase tracking-wide">
                                        Capability Calls
                                      </div>
                                      <ul className="ml-4 list-disc space-y-1">
                                        {entry.agent.capabilityCalls.map((call, idx) => (
                                          <li key={`${call.name}-${idx}`}>
                                            <span className="font-medium text-foreground/80">
                                              {call.name}
                                            </span>
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}
                              </CardContent>
                            </Card>
                          )}

                          {entry.tasks.length > 0 && <Separator className="my-2" />}

                          {entry.tasks.map((item) => (
                            <TaskStatusDisplay key={item.id} task={item.task} />
                          ))}
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
