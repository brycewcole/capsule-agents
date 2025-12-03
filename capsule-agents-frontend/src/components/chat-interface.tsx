"use client"

import { type ReactNode, useCallback, useEffect, useRef, useState } from "react"
import { Textarea } from "./ui/textarea.tsx"
import { Button } from "@/components/ui/button.tsx"
import Markdown from "react-markdown"
import remarkGfm from "remark-gfm"
import {
  ArrowRight,
  Download,
  FileText,
  Loader2,
  Maximize2,
  MessageSquare,
  X,
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog.tsx"
import type { Artifact, Part } from "@a2a-js/sdk"
import {
  type A2ATask,
  cancelTask,
  type CapabilityCall,
  type ChatWithHistory,
  checkHealth,
  extractCapabilityCalls,
  extractResponseText,
  fetchTaskById,
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
  artifacts?: Artifact[]
}

type TaskTimelineUpdate = {
  id: string
  kind: "message" | "artifact"
  timestamp: number
  role?: "user" | "agent" | "status"
  text?: string
  artifact?: Artifact
  lastChunk?: boolean
}

type ArtifactPreviewState = {
  artifactId: string
  title: string
  description?: string
  content: string
  mimeType: string
  isHtml: boolean
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
    taskUpdates?: TaskTimelineUpdate[]
  }
  tasks: TimelineTask[]
}

const createEntryId = () =>
  globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)

const CHAT_DRAFT_PREFIX = "chat:draft:"
const NEW_CHAT_DRAFT_KEY = "new"

const getDraftStorageKey = (ctxId: string | null) =>
  `${CHAT_DRAFT_PREFIX}${ctxId ?? NEW_CHAT_DRAFT_KEY}`

const loadDraftForContext = (ctxId: string | null): string => {
  if (typeof window === "undefined") {
    return ""
  }
  try {
    return localStorage.getItem(getDraftStorageKey(ctxId)) ?? ""
  } catch {
    return ""
  }
}

const saveDraftForContext = (ctxId: string | null, value: string) => {
  if (typeof window === "undefined") {
    return
  }
  const key = getDraftStorageKey(ctxId)
  try {
    if (value) {
      localStorage.setItem(key, value)
    } else {
      localStorage.removeItem(key)
    }
  } catch {
    // Ignore storage errors
  }
}

const clearDraftForContext = (ctxId: string | null) => {
  if (typeof window === "undefined") {
    return
  }
  try {
    localStorage.removeItem(getDraftStorageKey(ctxId))
  } catch {
    // Ignore storage errors
  }
}

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

const normalizeTimestamp = (value?: string | number | null) => {
  return toTimestampSeconds(value ?? null)
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

const extractTextFromParts = (parts: Artifact["parts"]): string => {
  if (!Array.isArray(parts)) return ""
  return parts
    .filter((part) => part.kind === "text")
    .map((part) => {
      if (part.kind === "text") {
        return part.text
      }
      return ""
    })
    .filter(Boolean)
    .join("\n\n")
    .trim()
}

const getArtifactTextContent = (artifact: Artifact): string =>
  extractTextFromParts(artifact.parts ?? [])

const getTextPartMetadata = (
  artifact: Artifact,
): Record<string, unknown> | undefined => {
  for (const part of artifact.parts ?? []) {
    if (
      part &&
      typeof part === "object" &&
      part.kind === "text" &&
      part.metadata &&
      typeof part.metadata === "object"
    ) {
      return part.metadata
    }
  }
  return undefined
}

const inferMimeTypeFromMetadata = (
  metadata: Record<string, unknown> | undefined,
): string | undefined => {
  if (!metadata) return undefined
  const candidates = [
    metadata.contentType,
    metadata.mimeType,
    metadata.type,
    metadata.format,
  ]
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate
    }
  }
  return undefined
}

