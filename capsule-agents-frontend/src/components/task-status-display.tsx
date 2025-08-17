"use client"

import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { 
  ChevronDown, 
  ChevronUp, 
  Clock, 
  CheckCircle, 
  XCircle, 
  AlertCircle, 
  Loader2, 
  PlayCircle,
  PauseCircle
} from "lucide-react"
import { cn } from "@/lib/utils"
import { type A2ATask } from "@/lib/api"

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
          description: "Task has been submitted and is queued for processing"
        }
      case "working":
        return {
          icon: Loader2,
          color: "bg-yellow-100 text-yellow-800 border-yellow-200",
          label: "Working",
          description: "Agent is actively processing the task",
          animated: true
        }
      case "input-required":
        return {
          icon: PauseCircle,
          color: "bg-orange-100 text-orange-800 border-orange-200",
          label: "Input Required",
          description: "Task is waiting for additional input"
        }
      case "completed":
        return {
          icon: CheckCircle,
          color: "bg-green-100 text-green-800 border-green-200",
          label: "Completed",
          description: "Task has been completed successfully"
        }
      case "canceled":
        return {
          icon: XCircle,
          color: "bg-gray-100 text-gray-800 border-gray-200",
          label: "Canceled",
          description: "Task was canceled before completion"
        }
      case "failed":
        return {
          icon: AlertCircle,
          color: "bg-red-100 text-red-800 border-red-200",
          label: "Failed",
          description: "Task encountered an error and could not complete"
        }
      default:
        return {
          icon: AlertCircle,
          color: "bg-gray-100 text-gray-800 border-gray-200",
          label: "Unknown",
          description: "Task is in an unknown state"
        }
    }
  }

  const statusInfo = getStatusInfo()
  const StatusIcon = statusInfo.icon
  const taskId = task.id?.slice(-8) || "unknown"

  return (
    <Card className={cn("w-full mb-2", className)}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge className={cn("gap-1.5", statusInfo.color)} variant="outline">
              <StatusIcon 
                className={cn(
                  "h-3 w-3", 
                  statusInfo.animated && "animate-spin"
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
            {isExpanded ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
          </Button>
        </div>
        {!isExpanded && (
          <p className="text-xs text-muted-foreground">
            {statusInfo.description}
          </p>
        )}
      </CardHeader>

      {isExpanded && (
        <CardContent className="pt-0">
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {statusInfo.description}
            </p>
            
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="font-medium text-muted-foreground">Task ID:</span>
                <p className="font-mono text-xs mt-1">{task.id}</p>
              </div>
              <div>
                <span className="font-medium text-muted-foreground">Context ID:</span>
                <p className="font-mono text-xs mt-1">{task.contextId}</p>
              </div>
            </div>

            {task.status?.timestamp && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span>
                  Updated: {new Date(task.status.timestamp).toLocaleTimeString()}
                </span>
              </div>
            )}

            {'sessionId' in task && (task as any).sessionId && (
              <div>
                <span className="font-medium text-muted-foreground text-sm">Session ID:</span>
                <p className="font-mono text-xs mt-1">{String((task as any).sessionId)}</p>
              </div>
            )}

            {task.metadata && Object.keys(task.metadata).length > 0 && (
              <div>
                <span className="font-medium text-muted-foreground text-sm">Metadata:</span>
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
          </div>
        </CardContent>
      )}
    </Card>
  )
}