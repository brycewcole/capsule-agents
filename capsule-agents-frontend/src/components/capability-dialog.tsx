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

interface CapabilityDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  capabilityName: string
  setCapabilityName: (name: string) => void
  capabilityType: "a2a" | "mcp" | ""
  setCapabilityType: (type: "a2a" | "mcp" | "") => void
  capabilityEnabled: boolean
  setCapabilityEnabled: (enabled: boolean) => void
  agentUrl: string
  setAgentUrl: (url: string) => void
  mcpServerUrl: string
  setMcpServerUrl: (url: string) => void
  editIndex: number | null
  onSubmit: () => void
  onCancel: () => void
}

export function CapabilityDialog({
  open,
  onOpenChange,
  capabilityName,
  setCapabilityName,
  capabilityType,
  setCapabilityType,
  capabilityEnabled,
  setCapabilityEnabled,
  agentUrl,
  setAgentUrl,
  mcpServerUrl,
  setMcpServerUrl,
  editIndex,
  onSubmit,
  onCancel,
}: CapabilityDialogProps) {
  const handleCapabilityTypeChange = (newType: "a2a" | "mcp") => {
    setCapabilityType(newType)

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

  const isAgentUrlValid = capabilityType === "a2a" ? isValidUrl(agentUrl) : true
  const isMcpUrlValid = capabilityType === "mcp"
    ? isValidUrl(mcpServerUrl)
    : true

  // Check if form is valid
  const isFormValid = capabilityName && capabilityType &&
    (capabilityType === "a2a" ? isAgentUrlValid : true) &&
    (capabilityType === "mcp" ? isMcpUrlValid : true)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {editIndex !== null
              ? "Edit Custom Capability"
              : "Add Custom Capability"}
          </DialogTitle>
          <DialogDescription>
            {editIndex !== null
              ? "Update the custom capability details below."
              : "Enter the details of the new custom capability you want to add."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="capability-name" className="pb-1">Name</Label>
              <Input
                id="capability-name"
                value={capabilityName}
                onChange={(e) =>
                  setCapabilityName(
                    (e.target as HTMLInputElement | HTMLTextAreaElement).value,
                  )}
                placeholder="weather_forecast"
              />
            </div>
            <div>
              <Label htmlFor="capability-type" className="pb-1">Type</Label>
              <Select
                value={capabilityType}
                onValueChange={handleCapabilityTypeChange}
              >
                <SelectTrigger id="capability-type">
                  <SelectValue placeholder="Select capability type" />
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
                Whether this capability is active and available for use
              </p>
            </div>
            <Switch
              checked={capabilityEnabled}
              onCheckedChange={setCapabilityEnabled}
            />
          </div>
          {capabilityType === "a2a" && (
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
          {capabilityType === "mcp" && (
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
            {editIndex !== null ? "Update Capability" : "Add Capability"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
