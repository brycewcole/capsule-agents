import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button" 
import { ChevronDown, ChevronRight, Wrench } from "lucide-react"

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
    <Card className="mb-2 border-l-4 border-l-blue-500">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wrench className="h-4 w-4 text-blue-500" />
            <CardTitle className="text-sm font-medium">{toolCall.name}</CardTitle>
            <Badge variant="secondary" className="text-xs">Tool Call</Badge>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className="h-6 w-6 p-0"
          >
            {isExpanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
          </Button>
        </div>
      </CardHeader>
      
      {isExpanded && (
        <CardContent className="pt-0 space-y-3">
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-1">Arguments:</div>
            <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">
              {formatJson(toolCall.args)}
            </pre>
          </div>
          
          {toolCall.result !== undefined && (
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-1">Result:</div>
              <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">
                {formatJson(toolCall.result)}
              </pre>
            </div>
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
      {toolCalls.map((toolCall, index) => (
        <ToolCallItem key={index} toolCall={toolCall} />
      ))}
    </div>
  )
}