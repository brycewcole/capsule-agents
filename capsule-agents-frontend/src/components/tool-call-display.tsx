import { useState } from "react"
import { Card, CardContent, CardHeader } from "./ui/card.tsx"
import { Badge } from "./ui/badge.tsx"
import { Button } from "./ui/button.tsx"
import { Separator } from "./ui/separator.tsx"
import { ArrowRight, ChevronDown, ChevronRight, Settings } from "lucide-react"

type ToolCall = {
  name: string
  args: Record<string, unknown>
  result?: unknown
}

interface ToolCallDisplayProps {
  toolCalls: ToolCall[]
}

function formatJson(obj: unknown): string {
  try {
    return JSON.stringify(obj, null, 2)
  } catch {
    return String(obj)
  }
}

function ToolCallItem({ toolCall }: { toolCall: ToolCall }) {
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <Card className="border">
      <CardHeader className="pb-2 pt-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div className="flex items-center gap-2 bg-muted/50 px-2 py-1 rounded-md">
              <Settings className="h-3 w-3 text-muted-foreground flex-shrink-0" />
              <span className="text-xs font-mono font-medium truncate">
                {toolCall.name}
              </span>
            </div>
            <Badge variant="secondary" className="text-xs">
              Tool
            </Badge>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className="h-6 w-6 p-0"
          >
            {isExpanded
              ? <ChevronDown className="h-3 w-3" />
              : <ChevronRight className="h-3 w-3" />}
          </Button>
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="pt-0 pb-3 space-y-3">
          {/* Arguments Section */}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <ArrowRight className="h-3 w-3 text-muted-foreground" />
              <span className="text-xs font-medium text-foreground">
                Arguments
              </span>
            </div>
            <div className="bg-muted/50 rounded-md p-2 border">
              <pre className="text-xs font-mono text-foreground whitespace-pre-wrap break-all overflow-hidden">
                {formatJson(toolCall.args)}
              </pre>
            </div>
          </div>

          {toolCall.result !== undefined && (
            <>
              <Separator />
              {/* Result Section */}
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <ArrowRight className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs font-medium text-foreground">
                    Result
                  </span>
                </div>
                <div className="bg-muted/30 rounded-md p-2 border">
                  <pre className="text-xs font-mono text-foreground whitespace-pre-wrap break-all overflow-hidden">
                    {formatJson(toolCall.result)}
                  </pre>
                </div>
              </div>
            </>
          )}
        </CardContent>
      )}
    </Card>
  )
}

export function ToolCallDisplay({ toolCalls }: ToolCallDisplayProps) {
  if (!toolCalls || toolCalls.length === 0) {
    return null
  }

  return (
    <div className="my-2 space-y-1">
      <div className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
        <Settings className="h-3 w-3" />
        Tool {toolCalls.length === 1 ? "Call" : "Calls"} ({toolCalls.length})
      </div>
      {toolCalls.map((toolCall, index) => (
        <ToolCallItem key={index} toolCall={toolCall} />
      ))}
    </div>
  )
}
