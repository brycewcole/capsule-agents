import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

// Prebuilt tools configuration
export const PREBUILT_TOOLS = {
  file_access: {
    name: "file_access",
    displayName: "File Access",
    description: "Allows the agent to read and write files",
    type: "prebuilt",
    tool_schema: { type: "file_access" }
  },
  brave_search: {
    name: "brave_search", 
    displayName: "Web Search",
    description: "Enables web search capabilities using Brave Search",
    type: "prebuilt",
    tool_schema: { type: "brave_search" }
  }
}

interface ToolDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  toolName: string
  setToolName: (name: string) => void
  toolType: string
  setToolType: (type: string) => void
  toolSchema: string
  setToolSchema: (schema: string) => void
  agentUrl: string
  setAgentUrl: (url: string) => void
  editIndex: number | null
  onSubmit: () => void
  onCancel: () => void
}

export function ToolDialog({
  open,
  onOpenChange,
  toolName,
  setToolName,
  toolType,
  setToolType,
  toolSchema,
  setToolSchema,
  agentUrl,
  setAgentUrl,
  editIndex,
  onSubmit,
  onCancel,
}: ToolDialogProps) {
  
  const handleToolTypeChange = (newType: string) => {
    setToolType(newType);
    
    // Handle prebuilt tool selection
    if (newType in PREBUILT_TOOLS) {
      const prebuiltTool = PREBUILT_TOOLS[newType as keyof typeof PREBUILT_TOOLS];
      setToolName(prebuiltTool.name);
      setToolSchema(JSON.stringify(prebuiltTool.tool_schema, null, 2));
      setAgentUrl("");
    } else if (newType !== "a2a_call") {
      setAgentUrl(""); // Clear agentUrl if type is not a2a_call
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editIndex !== null ? 'Edit Tool' : 'Add Tool'}</DialogTitle>
          <DialogDescription>
            {editIndex !== null
              ? 'Update the tool details below.'
              : 'Enter the details of the new tool you want to add.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="tool-name" className="pb-1">Name</Label>
              <Input
                id="tool-name"
                value={toolName}
                onChange={e => setToolName(e.target.value)}
                placeholder="weather_forecast"
              />
            </div>
            <div>
              <Label htmlFor="tool-type" className="pb-1">Type</Label>
              <Select value={toolType} onValueChange={handleToolTypeChange}>
                <SelectTrigger id="tool-type">
                  <SelectValue placeholder="Select tool type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="a2a_call">Agent (A2A)</SelectItem>
                  <SelectItem value="file_access">File Access</SelectItem>
                  <SelectItem value="brave_search">Web Search</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {toolType === "a2a_call" && (
            <div>
              <Label htmlFor="agent-url" className="pb-1">Agent URL</Label>
              <Input
                id="agent-url"
                value={agentUrl}
                onChange={e => setAgentUrl(e.target.value)}
                placeholder="http://remote-agent/api/tasks/send"
              />
            </div>
          )}
          {toolType === "a2a_call" && (
            <div>
              <Label htmlFor="tool-schema" className="pb-1">Schema (JSON)</Label>
              <Textarea
                id="tool-schema"
                value={toolSchema}
                onChange={e => setToolSchema(e.target.value)}
                placeholder='{"properties":{"location":{"type":"string"},"days":{"type":"number"}},"required":["location"]}'
                rows={5}
              />
            </div>
          )}
          {(toolType === "file_access" || toolType === "brave_search") && (
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">
                {toolType === "file_access" 
                  ? "This prebuilt tool allows the agent to read and write files in the working directory."
                  : "This prebuilt tool enables web search capabilities using Brave Search API."
                }
              </p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={!toolName || !toolType}>
            {editIndex !== null ? 'Update Tool' : 'Add Tool'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
