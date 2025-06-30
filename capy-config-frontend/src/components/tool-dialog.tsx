import { Input } from "@/components/ui/input"
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
  // MCP Server props
  mcpServerUrl: string
  setMcpServerUrl: (url: string) => void
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
  agentUrl,
  setAgentUrl,
  mcpServerUrl,
  setMcpServerUrl,
  editIndex,
  onSubmit,
  onCancel,
}: ToolDialogProps) {
  
  const handleToolTypeChange = (newType: string) => {
    setToolType(newType);
    
    if (newType !== "a2a_call") {
      setAgentUrl(""); // Clear agentUrl if type is not a2a_call
    }
    if (newType !== "mcp_server") {
      setMcpServerUrl(""); // Clear MCP URL if type is not mcp_server
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editIndex !== null ? 'Edit Custom Tool' : 'Add Custom Tool'}</DialogTitle>
          <DialogDescription>
            {editIndex !== null
              ? 'Update the custom tool details below.'
              : 'Enter the details of the new custom tool you want to add.'}
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
                  <SelectItem value="mcp_server">MCP Server</SelectItem>
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
          {toolType === "mcp_server" && (
            <div>
              <Label htmlFor="mcp-server-url" className="pb-1">Server URL</Label>
              <Input
                id="mcp-server-url"
                value={mcpServerUrl}
                onChange={e => setMcpServerUrl(e.target.value)}
                placeholder="ws://localhost:3000 or https://api.example.com/mcp"
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button 
            onClick={onSubmit} 
            disabled={!toolName || !toolType || (toolType === "mcp_server" && !mcpServerUrl)}
          >
            {editIndex !== null ? 'Update Tool' : 'Add Tool'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
