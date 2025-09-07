"use client"

import { useState } from "react"
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
import { type A2ATask } from "../lib/api.ts"
import Markdown from "react-markdown"

interface TaskStatusDisplayProps {
  task: A2ATask
  className?: string
}

export function TaskStatusDisplay({ task, className }: TaskStatusDisplayProps) {
  const [isExpanded, setIsExpanded] = useState(false)

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

  // Extract text from status message to use as description
  const getStatusMessageText = () => {
    if (task.status?.message?.parts) {
      const textParts = task.status.message.parts
        .filter((part: unknown) =>
          part && typeof part === "object" && "kind" in part &&
          part.kind === "text"
        )
        .map((part: unknown) =>
          part && typeof part === "object" && "text" in part ? part.text : ""
        )
        .filter(Boolean)
      return textParts.join(" ").trim() || null
    }
    return null
  }

  const statusMessageText = getStatusMessageText()
  const description = statusMessageText

  // Helpers to render history entries
  const getHistoryMessages = () => {
    const history = (task as unknown as { history?: unknown[] }).history
    if (!Array.isArray(history) || history.length === 0) return [] as unknown[]
    return history
  }

  const extractTextFromParts = (parts: unknown[]): string => {
    try {
      const texts = parts
        .filter((p) => p && typeof p === "object" && "kind" in (p as any))
        .map((p) => (p as { kind?: string; text?: string }))
        .filter((p) => p.kind === "text" && typeof p.text === "string")
        .map((p) => p.text!.trim())
        .filter(Boolean)
      return texts.join("\n\n").trim()
    } catch {
      return ""
    }
  }

  const summarizeFunctionsFromParts = (parts: unknown[]) => {
    const items: { type: "call" | "response"; name?: string; data?: unknown }[] = []
    for (const part of parts) {
      if (part && typeof part === "object") {
        const anyPart = part as any
        if (anyPart.function_call) {
          items.push({
            type: "call",
            name: String(anyPart.function_call.name || "function"),
            data: anyPart.function_call.args ?? {},
          })
        }
        if (anyPart.function_response) {
          items.push({
            type: "response",
            name: undefined,
            data: anyPart.function_response.response,
          })
        }
      }
    }
    return items
  }

  // Extract DataParts from parts array (supports A2A style and legacy variants)
  const extractDataParts = (parts: unknown[]) => {
    type DataItem = { mediaType?: string; data: unknown }
    const items: DataItem[] = []
    for (const part of parts) {
      if (!part || typeof part !== "object") continue
      const p = part as any
      // A2A-conventional: { kind: 'data', mediaType | mimeType, data }
      if (p.kind === "data" && ("data" in p)) {
        items.push({ mediaType: p.mediaType || p.mimeType, data: p.data })
        continue
      }
      // Fallback: part that has data + media/mimeType, without kind marker
      if ("data" in p && ("mediaType" in p || "mimeType" in p)) {
        items.push({ mediaType: p.mediaType || p.mimeType, data: p.data })
        continue
      }
    }
    return items
  }

  // DataPart preview renderer with show more/less toggle
  function DataPartPreview(
    { mediaType, data }: { mediaType?: string; data: unknown },
  ) {
    const [expanded, setExpanded] = useState(false)
    const media = mediaType || "unknown"

    // Image handling
    if (typeof data === "string" && media.startsWith("image/")) {
      const src = data.startsWith("data:") ? data : `data:${media};base64,${data}`
      return (
        <div className="space-y-1">
          <div className="text-muted-foreground text-[11px]">Data part{media ? ` (${media})` : ""}</div>
          <img src={src} alt={media} className="max-h-40 max-w-full rounded border" />
        </div>
      )
    }

    // Prepare textual/JSON preview
    let text: string
    let isJson = false
    if (media.includes("json")) {
      try {
        const obj = typeof data === "string" ? JSON.parse(data) : data
        text = JSON.stringify(obj, null, 2)
        isJson = true
      } catch {
        text = typeof data === "string" ? data : (() => {
          try { return JSON.stringify(data, null, 2) } catch { return String(data) }
        })()
      }
    } else if (typeof data === "string") {
      text = data
      // Also treat as JSON if it looks like it
      if (text.trim().startsWith("{") || text.trim().startsWith("[")) {
        try {
          const obj = JSON.parse(text)
          text = JSON.stringify(obj, null, 2)
          isJson = true
        } catch {
          // keep as plain text
        }
      }
    } else {
      text = (() => { try { return JSON.stringify(data, null, 2) } catch { return String(data) } })()
    }

    const LIMIT = 800
    const isLong = text.length > LIMIT
    const shown = expanded || !isLong ? text : `${text.slice(0, LIMIT)}…`

    return (
      <div className="space-y-1">
        <div className="text-muted-foreground text-[11px]">Data part{media ? ` (${media})` : ""}</div>
        <pre className="bg-background/60 p-2 rounded border text-[11px] max-w-full overflow-x-auto whitespace-pre-wrap break-words">
          {shown}
        </pre>
        {isLong && (
          <div className="flex justify-end">
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs"
              onClick={() => setExpanded((v) => !v)}>
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
            <StatusIcon className={cn("h-3 w-3", statusInfo.animated && "animate-spin")} />
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
          {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
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
          {getHistoryMessages().map((msg, idx) => {
            const m = msg as {
              role?: string
              parts?: unknown[]
              content?: { parts?: unknown[] }
              timestamp?: string | number
            }
            const role = m.role === "assistant" ? "agent" : m.role || "agent"
            const isUser = role === "user"
            const parts = Array.isArray(m.parts)
              ? m.parts
              : (m.content && Array.isArray(m.content.parts))
              ? m.content.parts
              : []
            const text = parts && parts.length > 0 ? extractTextFromParts(parts) : ""
            const funcs = parts && parts.length > 0 ? summarizeFunctionsFromParts(parts) : []
            const dataParts = parts && parts.length > 0 ? extractDataParts(parts) : []

            return (
              <div key={idx} className={`relative flex ${isUser ? "justify-end" : "justify-start"}`}>
                <div className="max-w-[80%]">
                  <div
                    className={`inline-block w-fit align-top rounded-2xl px-4 py-2 break-words max-w-full ${
                      isUser ? "bg-primary text-primary-foreground" : "bg-muted text-left"
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
                            <div key={i} className="text-[11px] text-muted-foreground">
                              {f.type === "call" ? (
                                <>
                                  <span className="font-medium">Function call</span>
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
                              ) : (
                                <>
                                  <span className="font-medium">Function response:</span>
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
                              <DataPartPreview mediaType={d.mediaType} data={d.data} />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
          </div>
        </div>
      )}
    </div>
  )
}