const looksLikeHtml = (content: string): boolean => {
  const trimmed = content.trim().toLowerCase()
  if (!trimmed.startsWith("<") || !trimmed.includes(">")) return false
  if (
    trimmed.startsWith("<!doctype html") ||
    /^<html[\s>]/.test(trimmed) ||
    /^<head[\s>]/.test(trimmed) ||
    /^<body[\s>]/.test(trimmed)
  ) {
    return true
  }
  const blockTagPattern = /<\/(div|section|main|article|header|footer|nav)>/
  const openingBlockTagPattern =
    /<(div|section|main|article|header|footer|nav)(\s|>)/
  return (
    (trimmed.includes("<body") && trimmed.includes("</body>")) ||
    (openingBlockTagPattern.test(trimmed) && blockTagPattern.test(trimmed))
  )
}

const getArtifactContentInfo = (artifact: Artifact) => {
  const textContent = getArtifactTextContent(artifact)
  const metadata = getTextPartMetadata(artifact)
  const providedMime = inferMimeTypeFromMetadata(metadata)
  const normalizedMime = providedMime?.toLowerCase()
  const isHtml = (normalizedMime ? normalizedMime.includes("html") : false) ||
    looksLikeHtml(textContent)
  const fallbackMime = isHtml ? "text/html" : "text/plain"

  return {
    content: textContent,
    metadata,
    mimeType: normalizedMime ?? fallbackMime,
    displayMimeType: providedMime,
    isHtml,
  }
}

const ensureArtifactTimestamp = (artifact: Artifact): Artifact => {
  const artifactMetadata = artifact.metadata as
    | { timestamp?: string | number }
    | undefined
  const partMetadata = getTextPartMetadata(artifact)
  const partTimestamp = partMetadata && typeof (partMetadata as {
        timestamp?: unknown
      }).timestamp !== "undefined"
    ? (partMetadata as { timestamp?: unknown }).timestamp
    : null
  const timestampSeconds = normalizeTimestamp(
    artifactMetadata?.timestamp ??
      (typeof partTimestamp === "string" || typeof partTimestamp === "number"
        ? partTimestamp
        : null),
  ) ?? Date.now() / 1000

  const timestampIso = new Date(timestampSeconds * 1000).toISOString()
  return {
    ...artifact,
    metadata: {
      ...(artifact.metadata as Record<string, unknown> | undefined),
      timestamp: timestampIso,
    },
  }
}

const extensionFromMimeType = (mimeType: string, isHtml: boolean): string => {
  if (isHtml) return ".html"
  if (mimeType.includes("markdown")) return ".md"
  if (mimeType.includes("json")) return ".json"
  if (mimeType.includes("javascript")) return ".js"
  if (mimeType.includes("css")) return ".css"
  if (mimeType.includes("xml")) return ".xml"
  return ".txt"
}

const createArtifactFileName = (
  artifact: Artifact,
  info: ReturnType<typeof getArtifactContentInfo>,
): string => {
  const baseSource = (artifact.name && artifact.name.trim()) ||
    artifact.artifactId ||
    "artifact"
  const sanitizedBase = baseSource
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
  const base = sanitizedBase.length > 0 ? sanitizedBase : "artifact"
  const extension = extensionFromMimeType(info.mimeType, info.isHtml)
  return `${base}${extension}`
}

