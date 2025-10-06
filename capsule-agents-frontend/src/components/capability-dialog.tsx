import { useState } from "react"
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
import { Plus, Trash } from "lucide-react"

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
  mcpServerType: "http" | "sse"
  setMcpServerType: (type: "http" | "sse") => void
  mcpHeaders: Record<string, string>
  setMcpHeaders: (headers: Record<string, string>) => void
  editIndex: number | null
  onSubmit: (finalHeaders?: Record<string, string>) => void
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
  mcpServerType,
  setMcpServerType,
  mcpHeaders,
  setMcpHeaders,
  editIndex,
  onSubmit,
  onCancel,
}: CapabilityDialogProps) {
  const [headerKey, setHeaderKey] = useState("")
  const [headerValue, setHeaderValue] = useState("")

  const handleSubmit = () => {
    if (capabilityType === "mcp") {
      const trimmedKey = headerKey.trim()
      const trimmedValue = headerValue.trim()
      const updatedHeaders = trimmedKey && trimmedValue
        ? { ...mcpHeaders, [trimmedKey]: trimmedValue }
        : mcpHeaders

      if (trimmedKey && trimmedValue) {
        setMcpHeaders(updatedHeaders)
        setHeaderKey("")
        setHeaderValue("")
      }

      onSubmit(updatedHeaders)
      return
    }

    onSubmit()
  }

  const handleCapabilityTypeChange = (newType: "a2a" | "mcp") => {
    setCapabilityType(newType)

    if (newType !== "a2a") {
      setAgentUrl("") // Clear agentUrl if type is not a2a
    }
    if (newType !== "mcp") {
      setMcpServerUrl("") // Clear MCP URL if type is not mcp
      setMcpHeaders({})
    }
  }

  const addHeader = () => {
    const trimmedKey = headerKey.trim()
    const trimmedValue = headerValue.trim()

    if (trimmedKey && trimmedValue) {
      setMcpHeaders({ ...mcpHeaders, [trimmedKey]: trimmedValue })
      setHeaderKey("")
      setHeaderValue("")
    }
  }

  const removeHeader = (key: string) => {
    const newHeaders = { ...mcpHeaders }
    delete newHeaders[key]
    setMcpHeaders(newHeaders)
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
                    A2A Agent
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
            <>
              <div className="grid grid-cols-[auto_1fr] gap-4 items-end">
                <div className="w-32">
                  <Label htmlFor="mcp-server-type" className="pb-1">
                    Server Type
                  </Label>
                  <Select
                    value={mcpServerType}
                    onValueChange={(value: "http" | "sse") =>
                      setMcpServerType(value)}
                  >
                    <SelectTrigger id="mcp-server-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="http">HTTP</SelectItem>
                      <SelectItem value="sse">SSE</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1">
                  <Label htmlFor="mcp-server-url" className="pb-1">
                    Server URL
                  </Label>
                  <Input
                    id="mcp-server-url"
                    value={mcpServerUrl}
                    onChange={(e) =>
                      setMcpServerUrl(
                        (e.target as HTMLInputElement | HTMLTextAreaElement)
                          .value,
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
              </div>

              {/* Headers Section */}
              <div className="space-y-2">
                <Label className="text-sm">Headers (Optional)</Label>
                {Object.entries(mcpHeaders).length > 0 && (
                  <div className="space-y-2">
                    {Object.entries(mcpHeaders).map(([key, value]) => (
                      <div
                        key={key}
                        className="flex items-center gap-2 p-2 bg-muted rounded"
                      >
                        <code className="text-xs flex-1">
                          {key}: {value}
                        </code>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeHeader(key)}
                        >
                          <Trash className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex gap-2">
                  <Input
                    placeholder="Header name"
                    value={headerKey}
                    onChange={(e) =>
                      setHeaderKey(
                        (e.target as HTMLInputElement).value,
                      )}
                  />
                  <Input
                    placeholder="Header value"
                    value={headerValue}
                    onChange={(e) =>
                      setHeaderValue(
                        (e.target as HTMLInputElement).value,
                      )}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addHeader}
                    disabled={!headerKey || !headerValue}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Add custom headers for authentication or other purposes
                </p>
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!isFormValid}
          >
            {editIndex !== null ? "Update Capability" : "Add Capability"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
