"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Input } from "./ui/input.tsx"
import { Button } from "@/components/ui/button.tsx"
import Markdown from "react-markdown"
import remarkGfm from "remark-gfm"
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
  type CapabilityCall,
  type ChatWithHistory,
  checkHealth,
  extractCapabilityCalls,
  extractResponseText,
  streamMessage,
} from "../lib/api.ts"
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
    taskUpdates?: Array<
      { id: string; role: "user" | "agent" | "status"; text: string }
    >
  }
  tasks: TimelineTask[]
}

const createEntryId = () =>
  globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)

const toTimestampSeconds = (value?: string | number | null) => {
  if (typeof value === "number") {
    return value > 1e12 ? value / 1000 : value
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value)
    return Number.isNaN(parsed) ? null : parsed / 1000
  }
  return null
}

const taskStatusMeta = {
  submitted: {
    label: "Submitted",
    badgeClass: "border-blue-200/70 text-blue-700 bg-blue-100/60",
  },
  working: {
    label: "Working",
    badgeClass: "border-amber-200/70 text-amber-700 bg-amber-100/60",
  },
  "input-required": {
    label: "Input Required",
    badgeClass: "border-orange-200/70 text-orange-700 bg-orange-100/60",
  },
  completed: {
    label: "Completed",
    badgeClass: "border-emerald-200/70 text-emerald-700 bg-emerald-100/60",
  },
  failed: {
    label: "Failed",
    badgeClass: "border-rose-200/70 text-rose-700 bg-rose-100/60",
  },
  canceled: {
    label: "Canceled",
    badgeClass: "border-border text-muted-foreground bg-muted/50",
  },
  unknown: {
    label: "Unknown",
    badgeClass: "border-border text-muted-foreground bg-muted/50",
  },
} satisfies Record<string, { label: string; badgeClass: string }>

const getTaskStatusInfo = (task: A2ATask) => {
  const state =
    (task.status?.state as keyof typeof taskStatusMeta | undefined) ?? "unknown"
  return taskStatusMeta[state] ?? taskStatusMeta.unknown
}

const extractTextFromParts = (parts: unknown[]): string => {
  if (!Array.isArray(parts)) return ""
  return parts
    .filter((part) => {
      if (!part || typeof part !== "object") return false
      const candidate = part as { kind?: string; type?: string }
      return candidate.kind === "text" || candidate.type === "text"
    })
    .map((part) => {
      if (!part || typeof part !== "object") return ""
      const candidate = part as { text?: string }
      return candidate.text ?? ""
    })
    .filter(Boolean)
    .join("\n\n")
    .trim()
}