const buildTaskUpdates = (task: A2ATask): TaskTimelineUpdate[] => {
  const updates: TaskTimelineUpdate[] = []
  const seenIds = new Set<string>()

  if (Array.isArray(task.history)) {
    task.history.forEach((message, index) => {
      if (!message || typeof message !== "object") return
      const role = (message as { role?: string }).role
      const metadata = (message as {
        metadata?: { kind?: string; timestamp?: string | number }
      }).metadata

      const isStatusMessage = metadata?.kind === "status-message"
      if (
        !isStatusMessage && role !== "user" && role !== "assistant" &&
        role !== "agent"
      ) {
        return
      }

      const normalizedRole = isStatusMessage
        ? "status"
        : (role === "user" ? "user" : "agent")
      const parts = (message as { parts?: Part[] }).parts ?? []
      const text = extractTextFromParts(parts)
      if (!text) return

      const messageId = (message as { messageId?: string }).messageId ??
        `${task.id ?? "task"}-history-${index}`
      if (seenIds.has(messageId)) return
      seenIds.add(messageId)

      const timestamp = normalizeTimestamp(
        (metadata?.timestamp ?? null) as string | number | null,
      )
      if (timestamp == null) return

      updates.push({
        id: messageId,
        kind: "message",
        role: normalizedRole,
        text,
        timestamp,
      })
    })
  }

  if (Array.isArray(task.artifacts)) {
    task.artifacts.forEach((artifact, index) => {
      if (!artifact || typeof artifact !== "object") return
      const artifactId = artifact.artifactId ||
        `${task.id ?? "task"}-artifact-${index}`
      if (seenIds.has(artifactId)) return
      seenIds.add(artifactId)

      const artifactMetadata = artifact.metadata as
        | { timestamp?: string | number }
        | undefined
      const partMetadata = getTextPartMetadata(artifact)
      const metadataTimestamp = artifactMetadata?.timestamp ??
        (typeof partMetadata?.timestamp === "string" ||
            typeof partMetadata?.timestamp === "number"
          ? (partMetadata.timestamp as string | number)
          : undefined)

      const timestamp = normalizeTimestamp(
        (metadataTimestamp ?? null) as string | number | null,
      ) ?? Date.now() / 1000

      updates.push({
        id: artifactId,
        kind: "artifact",
        timestamp,
        artifact,
        text: getArtifactTextContent(artifact),
        lastChunk: true, // Artifacts from storage are always complete
      })
    })
  }

  return updates.sort((a, b) => {
    if (a.timestamp === b.timestamp) {
      if (a.kind === b.kind) {
        return a.id.localeCompare(b.id)
      }
      return a.kind === "message" ? -1 : 1
    }
    return a.timestamp - b.timestamp
  })
}

type ArtifactPreviewInlineProps = {
  artifact: Artifact
  info: ReturnType<typeof getArtifactContentInfo>
  onExpand: () => void
  onDownload: () => void
}

const ArtifactPreviewInline = ({
  artifact,
  info,
  onExpand,
  onDownload,
}: ArtifactPreviewInlineProps) => {
  const textRef = useRef<HTMLPreElement>(null)
  const [canExpand, setCanExpand] = useState(info.isHtml)

  useEffect(() => {
    if (info.isHtml) {
      setCanExpand(true)
      return
    }
    const el = textRef.current
    if (!el) {
      setCanExpand(false)
      return
    }
    const update = () => {
      const verticalOverflow = el.scrollHeight - el.clientHeight > 2
      const horizontalOverflow = el.scrollWidth - el.clientWidth > 2
      setCanExpand(verticalOverflow || horizontalOverflow)
    }
    update()
  }, [info.content, info.isHtml])

  return (
    <div className="relative rounded-md border border-indigo-200/70 bg-white dark:border-indigo-900/40 dark:bg-indigo-950/30">
      <div className="absolute right-3 top-3 z-10 flex gap-2">
        {canExpand && (
          <Button
            variant="secondary"
            size="sm"
            className="h-8 rounded-full px-3 text-xs font-semibold text-indigo-900 shadow-sm hover:text-indigo-950 dark:text-indigo-100"
            onClick={onExpand}
          >
            <Maximize2 className="mr-1 h-3.5 w-3.5" />
            Expand
          </Button>
        )}
        <Button
          variant="secondary"
          size="sm"
          className="h-8 rounded-full px-3 text-xs font-semibold text-indigo-900 shadow-sm hover:text-indigo-950 dark:text-indigo-100"
          onClick={onDownload}
        >
          <Download className="mr-1 h-3.5 w-3.5" />
          Download
        </Button>
      </div>
      {info.isHtml
        ? (
          <iframe
            title={`artifact-${artifact.artifactId}-preview`}
            srcDoc={info.content}
            sandbox=""
            className="h-60 w-full rounded-md bg-white dark:bg-slate-900"
          />
        )
        : (
          <pre
            ref={textRef}
            className="max-h-64 overflow-auto rounded-md bg-white/70 p-3 pt-10 pr-4 text-xs text-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-100 whitespace-pre-wrap"
          >
            {info.content}
          </pre>
        )}
    </div>
  )
}

