"use client"

import { useEffect, useState } from "react"
import { Badge } from "./ui/badge.tsx"
import { Button } from "./ui/button.tsx"
import {
  AlertCircle,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Clock,
  Loader2,
  PauseCircle,
  PlayCircle,
  XCircle,
} from "lucide-react"
import { cn } from "../lib/utils.ts"
import { fetchTaskById, type A2ATask } from "../lib/api.ts"
import type * as A2A from "@a2a-js/sdk"
import Markdown from "react-markdown"

interface TaskStatusDisplayProps {
  task: A2ATask
  className?: string
}

export function TaskStatusDisplay({ task, className }: TaskStatusDisplayProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [history, setHistory] = useState<A2A.Message[]>(
    Array.isArray(task.history) ? task.history : [],
  )
  const [hasLoadedHistory, setHasLoadedHistory] = useState(
    Boolean(task.history && task.history.length > 0),
  )
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)

  // Get display info based on task state
  const getStatusInfo = () => {
    const state = task.status?.state

    switch (state) {
      case "submitted":
        return {
          icon: PlayCircle,
          color: "bg-blue-100 text-blue-800 border-blue-200",
          label: "Submitted",
        }
      case "working":
        return {
          icon: Loader2,
          color: "bg-yellow-100 text-yellow-800 border-yellow-200",
          label: "Working",
          animated: true,
        }
      case "input-required":
        return {
          icon: PauseCircle,
          color: "bg-orange-100 text-orange-800 border-orange-200",
          label: "Input Required",
        }
      case "completed":
        return {
          icon: CheckCircle,
          color: "bg-green-100 text-green-800 border-green-200",
          label: "Completed",
        }
      case "canceled":
        return {
          icon: XCircle,
          color: "bg-gray-100 text-gray-800 border-gray-200",
          label: "Canceled",
        }
      case "failed":
        return {
          icon: AlertCircle,
          color: "bg-red-100 text-red-800 border-red-200",
          label: "Failed",
        }
      default:
        return {
          icon: AlertCircle,
          color: "bg-gray-100 text-gray-800 border-gray-200",
          label: "Unknown",
        }
    }
  }

  const statusInfo = getStatusInfo()
  const StatusIcon = statusInfo.icon
  const taskId = task.id?.slice(-8) || "unknown"

  // Reset local state when a new task is provided
  useEffect(() => {
    const incomingHistory = Array.isArray(task.history) ? task.history : []
    setHistory(incomingHistory)
    setHasLoadedHistory(incomingHistory.length > 0)
    setHistoryError(null)
  }, [task.id])

  // Sync history if parent provides updates after mount
  useEffect(() => {
    if (Array.isArray(task.history) && task.history.length > 0) {
      setHistory(task.history)
      setHasLoadedHistory(true)
      setHistoryError(null)
    }
  }, [task.history])

  // Lazy-load task history via API once expanded
  useEffect(() => {
    if (!isExpanded || hasLoadedHistory || isLoadingHistory || !task.id) {
      return
    }

    let cancelled = false
    setIsLoadingHistory(true)
    setHistoryError(null)

    fetchTaskById(task.id, { historyLength: 100 })
      .then((fullTask) => {
        if (cancelled) return
        const fetchedHistory = Array.isArray(fullTask.history)
          ? fullTask.history
          : []
        setHistory(fetchedHistory)
        setHasLoadedHistory(true)
      })
      .catch((error) => {
        if (cancelled) return
        const message = error instanceof Error
          ? error.message
          : "Failed to load task history"
        setHistoryError(message)
        setHasLoadedHistory(true)
      })
      .finally(() => {
        if (cancelled) return
        setIsLoadingHistory(false)
      })

    return () => {
      cancelled = true
    }
  }, [isExpanded, hasLoadedHistory, isLoadingHistory, task.id])

  // Extract text from status message to use as description
  const getStatusMessageText = () => {
    if (task.status?.message?.parts) {
      const textParts = task.status.message.parts
        .filter((part: unknown) => {
          if (!part || typeof part !== "object") return false
          const p = part as { kind?: string; type?: string }
          return p.kind === "text" || p.type === "text"
        })
        .map((part: unknown) =>
          part && typeof part === "object" && "text" in part ? (part as { text?: string }).text || "" : ""
        )
        .filter(Boolean)
      return textParts.join(" ").trim() || null
    }
    return null
  }

  const statusMessageText = getStatusMessageText()
  const description = statusMessageText

  const historyMessages = history

  const extractTextFromParts = (parts: A2A.Part[]): string => {
    try {
      const texts = parts
        .filter((part): part is A2A.TextPart =>
          (part as { kind?: string; type?: string }).kind === "text" ||
          (part as { kind?: string; type?: string }).type === "text"
        )
        .map((part) => (part as { text?: string }).text?.trim?.() || "")
        .filter(Boolean)
      return texts.join("\n\n").trim()
    } catch {
      return ""
    }
  }

  const summarizeFunctionsFromParts = (parts: A2A.Part[]) => {
    const items: {
      type: "call" | "response"
      name?: string
      data?: unknown
    }[] = []
    for (const part of parts) {
      const kind = (part as { kind?: string; type?: string }).kind ||
        (part as { kind?: string; type?: string }).type
      const dataField = (part as unknown as { data?: unknown }).data
      if (kind === "data" && dataField) {
        const data = dataField as {
          type?: string
          name?: string
          args?: unknown
          result?: unknown
        }
        if (data.type === "tool_call") {
          items.push({
            type: "call",
            name: String(data.name || "function"),
            data: data.args ?? {},
          })
        }
        if (data.type === "tool_result") {
          items.push({
            type: "response",
            name: undefined,
            data: data.result,
          })
        }
      }
    }
    return items
  }

  // Extract DataParts from parts array
  const extractDataParts = (parts: A2A.Part[]) => {
    type DataItem = { data: unknown }
    const items: DataItem[] = []
    for (const part of parts) {
      const kind = (part as { kind?: string; type?: string }).kind ||
        (part as { kind?: string; type?: string }).type
      if (kind === "data") {
        const dataPart = part as A2A.DataPart & { type?: string }
        items.push({
          data: (dataPart as unknown as { data?: unknown }).data,
        })
      }
    }
    return items
  }

  // DataPart preview renderer with show more/less toggle
  function DataPartPreview({ data }: { data: unknown }) {
    const [expanded, setExpanded] = useState(false)

    // Try to detect images from base64 data URIs
    if (typeof data === "string" && data.startsWith("data:image/")) {
      return (
        <div className="space-y-1">
          <div className="text-muted-foreground text-[11px]">
            Data part (image)
          </div>
          <img
            src={data}
            alt="Data part image"
            className="max-h-40 max-w-full rounded border"
          />
        </div>
      )
    }

    // Prepare textual/JSON preview
    let text: string
    if (typeof data === "string") {
      text = data
      // Treat as JSON if it looks like it
      if (text.trim().startsWith("{") || text.trim().startsWith("[")) {
        try {
          const obj = JSON.parse(text)
          text = JSON.stringify(obj, null, 2)
        } catch {
          // keep as plain text
        }
      }
    } else {
      text = (() => {
        try {
          return JSON.stringify(data, null, 2)
        } catch {
          return String(data)
        }
      })()
    }

    const LIMIT = 800
    const isLong = text.length > LIMIT
    const shown = expanded || !isLong ? text : `${text.slice(0, LIMIT)}…`

    return (
      <div className="space-y-1">
        <div className="text-muted-foreground text-[11px]">Data part</div>
        <pre className="bg-background/60 p-2 rounded border text-[11px] max-w-full overflow-x-auto whitespace-pre-wrap break-words">
          {shown}
        </pre>
        {isLong && (
          <div className="flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? "Show less" : "Show more"}
            </Button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className={cn("w-full mb-2", className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge className={cn("gap-1.5", statusInfo.color)} variant="outline">
            <StatusIcon
              className={cn("h-3 w-3", statusInfo.animated && "animate-spin")}
            />
            {statusInfo.label}
          </Badge>
          <span className="text-sm text-muted-foreground">Task: {taskId}</span>
          {task.status?.timestamp && (
            <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {new Date(task.status.timestamp).toLocaleTimeString()}
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsExpanded(!isExpanded)}
          className="h-6 w-6 p-0"
          title={isExpanded ? "Collapse" : "Expand"}
        >
          {isExpanded
            ? <ChevronUp className="h-3 w-3" />
            : <ChevronDown className="h-3 w-3" />}
        </Button>
      </div>

      {!isExpanded && description && (
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
      )}

      {isExpanded && (
        <div className="mt-2 pr-1 min-w-0 relative">
          {/* Vertical timeline line with corner caps; line inset so corners are clean */}
          <div className="pointer-events-none absolute left-2 top-3 bottom-3 w-px bg-border" />
          <div className="pointer-events-none absolute left-2 top-0 w-3 h-3 border-l border-t border-border rounded-tl-md bg-transparent" />
          <div className="pointer-events-none absolute left-2 bottom-0 w-3 h-3 border-l border-b border-border rounded-bl-md bg-transparent" />
          <div className="space-y-3 pl-5">
            {isLoadingHistory && historyMessages.length === 0 ? (
              <div className="text-xs text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-3 w-3 animate-spin" />
                Loading task history...
              </div>
            ) : historyError ? (
              <div className="text-xs text-destructive flex flex-col gap-2">
                <span>{historyError}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="self-start h-6 px-2"
                  onClick={() => {
                    setHasLoadedHistory(false)
                    setHistoryError(null)
                  }}
                >
                  Retry
                </Button>
              </div>
            ) : historyMessages.length === 0 ? (
              <div className="text-xs text-muted-foreground">
                No history available for this task yet.
              </div>
            ) : (
              historyMessages.map((msg, idx) => {
                const message = msg as A2A.Message
                const role = message.role
                const isUser = role === "user"
                const parts = message.parts || []
                const text = parts.length > 0 ? extractTextFromParts(parts) : ""
                const funcs = parts.length > 0
                  ? summarizeFunctionsFromParts(parts)
                  : []
                const dataParts = parts.length > 0
                  ? extractDataParts(parts)
                  : []

                return (
                  <div
                    key={message.messageId ?? idx}
                    className={`relative flex ${
                      isUser ? "justify-end" : "justify-start"
                    }`}
                  >
                    <div className="max-w-[80%]">
                      <div
                        className={`inline-block w-fit align-top rounded-2xl px-4 py-2 break-words max-w-full ${
                          isUser
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-left"
                        }`}
                      >
                        <div className="space-y-2">
                          {text && (
                            <div className="markdown text-sm">
                              <Markdown>{text}</Markdown>
                            </div>
                          )}
                          {!isUser && funcs.length > 0 && (
                            <div className="space-y-1">
                              {funcs.map((f, i) => (
                                <div
                                  key={i}
                                  className="text-[11px] text-muted-foreground"
                                >
                                  {f.type === "call"
                                    ? (
                                      <>
                                        <span className="font-medium">
                                          Function call
                                        </span>
                                        {f.name ? `: ${f.name}` : ":"}
                                        {f.data !== undefined && (
                                          <pre className="mt-1 bg-background/60 p-2 rounded border text-[11px] max-w-full overflow-x-auto whitespace-pre-wrap break-words">
                                        {(() => {
                                          try {
                                            return JSON.stringify(f.data, null, 2)
                                          } catch {
                                            return String(f.data)
                                          }
                                        })()}
                                          </pre>
                                        )}
                                      </>
                                    )
                                    : (
                                      <>
                                        <span className="font-medium">
                                          Function response:
                                        </span>
                                        {f.data !== undefined && (
                                          <pre className="mt-1 bg-background/60 p-2 rounded border text-[11px] max-w-full overflow-x-auto whitespace-pre-wrap break-words">
                                        {(() => {
                                          try {
                                            return JSON.stringify(f.data, null, 2)
                                          } catch {
                                            return String(f.data)
                                          }
                                        })()}
                                          </pre>
                                        )}
                                      </>
                                    )}
                                </div>
                              ))}
                            </div>
                          )}
                          {!isUser && dataParts.length > 0 && (
                            <div className="space-y-2">
                              {dataParts.map((d, i) => (
                                <div key={i} className="text-[11px]">
                                  <DataPartPreview data={d.data} />
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
