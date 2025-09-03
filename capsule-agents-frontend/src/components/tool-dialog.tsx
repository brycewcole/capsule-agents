import { Input } from "./ui/input.tsx"
import { Label } from "./ui/label.tsx"
import { Button } from "./ui/button.tsx"
import { Switch } from "./ui/switch.tsx"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog.tsx"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select.tsx"

interface ToolDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  toolName: string
  setToolName: (name: string) => void
  toolType: "a2a" | "mcp" | ""
  setToolType: (type: "a2a" | "mcp" | "") => void
  toolEnabled: boolean
  setToolEnabled: (enabled: boolean) => void
  agentUrl: string
  setAgentUrl: (url: string) => void
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
  toolEnabled,
  setToolEnabled,
  agentUrl,
  setAgentUrl,
  mcpServerUrl,
  setMcpServerUrl,
  editIndex,
  onSubmit,
  onCancel,
}: ToolDialogProps) {
  const handleToolTypeChange = (newType: "a2a" | "mcp") => {
    setToolType(newType)

    if (newType !== "a2a") {
      setAgentUrl("") // Clear agentUrl if type is not a2a
    }
    if (newType !== "mcp") {
      setMcpServerUrl("") // Clear MCP URL if type is not mcp
    }
  }

  // URL validation functions
  const isValidUrl = (url: string): boolean => {
    if (!url) return false
    try {
      new URL(url)
      return true
    } catch {
      return false
    }
  }

  const isAgentUrlValid = toolType === "a2a" ? isValidUrl(agentUrl) : true
  const isMcpUrlValid = toolType === "mcp"
    ? isValidUrl(mcpServerUrl)
    : true

  // Check if form is valid
  const isFormValid = toolName && toolType &&
    (toolType === "a2a" ? isAgentUrlValid : true) &&
    (toolType === "mcp" ? isMcpUrlValid : true)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {editIndex !== null ? "Edit Custom Tool" : "Add Custom Tool"}
          </DialogTitle>
          <DialogDescription>
            {editIndex !== null
              ? "Update the custom tool details below."
              : "Enter the details of the new custom tool you want to add."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="tool-name" className="pb-1">Name</Label>
              <Input
                id="tool-name"
                value={toolName}
                onChange={(e) =>
                  setToolName(
                    (e.target as HTMLInputElement | HTMLTextAreaElement).value,
                  )}
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
                  <SelectItem value="a2a">
                    A2A Agent Communication
                  </SelectItem>
                  <SelectItem value="mcp">MCP Server</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-sm">Enabled</Label>
              <p className="text-xs text-muted-foreground">
                Whether this tool is active and available for use
              </p>
            </div>
            <Switch
              checked={toolEnabled}
              onCheckedChange={setToolEnabled}
            />
          </div>
          {toolType === "a2a" && (
            <div>
              <Label htmlFor="agent-url" className="pb-1">Agent URL</Label>
              <Input
                id="agent-url"
                value={agentUrl}
                onChange={(e) =>
                  setAgentUrl(
                    (e.target as HTMLInputElement | HTMLTextAreaElement).value,
                  )}
                placeholder="http://localhost:8080"
                className={agentUrl && !isAgentUrlValid ? "border-red-500" : ""}
              />
              {agentUrl && !isAgentUrlValid && (
                <p className="text-sm text-red-600 mt-1">
                  Please enter a valid URL
                </p>
              )}
            </div>
          )}
          {toolType === "mcp" && (
            <div>
              <Label htmlFor="mcp-server-url" className="pb-1">
                Server URL
              </Label>
              <Input
                id="mcp-server-url"
                value={mcpServerUrl}
                onChange={(e) =>
                  setMcpServerUrl(
                    (e.target as HTMLInputElement | HTMLTextAreaElement).value,
                  )}
                placeholder="https://api.example.com/mcp"
                className={mcpServerUrl && !isMcpUrlValid
                  ? "border-red-500"
                  : ""}
              />
              {mcpServerUrl && !isMcpUrlValid && (
                <p className="text-sm text-red-600 mt-1">
                  Please enter a valid URL
                </p>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            onClick={onSubmit}
            disabled={!isFormValid}
          >
            {editIndex !== null ? "Update Tool" : "Add Tool"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