interface ChatInterfaceProps {
  contextId?: string | null
  initialChatData?: ChatWithHistory | null
  isLoadingChat?: boolean
  onChatCreated?: (chatId: string) => void
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
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null)
  const [isBackendConnected, setIsBackendConnected] = useState(false)
  const [connectionError, setConnectionError] = useState<
    JSONRPCError | Error | string | null
  >(null)
  const [previewArtifact, setPreviewArtifact] = useState<
    ArtifactPreviewState | null
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

  useEffect(() => {
    setInput(loadDraftForContext(contextId))
  }, [contextId])

  useEffect(() => {
    saveDraftForContext(contextId, input)
  }, [contextId, input])

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

  const openArtifactPreview = useCallback(
    (artifact: Artifact) => {
      const info = getArtifactContentInfo(artifact)
      setPreviewArtifact({
        artifactId: artifact.artifactId,
        title: artifact.name ?? "Artifact",
        description: artifact.description,
        content: info.content,
        mimeType: info.mimeType,
        isHtml: info.isHtml,
      })
    },
    [setPreviewArtifact],
  )

  const closeArtifactPreview = useCallback(() => {
    setPreviewArtifact(null)
  }, [setPreviewArtifact])

  const downloadArtifact = useCallback((artifact: Artifact) => {
    const info = getArtifactContentInfo(artifact)
    if (!info.content) return
    if (typeof window === "undefined") return

    const blob = new Blob([info.content], {
      type: info.isHtml
        ? "text/html;charset=utf-8"
        : "text/plain;charset=utf-8",
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = createArtifactFileName(artifact, info)
    link.rel = "noopener"
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }, [])

  const renderTaskUpdate = useCallback((update: TaskTimelineUpdate) => {
    const renderCard = (
      label: string,
      containerClass: string,
      headerClass: string,
      body: ReactNode,
    ) => (
      <div key={update.id} className="pl-2">
        <div
          className={`rounded-lg border px-4 py-3 shadow-sm ${containerClass}`}
        >
          <div
            className={`mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide ${headerClass}`}
          >
            <span>{label}</span>
            <span className="text-[10px] uppercase text-muted-foreground">
              {formatTimestamp(update.timestamp)}
            </span>
          </div>
          {body}
        </div>
      </div>
    )

    if (update.kind === "artifact" && update.artifact) {
      const artifact = update.artifact
      const artifactInfo = getArtifactContentInfo(artifact)
      // lastChunk is stored in update metadata, not artifact metadata
      const updateMetadata = (update as { lastChunk?: boolean })
      const isComplete = updateMetadata.lastChunk ?? true

      return renderCard(
        "Artifact",
        "border-indigo-400/60 bg-indigo-50/70 dark:border-indigo-900/70 dark:bg-indigo-950/40",
        "text-indigo-800/80 dark:text-indigo-200/80",
        <div className="space-y-3 text-indigo-900 dark:text-indigo-100">
          <div className="flex items-center gap-2 text-sm font-semibold">
            {!isComplete && <Loader2 className="h-4 w-4 animate-spin" />}
            <FileText className="h-4 w-4" />
            <span>{artifact.name || "Untitled Artifact"}</span>
            {!isComplete && (
              <span className="text-xs font-normal text-indigo-700/70 dark:text-indigo-300/70">
                (Generating...)
              </span>
            )}
          </div>
          {artifact.description && (
            <div className="text-xs">
              {artifact.description}
            </div>
          )}
          {artifactInfo.displayMimeType && (
            <div className="text-[11px] uppercase tracking-wide text-indigo-700/70 dark:text-indigo-200/70">
              {artifactInfo.displayMimeType}
            </div>
          )}
          {artifactInfo.content && (
            <ArtifactPreviewInline
              artifact={artifact}
              info={artifactInfo}
              onExpand={() => openArtifactPreview(artifact)}
              onDownload={() => downloadArtifact(artifact)}
            />
          )}
        </div>,
      )
    }

    const roleLabel = update.role === "user"
      ? "You"
      : update.role === "agent"
      ? "Agent"
      : "Status"
    const headerClass = update.role === "user"
      ? "text-slate-700/80 dark:text-sky-200/80"
      : update.role === "agent"
      ? "text-slate-700/80 dark:text-slate-200/80"
      : "text-emerald-800/80 dark:text-emerald-100/80"
    const containerClass = update.role === "user"
      ? "border-sky-400/60 bg-sky-200/70 dark:border-sky-900/70 dark:bg-sky-900/40"
      : update.role === "agent"
      ? "border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-100"
      : "border-border/60 bg-card/95 dark:border-border/70 dark:bg-slate-950/50"

    return renderCard(
      roleLabel,
      containerClass,
      headerClass,
      <div className="prose prose-sm text-slate-900 dark:prose-invert max-w-none">
        <Markdown remarkPlugins={[remarkGfm]}>
          {update.text ?? ""}
        </Markdown>
      </div>,
    )
  }, [downloadArtifact, formatTimestamp, openArtifactPreview])

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
            nextTasks[existingIndex] = {
              id: taskId,
              task: nextTask,
              createdAt,
              artifacts: nextTask.artifacts,
            }
            const sortedTasks = sortTasksByTime(nextTasks)
            updatedIndex = sortedTasks.findIndex((item) => item.id === taskId)
            return { ...entry, tasks: sortedTasks }
          }

          const appendedTasks = [...entry.tasks, {
            id: taskId,
            task: nextTask,
            createdAt,
            artifacts: nextTask.artifacts,
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
        timestamp: normalizeTimestamp(msg.metadata?.timestamp) ??
          Date.now() / 1000,
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
          artifacts: task.artifacts,
        }
        nextTaskLocations[task.id] = { entryId: entry.id, index: existingIndex }
        return
      }

      entry.tasks.push({
        id: task.id,
        task,
        createdAt,
        artifacts: task.artifacts,
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

    // Check if there's an active task in working/submitted state
    const activeTask = loadedTasks.find(
      (task) =>
        task.status?.state === "working" || task.status?.state === "submitted",
    )
    if (activeTask?.id) {
      setCurrentTaskId(activeTask.id)
      setIsLoading(true)
    } else {
      setCurrentTaskId(null)
      setIsLoading(false)
    }
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
    clearDraftForContext(contextId)
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
      let _finalCapabilityCalls: CapabilityCall[] = []

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
          // Track the current task for cancellation
          setCurrentTaskId(task.id)
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
            _finalCapabilityCalls = extractCapabilityCalls(mergedTask)
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
          // Handle status updates - use single atomic state update to avoid
          // stale ref issues and ensure immediate UI updates
          const targetEntryId = resolveEntryIdForTask(event.taskId)

          setTimelineEntries((prev) => {
            return prev.map((entry) => {
              if (entry.id !== targetEntryId) return entry

              // Find and update the task
              const existingTaskIndex = entry.tasks.findIndex(
                (item) => item.id === event.taskId,
              )
              const prevTask = existingTaskIndex >= 0
                ? entry.tasks[existingTaskIndex].task
                : null

              // Build updated history
              const prevHistory = prevTask?.history || []
              const newHistory = event.status.message
                ? [...prevHistory, event.status.message]
                : prevHistory

              // Build the updated task
              const updatedTask: A2ATask = prevTask
                ? {
                  ...prevTask,
                  status: event.status,
                  artifacts: prevTask.artifacts,
                  history: newHistory,
                }
                : {
                  id: event.taskId,
                  kind: "task",
                  contextId: event.contextId,
                  status: event.status,
                  artifacts: [],
                  history: newHistory,
                }

              // Build task updates from the fresh task data
              const taskUpdates = buildTaskUpdates(updatedTask)

              // Update or append the task in the tasks array
              const createdAt = updatedTask.status?.timestamp
                ? Date.parse(updatedTask.status.timestamp) / 1000
                : Date.now() / 1000

              let updatedTasks: typeof entry.tasks
              if (existingTaskIndex >= 0) {
                updatedTasks = [...entry.tasks]
                updatedTasks[existingTaskIndex] = {
                  id: event.taskId,
                  task: updatedTask,
                  createdAt,
                  artifacts: updatedTask.artifacts,
                }
              } else {
                updatedTasks = [
                  ...entry.tasks,
                  {
                    id: event.taskId,
                    task: updatedTask,
                    createdAt,
                    artifacts: updatedTask.artifacts,
                  },
                ]
              }

              // Sort tasks by time
              updatedTasks = updatedTasks
                .slice()
                .sort((a, b) => a.createdAt - b.createdAt)

              // Handle final states
              const isFinal = event.final
              const isCompleted = event.status.state === "completed"
              const isCanceled = event.status.state === "canceled"
              const isFailed = event.status.state === "failed"

              if (isFinal && isFailed) {
                // Will throw after state update
              }

              return {
                ...entry,
                tasks: updatedTasks,
                agent: entry.agent
                  ? {
                    ...entry.agent,
                    taskUpdates,
                    isLoading: isFinal && (isCompleted || isCanceled)
                      ? false
                      : entry.agent.isLoading,
                    capabilityCalls: isFinal && isCompleted
                      ? (extractCapabilityCalls(updatedTask).length > 0
                        ? extractCapabilityCalls(updatedTask)
                        : entry.agent.capabilityCalls)
                      : entry.agent.capabilityCalls,
                  }
                  : entry.agent,
              }
            })
          })

          // Update task locations ref
          setTaskLocations((prev) => ({
            ...prev,
            [event.taskId]: {
              entryId: targetEntryId,
              index: 0, // Will be corrected by next access
            },
          }))

          if (event.final) {
            activeEntryIdRef.current = null
            if (event.status.state === "failed") {
              throw new Error(extractResponseText(event) || "Task failed")
            }
          }
        } else if (event.kind === "artifact-update") {
          // Handle artifact updates
          const artifactEvent = event as {
            kind: "artifact-update"
            taskId: string
            contextId: string
            artifact: Artifact
            lastChunk?: boolean
          }
          console.log("Received artifact-update:", artifactEvent)
          const lastChunk = Boolean(artifactEvent.lastChunk)

          // Fall back to the active entry or the most recent entry if we
          // somehow don't have a mapped entry for this task yet.
          const targetEntryId = resolveEntryIdForTask(artifactEvent.taskId) ??
            activeEntryIdRef.current ??
            timelineEntriesRef.current.at(-1)?.id

          if (!targetEntryId) {
            console.warn(
              "Received artifact-update but could not resolve target entry",
              artifactEvent,
            )
            continue
          }

          // Update the task's artifacts
          let _updatedTaskForTimeline: A2ATask | undefined
          setTimelineEntries((prev) => {
            return prev.map((entry) => {
              if (entry.id !== targetEntryId) return entry

              let updatedTaskLocal: A2ATask | undefined

              const updatedTasks = entry.tasks.map((timelineTask) => {
                if (timelineTask.id !== artifactEvent.taskId) {
                  return timelineTask
                }

                console.log(
                  "Updating artifact for task in entry",
                  targetEntryId,
                  "taskId",
                  timelineTask.id,
                  "lastChunk",
                  lastChunk,
                )

                // Add or update artifact
                const existingArtifacts = timelineTask.artifacts || []
                const artifactIndex = existingArtifacts.findIndex(
                  (a) => a.artifactId === artifactEvent.artifact.artifactId,
                )

                let updatedArtifacts: typeof existingArtifacts
                if (artifactIndex >= 0) {
                  const existing = existingArtifacts[artifactIndex]
                  let mergedArtifact: Artifact

                  // Replace artifact with latest content
                  mergedArtifact = {
                    ...existing,
                    ...artifactEvent.artifact,
                    metadata: {
                      ...(existing.metadata ?? {}),
                      ...(artifactEvent.artifact.metadata ?? {}),
                    },
                  }

                  const artifactWithTimestamp = ensureArtifactTimestamp(
                    mergedArtifact,
                  )

                  // Update existing artifact
                  updatedArtifacts = [...existingArtifacts]
                  updatedArtifacts[artifactIndex] = artifactWithTimestamp
                } else {
                  const artifactWithTimestamp = ensureArtifactTimestamp(
                    artifactEvent.artifact,
                  )
                  // Add new artifact
                  updatedArtifacts = [
                    ...existingArtifacts,
                    artifactWithTimestamp,
                  ]
                }

                // IMPORTANT: Update both the TimelineTask.artifacts AND the task.artifacts
                // so that subsequent upsertTask calls don't overwrite our changes
                const updatedTask = {
                  ...timelineTask.task,
                  artifacts: updatedArtifacts,
                }
                updatedTaskLocal = updatedTask

                return {
                  ...timelineTask,
                  task: updatedTask,
                  artifacts: updatedArtifacts,
                }
              })

              if (updatedTaskLocal) {
                const taskUpdates = buildTaskUpdates(updatedTaskLocal)

                // Update or add the artifact update with lastChunk from event
                const artifactUpdateIndex = taskUpdates.findIndex(
                  (u) => u.kind === "artifact" && u.artifact?.artifactId === artifactEvent.artifact.artifactId
                )

                if (artifactUpdateIndex >= 0) {
                  // Update existing artifact update with lastChunk from event
                  taskUpdates[artifactUpdateIndex] = {
                    ...taskUpdates[artifactUpdateIndex],
                    lastChunk,
                  }
                }

                console.log(
                  "Applying artifact updates to entry",
                  targetEntryId,
                  "taskUpdates:",
                  taskUpdates.length,
                  "lastChunk:",
                  lastChunk,
                )
                return {
                  ...entry,
                  tasks: updatedTasks,
                  agent: entry.agent
                    ? {
                      ...entry.agent,
                      taskUpdates,
                    }
                    : entry.agent,
                }
              }

              return {
                ...entry,
                tasks: updatedTasks,
              }
            })
          })
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
      setCurrentTaskId(null)
    }
  }

  const handleCancelTask = async () => {
    if (!currentTaskId) return

    try {
      await cancelTask(currentTaskId)
      console.log(`Task ${currentTaskId} cancelled`)

      // Fetch the updated task to get the cancelled status and history
      const updatedTask = await fetchTaskById(currentTaskId)

      // Find the entry containing this task
      const taskLocation = taskLocationsRef.current[currentTaskId]
      const targetEntryId = taskLocation?.entryId ??
        activeEntryIdRef.current ??
        timelineEntriesRef.current.at(-1)?.id

      if (targetEntryId) {
        // Update the task with cancelled status
        upsertTask(targetEntryId, currentTaskId, () => updatedTask)

        // Update the entry to show it's no longer loading
        updateEntry(targetEntryId, (entry) => {
          const taskUpdates = buildTaskUpdates(updatedTask)
          return {
            ...entry,
            agent: entry.agent
              ? {
                ...entry.agent,
                isLoading: false,
                taskUpdates,
              }
              : entry.agent,
          }
        })
      }

      setIsLoading(false)
      setCurrentTaskId(null)
      activeEntryIdRef.current = null
    } catch (error) {
      console.error("Failed to cancel task:", error)
      showErrorToast(error, {
        title: "Failed to cancel task",
      })
      setIsLoading(false)
      setCurrentTaskId(null)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const hasEntries = timelineEntries.length > 0

  return (
    <div ref={containerRef} className="relative h-full">
      <div className="grid h-full grid-cols-1 gap-4 lg:grid-cols-[3fr_1fr]">
        <Card className="flex min-h-0 flex-col overflow-hidden shadow-md">
          <CardHeader className="pb-4 border-b flex flex-row justify-between items-center">
            <div>
              <CardTitle className="flex items-center gap-2 text-xl">
                <MessageSquare className="h-5 w-5 text-primary" />
                Chat with agent
              </CardTitle>
              <CardDescription>
                {!isBackendConnected
                  ? "⚠️ Backend not connected. Check your API connection."
                  : isLoadingChat
                  ? "Loading agent context..."
                  : contextId
                  ? `Active context: ${contextId.slice(-8)}`
                  : "Start a new agent context"}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {onNewChat && (
                <Button
                  variant="outline"
                  size="sm"
                  title="New context"
                  onClick={startNewChat}
                >
                  New context
                </Button>
              )}
            </div>
          </CardHeader>

          <CardContent className="flex-1 min-h-0 p-0">
            <div className="flex h-full w-full flex-col">
              {/* Messages area */}
              <div className="flex-1 min-h-0 p-4 overflow-y-auto">
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
                        Loading agent context...
                      </div>
                    )
                    : !hasEntries
                    ? (
                      <div className="flex items-center justify-center h-full text-muted-foreground">
                        Send a message to start this agent context
                      </div>
                    )
                    : (
                      timelineEntries.map((entry) => {
                        const hasTasks = entry.tasks.length > 0
                        const capabilityCalls = entry.agent?.capabilityCalls ??
                          []
                        // Only show agent card if there are NO tasks
                        const showAgentCard = entry.agent && !hasTasks

                        // Check if user message exists in any task history
                        const userMessageInTaskHistory = hasTasks &&
                          entry.tasks.some((item) => {
                            const updates = buildTaskUpdates(item.task)
                            return updates.some((update) =>
                              update.kind === "message" &&
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
                                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 shadow-sm dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-100">
                                  <div className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-700/80 dark:text-slate-200/80">
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
                                          : task.status?.state === "canceled"
                                          ? "border-gray-500/40 bg-gray-200/80 text-gray-900 dark:border-gray-900/60 dark:bg-gray-950/60 dark:text-gray-100"
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
                                          : task.status?.state === "canceled"
                                          ? "text-gray-700/90 dark:text-gray-200/80"
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
                                            : task.status?.state === "canceled"
                                            ? "text-gray-700/70 dark:text-gray-300/70"
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
                                          updates.map(renderTaskUpdate)
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
            </div>
          </CardContent>

          <CardFooter className="border-t p-4">
            <div className="flex w-full items-end gap-2">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type your message here"
                className="flex-1 rounded-2xl min-h-[44px]"
                disabled={isLoading || !isBackendConnected}
                autoResize
                minRows={1}
                maxRows={8}
              />
              <Button
                onClick={currentTaskId ? handleCancelTask : handleSendMessage}
                size="icon"
                className="rounded-full h-11 w-11 shrink-0"
                disabled={currentTaskId
                  ? false
                  : (!input.trim() || isLoading || !isBackendConnected)}
              >
                {currentTaskId
                  ? <X className="h-4 w-4" />
                  : isLoading
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <ArrowRight className="h-4 w-4" />}
                <span className="sr-only">
                  {currentTaskId ? "Cancel task" : "Send message"}
                </span>
              </Button>
            </div>
          </CardFooter>
        </Card>

        <div className="min-h-0 h-[420px] lg:h-full">
          <ChatSidebar
            variant="card"
            className="h-full min-h-0 shadow-md border border-slate-200/80 bg-white/90 backdrop-blur"
            currentChatId={currentChatId}
            onChatSelect={(id) => onChatSelect && onChatSelect(id)}
            onNewChat={startNewChat}
            refreshKey={chatsRefreshKey}
          />
        </div>
      </div>

      <Dialog
        open={previewArtifact !== null}
        onOpenChange={(open) => {
          if (!open) {
            closeArtifactPreview()
          }
        }}
      >
        <DialogContent className="max-w-3xl sm:max-w-5xl">
          {previewArtifact && (
            <div className="space-y-4">
              <DialogHeader className="text-left">
                <DialogTitle>{previewArtifact.title}</DialogTitle>
                {previewArtifact.description && (
                  <DialogDescription>
                    {previewArtifact.description}
                  </DialogDescription>
                )}
              </DialogHeader>
              <div className="rounded-md border border-indigo-200/70 dark:border-indigo-800/70 bg-background/60 overflow-hidden">
                {previewArtifact.isHtml
                  ? (
                    <iframe
                      title={`${previewArtifact.title} preview`}
                      srcDoc={previewArtifact.content}
                      sandbox=""
                      className="h-[70vh] w-full bg-white dark:bg-slate-900"
                    />
                  )
                  : previewArtifact.content
                  ? (
                    <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap p-4 text-sm">
                      {previewArtifact.content}
                    </pre>
                  )
                  : (
                    <div className="p-6 text-sm text-muted-foreground">
                      No preview available.
                    </div>
                  )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
