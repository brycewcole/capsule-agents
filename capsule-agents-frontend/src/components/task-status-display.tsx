"use client"

import { useState } from "react"
import { Badge } from "./ui/badge.tsx"
import { Card, CardContent, CardHeader } from "./ui/card.tsx"
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

  return (
    <Card className={cn("w-full mb-2", className)}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge
              className={cn("gap-1.5", statusInfo.color)}
              variant="outline"
            >
              <StatusIcon
                className={cn(
                  "h-3 w-3",
                  statusInfo.animated && "animate-spin",
                )}
              />
              {statusInfo.label}
            </Badge>
            <span className="text-sm text-muted-foreground">
              Task: {taskId}
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className="h-6 w-6 p-0"
          >
            {isExpanded
              ? <ChevronUp className="h-3 w-3" />
              : <ChevronDown className="h-3 w-3" />}
          </Button>
        </div>
        {!isExpanded && (
          <p className="text-xs text-muted-foreground">
            {description}
          </p>
        )}
      </CardHeader>

      {isExpanded && (
        <CardContent className="pt-0">
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {description}
            </p>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="font-medium text-muted-foreground">
                  Task ID:
                </span>
                <p className="font-mono text-xs mt-1">{task.id}</p>
              </div>
              <div>
                <span className="font-medium text-muted-foreground">
                  Context ID:
                </span>
                <p className="font-mono text-xs mt-1">{task.contextId}</p>
              </div>
            </div>

            {task.status?.timestamp && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span>
                  Updated:{" "}
                  {new Date(task.status.timestamp).toLocaleTimeString()}
                </span>
              </div>
            )}

            {"sessionId" in task &&
              (task as { sessionId?: string }).sessionId && (
              <div>
                <span className="font-medium text-muted-foreground text-sm">
                  Session ID:
                </span>
                <p className="font-mono text-xs mt-1">
                  {String((task as { sessionId?: string }).sessionId)}
                </p>
              </div>
            )}

            {task.metadata && Object.keys(task.metadata).length > 0 && (
              <div>
                <span className="font-medium text-muted-foreground text-sm">
                  Metadata:
                </span>
                <pre className="bg-muted p-2 rounded text-xs mt-1 overflow-auto">
                  {JSON.stringify(task.metadata, null, 2)}
                </pre>
              </div>
            )}

            {task.artifacts && task.artifacts.length > 0 && (
              <div>
                <span className="font-medium text-muted-foreground text-sm">
                  Artifacts: {task.artifacts.length}
                </span>
                <div className="mt-1 space-y-1">
                  {task.artifacts.map((artifact, index) => (
                    <div key={index} className="text-xs bg-muted p-2 rounded">
                      {artifact.name && (
                        <div className="font-medium">{artifact.name}</div>
                      )}
                      {artifact.description && (
                        <div className="text-muted-foreground mt-1">
                          {artifact.description}
                        </div>
                      )}
                      <div className="text-muted-foreground">
                        Parts: {artifact.parts?.length || 0}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {getHistoryMessages().length > 0 && (
              <div>
                <span className="font-medium text-muted-foreground text-sm">
                  History: {getHistoryMessages().length}
                </span>
                <div className="mt-1 space-y-2 max-h-64 overflow-y-auto overflow-x-hidden pr-1 min-w-0">
                  {getHistoryMessages().map((msg, idx) => {
                    const m = msg as {
                      role?: string
                      parts?: unknown[]
                      content?: { parts?: unknown[] }
                      timestamp?: string | number
                    }
                    const parts = Array.isArray(m.parts)
                      ? m.parts
                      : (m.content && Array.isArray(m.content.parts))
                      ? m.content.parts
                      : []
                    const text = parts && parts.length > 0
                      ? extractTextFromParts(parts)
                      : ""
                    const funcs = parts && parts.length > 0
                      ? summarizeFunctionsFromParts(parts)
                      : []
                    const dataParts = parts && parts.length > 0
                      ? extractDataParts(parts)
                      : []
                    const roleLabel = m.role ? m.role : "event"
                    const timeLabel = m.timestamp
                      ? (() => {
                        try {
                          const t = typeof m.timestamp === "number"
                            ? new Date(m.timestamp * 1000)
                            : new Date(m.timestamp)
                          return t.toLocaleTimeString()
                        } catch {
                          return undefined
                        }
                      })()
                      : undefined

                    return (
                      <div key={idx} className="bg-muted/40 p-2 rounded border">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                            {roleLabel}
                          </span>
                          {timeLabel && (
                            <span className="text-[10px] text-muted-foreground">
                              {timeLabel}
                            </span>
                          )}
                        </div>
                        {text && (
                          <div className="text-xs text-foreground whitespace-pre-wrap break-words">
                             {text}
                          </div>
                        )}
                        {funcs.length > 0 && (
                          <div className="mt-2 space-y-1">
                            {funcs.map((f, i) => (
                              <div key={i} className="text-[11px] text-muted-foreground">
                                {f.type === "call"
                                  ? (
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
                                  )
                                  : (
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
                        {dataParts.length > 0 && (
                          <div className="mt-2 space-y-2">
                            {dataParts.map((d, i) => {
                              const media = d.mediaType || "unknown"
                              const isImage = typeof d.data === "string" && media.startsWith("image/")
                              const renderData = () => {
                                if (isImage) {
                                  const src = (d.data as string).startsWith("data:")
                                    ? (d.data as string)
                                    : `data:${media};base64,${String(d.data)}`
                                  return (
                                    <img
                                      src={src}
                                      alt={media}
                                      className="max-h-40 max-w-full rounded border"
                                    />
                                  )
                                }
                                // JSON-like
                                const asString = typeof d.data === "string" ? d.data : undefined
                                const looksJson = (media.includes("json") || (asString && asString.trim().startsWith("{") || asString?.trim().startsWith("[")))
                                if (looksJson) {
                                  try {
                                    const obj = typeof d.data === "string" ? JSON.parse(d.data) : d.data
                                    return (
                                      <pre className="bg-background/60 p-2 rounded border text-[11px] max-w-full overflow-x-auto whitespace-pre-wrap break-words">
                                        {JSON.stringify(obj, null, 2)}
                                      </pre>
                                    )
                                  } catch {
                                    // fall-through to raw text
                                  }
                                }
                                // Plain text or fallback
                                if (typeof d.data === "string") {
                                  return (
                                    <pre className="bg-background/60 p-2 rounded border text-[11px] max-w-full overflow-x-auto whitespace-pre-wrap break-words">
                                      {d.data.length > 200 ? `${d.data.slice(0, 200)}…` : d.data}
                                    </pre>
                                  )
                                }
                                return (
                                  <pre className="bg-background/60 p-2 rounded border text-[11px] max-w-full overflow-x-auto whitespace-pre-wrap break-words">
                                    {(() => { try { return JSON.stringify(d.data, null, 2) } catch { return String(d.data) } })()}
                                  </pre>
                                )
                              }
                              return (
                                <div key={i} className="text-[11px]">
                                  <div className="text-muted-foreground mb-1">
                                    Data part{media ? ` (${media})` : ""}
                                  </div>
                                  {renderData()}
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  )
}