const buildTaskUpdates = (task: A2ATask) => {
  const updates: Array<
    { id: string; role: "user" | "agent" | "status"; text: string }
  > = []
  const seenIds = new Set<string>()

  if (Array.isArray(task.history)) {
    for (const message of task.history) {
      if (!message || typeof message !== "object") continue
      const role = (message as { role?: string }).role
      const metadata = (message as { metadata?: { kind?: string } }).metadata

      // Determine if this is a status message or regular agent/user message
      const isStatusMessage = metadata?.kind === "status-message"

      if (
        !isStatusMessage && role !== "user" && role !== "assistant" &&
        role !== "agent"
      ) continue

      const normalizedRole = isStatusMessage
        ? "status"
        : (role === "user" ? "user" : "agent")
      const parts = (message as { parts?: unknown[] }).parts ?? []
      const text = extractTextFromParts(parts)
      if (!text) continue

      const messageId = (message as { messageId?: string }).messageId ??
        `${task.id ?? "task"}-history-${updates.length}`

      // Skip duplicates based on message ID
      if (seenIds.has(messageId)) continue
      seenIds.add(messageId)

      updates.push({
        id: messageId,
        role: normalizedRole,
        text,
      })
    }
  }

  // Note: We don't add task.status?.message here because it's already in history

  return updates
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
  const [timelineEntries, setTimelineEntries] = useState<TimelineEntry[]>([])
  const [taskLocations, setTaskLocations] = useState<
    Record<string, { entryId: string; index: number }>
  >({})
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
      setTimelineEntries((prev) =>
        prev.map((entry) => entry.id === entryId ? updater(entry) : entry)
      )
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

      setTimelineEntries((prev) =>
        prev.map((entry) => {
          if (entry.id !== entryId) return entry

          const existingIndex = entry.tasks.findIndex((item) =>
            item.id === taskId
          )
          const previousTask = existingIndex >= 0
            ? entry.tasks[existingIndex].task
            : null
          const nextTask = buildTask(previousTask)
          nextTaskRef = nextTask

          const createdAt = (nextTask as { createdAt?: number }).createdAt
            ? Number((nextTask as { createdAt?: number }).createdAt)
            : nextTask.status?.timestamp
            ? Date.parse(nextTask.status.timestamp) / 1000
            : Date.now() / 1000

          if (existingIndex >= 0) {
            const nextTasks = [...entry.tasks]
            nextTasks[existingIndex] = { id: taskId, task: nextTask, createdAt }
            const sortedTasks = sortTasksByTime(nextTasks)
            updatedIndex = sortedTasks.findIndex((item) => item.id === taskId)
            return { ...entry, tasks: sortedTasks }
          }

          const appendedTasks = [...entry.tasks, {
            id: taskId,
            task: nextTask,
            createdAt,
          }]
          const sortedTasks = sortTasksByTime(appendedTasks)
          updatedIndex = sortedTasks.findIndex((item) => item.id === taskId)
          return {
            ...entry,
            tasks: sortedTasks,
          }
        })
      )

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
      const seconds = toTimestampSeconds(value ?? null)
      return seconds ?? Date.now() / 1000
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
        timestamp: msg.metadata?.timestamp
          ? normalizeTimestamp(msg.metadata.timestamp)
          : undefined,
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

    const nextTaskLocations: Record<
      string,
      { entryId: string; index: number }
    > = {}
    const attachTaskToEntry = (task: A2ATask, entry: TimelineEntry) => {
      if (!task.id) return
      const createdAt = (task as { createdAt?: number }).createdAt
        ? Number((task as { createdAt?: number }).createdAt)
        : task.status?.timestamp
        ? Date.parse(task.status.timestamp) / 1000
        : Date.now() / 1000

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
        : a.status?.timestamp
        ? Date.parse(a.status.timestamp) / 1000
        : 0
      const bTime = (b as { createdAt?: number }).createdAt
        ? Number((b as { createdAt?: number }).createdAt)
        : b.status?.timestamp
        ? Date.parse(b.status.timestamp) / 1000
        : 0
      return aTime - bTime
    })

    for (const task of sortedTasks) {
      if (!task?.id) continue
      const taskTime = (task as { createdAt?: number }).createdAt
        ? Number((task as { createdAt?: number }).createdAt)
        : task.status?.timestamp
        ? Date.parse(task.status.timestamp) / 1000
        : 0

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
              if (!prevTask) {
                console.log(
                  "New task created, history length:",
                  task.history?.length ?? 0,
                )
                return task
              }
              console.log(
                "Merging task - prev history:",
                prevTask.history?.length ?? 0,
                "new history:",
                task.history?.length ?? 0,
              )
              // Merge new task data into previous task, preserving history
              const merged = {
                ...prevTask,
                ...task,
                // Preserve history if new task doesn't have it
                history:
                  (Array.isArray(task.history) && task.history.length > 0)
                    ? task.history
                    : (prevTask.history || []),
              }
              console.log(
                "After merge, history length:",
                merged.history?.length ?? 0,
              )
              return merged
            },
          )
          // Capture backend-assigned contextId on first response
          if (!contextId && task.contextId) {
            setContextId(task.contextId)
            if (onChatCreated) onChatCreated(task.contextId)
          } else if (
            contextId && task.contextId && task.contextId !== contextId
          ) {
            console.warn("Task contextId changed from expected contextId:", {
              expected: contextId,
              received: task.contextId,
            })
          }
          console.log(
            "Task event - id:",
            task.id,
            "contextId:",
            task.contextId,
            "history length:",
            task.history?.length ?? 0,
          )
          if (mergedTask) {
            finalCapabilityCalls = extractCapabilityCalls(mergedTask)
            console.log(
              "Merged task history length:",
              (mergedTask as A2ATask).history?.length ?? 0,
            )

            // Update task updates whenever we receive task data with history
            const taskHistory = (mergedTask as A2ATask).history
            if (Array.isArray(taskHistory) && taskHistory.length > 0) {
              const taskUpdates = buildTaskUpdates(mergedTask)
              console.log(
                "Built",
                taskUpdates.length,
                "task updates from history",
              )
              updateEntry(targetEntryId, (entry) => {
                return {
                  ...entry,
                  agent: entry.agent
                    ? {
                      ...entry.agent,
                      taskUpdates,
                    }
                    : entry.agent,
                }
              })
            }
          }
        } else if (event.kind === "message" && event.role === "agent") {
          // Agent message response (could be streaming or final)
          const newText = extractResponseText(event)
          if (newText) {
            currentResponseText = newText
            const messageTaskId = (event as { taskId?: string }).taskId

            // If this message is associated with a task, add it to task history
            if (messageTaskId) {
              const targetEntryId = resolveEntryIdForTask(messageTaskId)

              // Add message to task history and update task updates
              upsertTask(targetEntryId, messageTaskId, (prevTask) => {
                const updatedTask: A2ATask = {
                  ...(prevTask || {
                    id: messageTaskId,
                    kind: "task" as const,
                    contextId: contextId || "",
                    status: {
                      state: "working" as const,
                      timestamp: new Date().toISOString(),
                    },
                  }),
                  history: [...(prevTask?.history || []), event],
                }

                // Rebuild and update task updates to include the new message
                const taskUpdates = buildTaskUpdates(updatedTask)
                updateEntry(targetEntryId, (entry) => ({
                  ...entry,
                  agent: entry.agent
                    ? {
                      ...entry.agent,
                      taskUpdates,
                    }
                    : entry.agent,
                }))

                return updatedTask
              })
            } else {
              // No task - update agent content directly
              const targetEntryId = activeEntryIdRef.current ?? entryId
              updateEntry(targetEntryId, (entry) => ({
                ...entry,
                agent: entry.agent
                  ? {
                    ...entry.agent,
                    content: currentResponseText,
                    isLoading: false,
                    timestamp: Date.now() / 1000,
                  }
                  : {
                    content: currentResponseText,
                    isLoading: false,
                    timestamp: Date.now() / 1000,
                  },
              }))
            }

            // Capture contextId from message if needed
            if (!contextId && (event as { contextId?: string }).contextId) {
              setContextId((event as { contextId?: string }).contextId!)
              if (onChatCreated) {
                onChatCreated((event as { contextId?: string }).contextId!)
              }
            }
          }
        } else if (event.kind === "status-update") {
          // Handle status updates
          const targetEntryId = resolveEntryIdForTask(event.taskId)

          const nextTask = upsertTask(
            targetEntryId,
            event.taskId,
            (prevTask) => {
              // Build updated history
              const prevHistory = prevTask?.history || []
              const newHistory = event.status.message
                ? [...prevHistory, event.status.message]
                : prevHistory

              if (prevTask) {
                return {
                  ...prevTask,
                  status: event.status,
                  history: newHistory,
                }
              }
              return {
                id: event.taskId,
                kind: "task",
                contextId: event.contextId,
                status: event.status,
                history: newHistory,
              }
            },
          )

          // Update task updates in the UI whenever history changes
          if (
            nextTask && "history" in nextTask &&
            (nextTask as A2ATask).history &&
            (nextTask as A2ATask).history!.length > 0
          ) {
            const taskUpdates = buildTaskUpdates(nextTask)
            updateEntry(targetEntryId, (entry) => {
              return {
                ...entry,
                agent: entry.agent
                  ? {
                    ...entry.agent,
                    taskUpdates,
                  }
                  : entry.agent,
              }
            })
          }

          if (event.final && event.status.state === "completed") {
            updateEntry(targetEntryId, (entry) => {
              const updates = nextTask ? buildTaskUpdates(nextTask) : []
              const newCapabilities = nextTask
                ? extractCapabilityCalls(nextTask)
                : finalCapabilityCalls
              return {
                ...entry,
                agent: entry.agent
                  ? {
                    ...entry.agent,
                    capabilityCalls: newCapabilities.length > 0
                      ? newCapabilities
                      : entry.agent.capabilityCalls,
                    isLoading: false,
                    taskUpdates: updates,
                  }
                  : entry.agent,
              }
            })
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
      const targetEntryId = activeEntryIdRef.current ??
        timelineEntriesRef.current.at(-1)?.id
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
                {isLoadingChat
                  ? (
                    <div className="flex items-center justify-center h-full text-muted-foreground">
                      <Loader2 className="h-6 w-6 animate-spin mr-2" />
                      Loading conversation...
                    </div>
                  )
                  : !hasEntries
                  ? (
                    <div className="flex items-center justify-center h-full text-muted-foreground">
                      Send a message to start the conversation
                    </div>
                  )
                  : (
                    timelineEntries.map((entry) => {
                      const hasTasks = entry.tasks.length > 0
                      const capabilityCalls = entry.agent?.capabilityCalls ?? []
                      // Only show agent card if there are NO tasks
                      const showAgentCard = entry.agent && !hasTasks

                      // Check if user message exists in any task history
                      const userMessageInTaskHistory = hasTasks &&
                        entry.tasks.some((item) => {
                          const updates = buildTaskUpdates(item.task)
                          return updates.some((update) =>
                            update.role === "user" &&
                            update.text === entry.user.content
                          )
                        })

                      return (
                        <div
                          key={entry.id}
                          className="space-y-3"
                        >
                          <div className="space-y-3">
                            {!userMessageInTaskHistory && (
                              <div className="rounded-2xl border border-sky-400/60 bg-sky-200/70 px-4 py-3 text-slate-900 shadow-sm dark:border-sky-900/70 dark:bg-sky-900/40 dark:text-sky-50">
                                <div className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-700/80 dark:text-sky-200/80">
                                  <span>You</span>
                                  <span>
                                    {formatTimestamp(entry.user.timestamp)}
                                  </span>
                                </div>
                                {entry.user.content
                                  ? (
                                    <div className="prose prose-sm text-slate-900 dark:prose-invert max-w-none">
                                      <Markdown remarkPlugins={[remarkGfm]}>
                                        {entry.user.content}
                                      </Markdown>
                                    </div>
                                  )
                                  : (
                                    <span className="text-slate-600/80 dark:text-slate-300/80">
                                      (empty message)
                                    </span>
                                  )}
                              </div>
                            )}

                            {showAgentCard && entry.agent && (
                              <div className="rounded-2xl border border-violet-400/60 bg-violet-200/70 px-4 py-3 text-slate-900 shadow-sm dark:border-violet-900/70 dark:bg-violet-900/40 dark:text-violet-50">
                                <div className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-700/80 dark:text-violet-200/80">
                                  <span>Agent</span>
                                  <span>
                                    {formatTimestamp(entry.agent.timestamp)}
                                  </span>
                                </div>
                                {entry.agent.isLoading
                                  ? (
                                    <span className="inline-flex items-center gap-2 text-muted-foreground">
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                      {hasTasks
                                        ? "Working on task..."
                                        : "Thinking..."}
                                    </span>
                                  )
                                  : entry.agent.content
                                  ? (
                                    <div className="prose prose-sm text-slate-900 dark:prose-invert max-w-none">
                                      <Markdown remarkPlugins={[remarkGfm]}>
                                        {entry.agent.content}
                                      </Markdown>
                                    </div>
                                  )
                                  : !hasTasks
                                  ? (
                                    <span className="text-slate-600/80 dark:text-slate-300/80">
                                      No response
                                    </span>
                                  )
                                  : null}
                                {!entry.agent.isLoading && !hasTasks &&
                                  entry.agent.capabilityCalls &&
                                  entry.agent.capabilityCalls.length > 0 && (
                                  <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                                    <div className="font-medium uppercase tracking-wide">
                                      Capability Calls
                                    </div>
                                    <ul className="ml-4 list-disc space-y-1">
                                      {entry.agent.capabilityCalls.map((
                                        call,
                                        idx,
                                      ) => (
                                        <li key={`${call.name}-${idx}`}>
                                          <span className="font-medium text-foreground/80">
                                            {call.name}
                                          </span>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                              </div>
                            )}

                            {entry.tasks.map((item, taskIndex) => {
                              const task = item.task
                              const statusInfo = getTaskStatusInfo(task)
                              const updates = entry.agent?.taskUpdates ??
                                buildTaskUpdates(task)
                              const hasUpdates = updates.length > 0
                              const shortId = item.id.slice(-8)
                              const statusTimestampSeconds = toTimestampSeconds(
                                task.status?.timestamp ?? null,
                              )
                              const statusTimestamp =
                                statusTimestampSeconds != null
                                  ? formatTimestamp(statusTimestampSeconds)
                                  : null
                              const capabilityCallsForTask = taskIndex === 0
                                ? capabilityCalls
                                : []

                              return (
                                <div
                                  key={item.id}
                                  className="relative mt-6 space-y-4"
                                >
                                  <div
                                    className={`inline-flex items-center gap-3 rounded-full border px-4 py-1.5 text-xs font-semibold shadow-sm ${
                                      task.status?.state === "submitted"
                                        ? "border-blue-500/40 bg-blue-200/80 text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/60 dark:text-blue-100"
                                        : task.status?.state === "working"
                                        ? "border-amber-500/40 bg-amber-200/80 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/60 dark:text-amber-100"
                                        : task.status?.state ===
                                            "input-required"
                                        ? "border-orange-500/40 bg-orange-200/80 text-orange-900 dark:border-orange-900/60 dark:bg-orange-950/60 dark:text-orange-100"
                                        : task.status?.state === "completed"
                                        ? "border-emerald-500/40 bg-emerald-200/80 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/60 dark:text-emerald-100"
                                        : task.status?.state === "failed"
                                        ? "border-rose-500/40 bg-rose-200/80 text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/60 dark:text-rose-100"
                                        : "border-slate-500/40 bg-slate-200/80 text-slate-900 dark:border-slate-900/60 dark:bg-slate-950/60 dark:text-slate-100"
                                    }`}
                                  >
                                    {task.status?.state === "working" && (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    )}
                                    <span>{statusInfo.label}</span>
                                    <span
                                      className={task.status?.state ===
                                          "submitted"
                                        ? "text-blue-700/90 dark:text-blue-200/80"
                                        : task.status?.state === "working"
                                        ? "text-amber-700/90 dark:text-amber-200/80"
                                        : task.status?.state ===
                                            "input-required"
                                        ? "text-orange-700/90 dark:text-orange-200/80"
                                        : task.status?.state === "completed"
                                        ? "text-emerald-700/90 dark:text-emerald-200/80"
                                        : task.status?.state === "failed"
                                        ? "text-rose-700/90 dark:text-rose-200/80"
                                        : "text-slate-700/90 dark:text-slate-200/80"}
                                    >
                                      Task {shortId}
                                    </span>
                                    {statusTimestamp && (
                                      <span
                                        className={task.status?.state ===
                                            "submitted"
                                          ? "text-blue-700/70 dark:text-blue-300/70"
                                          : task.status?.state === "working"
                                          ? "text-amber-700/70 dark:text-amber-300/70"
                                          : task.status?.state ===
                                              "input-required"
                                          ? "text-orange-700/70 dark:text-orange-300/70"
                                          : task.status?.state === "completed"
                                          ? "text-emerald-700/70 dark:text-emerald-300/70"
                                          : task.status?.state === "failed"
                                          ? "text-rose-700/70 dark:text-rose-300/70"
                                          : "text-slate-700/70 dark:text-slate-300/70"}
                                      >
                                        • {statusTimestamp}
                                      </span>
                                    )}
                                  </div>
                                  {hasUpdates && (
                                    <div className="pointer-events-none absolute left-0 top-12 bottom-4 w-[2px] bg-border/70" />
                                  )}
                                  <div className="space-y-3 pl-4">
                                    {!hasUpdates
                                      ? (
                                        <p className="text-xs text-emerald-800/80 dark:text-emerald-100/80">
                                          No task updates yet.
                                        </p>
                                      )
                                      : (
                                        updates.map((update) => (
                                          <div
                                            key={update.id}
                                            className="pl-2"
                                          >
                                            <div
                                              className={`rounded-lg border px-4 py-3 shadow-sm ${
                                                update.role === "user"
                                                  ? "border-sky-400/60 bg-sky-200/70 dark:border-sky-900/70 dark:bg-sky-900/40"
                                                  : update.role === "agent"
                                                  ? "border-violet-400/60 bg-violet-200/70 dark:border-violet-900/70 dark:bg-violet-900/40"
                                                  : "border-border/60 bg-card/95 dark:border-border/70 dark:bg-slate-950/50"
                                              }`}
                                            >
                                              <div
                                                className={`mb-2 text-[11px] font-semibold uppercase tracking-wide ${
                                                  update.role === "user"
                                                    ? "text-slate-700/80 dark:text-sky-200/80"
                                                    : update.role === "agent"
                                                    ? "text-slate-700/80 dark:text-violet-200/80"
                                                    : "text-emerald-800/80 dark:text-emerald-100/80"
                                                }`}
                                              >
                                                {update.role === "user"
                                                  ? "You"
                                                  : update.role === "agent"
                                                  ? "Agent"
                                                  : "Status"}
                                              </div>
                                              <div className="prose prose-sm text-slate-900 dark:prose-invert max-w-none">
                                                <Markdown
                                                  remarkPlugins={[remarkGfm]}
                                                >
                                                  {update.text}
                                                </Markdown>
                                              </div>
                                            </div>
                                          </div>
                                        ))
                                      )}
                                    {capabilityCallsForTask.length > 0 && (
                                      <ul className="ml-6 list-disc space-y-1 text-xs text-emerald-800/90 dark:text-emerald-100">
                                        {capabilityCallsForTask.map((
                                          call,
                                          idx,
                                        ) => (
                                          <li key={`${call.name}-${idx}`}>
                                            <span className="font-semibold text-foreground">
                                              {call.name}
                                            </span>
                                          </li>
                                        ))}
                                      </ul>
                                    )}
                                  </div>
                                </div>
                              )
                            })}
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
