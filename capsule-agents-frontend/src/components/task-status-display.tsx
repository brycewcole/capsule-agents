"use client"

import { useEffect, useState } from "react"
import { Badge } from "./ui/badge.tsx"
import { Button } from "./ui/button.tsx"
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "./ui/card.tsx"
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

  const statusTimestamp = task.status?.timestamp
    ? new Date(task.status.timestamp)
    : null

  const displayableHistory = historyMessages
    .map((message, idx) => {
      const role = message.role === "assistant"
        ? "agent"
        : message.role === "user"
        ? "user"
        : null

      if (!role) return null

      const parts = message.parts || []
      const text = parts.length > 0 ? extractTextFromParts(parts).trim() : ""
      const funcs = parts.length > 0
        ? summarizeFunctionsFromParts(parts)
        : []
      const dataParts = parts.length > 0
        ? extractDataParts(parts)
        : []

      if (!text && funcs.length === 0 && dataParts.length === 0) {
        return null
      }

      return {
        id: message.messageId ?? `${task.id ?? "task"}-${idx}`,
        role,
        text,
        funcs,
        dataParts,
      }
    })
    .filter((value): value is {
      id: string
      role: "user" | "agent"
      text: string
      funcs: ReturnType<typeof summarizeFunctionsFromParts>
      dataParts: ReturnType<typeof extractDataParts>
    } => Boolean(value))

  const hasExpandableContent =
    !hasLoadedHistory ||
    historyError ||
    isLoadingHistory ||
    displayableHistory.length > 0

  return (
    <Card className={cn("border-primary/30 bg-primary/5", className)}>
      <CardHeader className="space-y-3 pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={cn("gap-1.5", statusInfo.color)} variant="outline">
              <StatusIcon
                className={cn("h-3 w-3", statusInfo.animated && "animate-spin")}
              />
              {statusInfo.label}
            </Badge>
            <span className="text-xs text-muted-foreground">
              Task {taskId}
            </span>
          </div>
          {statusTimestamp && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              {statusTimestamp.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          )}
        </div>

        {description && (
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <Markdown>{description}</Markdown>
          </div>
        )}

        {!description && (
          <p className="text-sm text-muted-foreground">
            {statusInfo.label === "Completed"
              ? "Task completed."
              : "Task updates will appear here."}
          </p>
        )}
      </CardHeader>

      {isExpanded && (
        <CardContent className="pt-0">
          {isLoadingHistory && displayableHistory.length === 0 ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading task activity...
            </div>
          ) : historyError ? (
            <div className="space-y-2 text-xs text-destructive">
              <span>{historyError}</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2"
                onClick={() => {
                  setHasLoadedHistory(false)
                  setHistoryError(null)
                }}
              >
                Retry
              </Button>
            </div>
          ) : displayableHistory.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No additional task activity yet.
            </p>
          ) : (
            <div className="space-y-3">
              {displayableHistory.map((event) => (
                <div
                  key={event.id}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-sm",
                    event.role === "user"
                      ? "bg-muted/60"
                      : "bg-background/80",
                  )}
                >
                  <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    <span>{event.role === "user" ? "User input" : "Agent update"}</span>
                  </div>
                  {event.text && (
                    <div className="prose prose-sm dark:prose-invert mt-2 max-w-none">
                      <Markdown>{event.text}</Markdown>
                    </div>
                  )}
                  {event.funcs.length > 0 && (
                    <div className="mt-3 space-y-2 text-[11px] text-muted-foreground">
                      {event.funcs.map((f, idx) => (
                        <div key={idx} className="space-y-1">
                          <span className="font-semibold text-foreground/80">
                            {f.type === "call" ? "Function call" : "Function response"}
                            {f.name ? `: ${f.name}` : ""}
                          </span>
                          {f.data !== undefined && (
                            <pre className="max-h-48 overflow-auto rounded border bg-background/80 p-2 text-[11px]">
                              {(() => {
                                try {
                                  return JSON.stringify(f.data, null, 2)
                                } catch {
                                  return String(f.data)
                                }
                              })()}
                            </pre>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {event.dataParts.length > 0 && (
                    <div className="mt-3 space-y-2 text-[11px] text-muted-foreground">
                      {event.dataParts.map((item, idx) => (
                        <DataPartPreview key={idx} data={item.data} />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      )}

      {hasExpandableContent && (
        <CardFooter className="pt-0">
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-7 px-2 text-xs"
            onClick={() => setIsExpanded((value) => !value)}
          >
            {isExpanded ? (
              <>
                <ChevronUp className="mr-1 h-3 w-3" /> Hide task activity
              </>
            ) : (
              <>
                <ChevronDown className="mr-1 h-3 w-3" /> View task activity
              </>
            )}
          </Button>
        </CardFooter>
      )}
    </Card>
  )
}
