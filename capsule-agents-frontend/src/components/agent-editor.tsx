"use client"

import { useEffect, useState } from "react"
import { Input } from "./ui/input.tsx"
import { Textarea } from "./ui/textarea.tsx"
import { Label } from "./ui/label.tsx"
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card.tsx"
import { Button } from "./ui/button.tsx"
import {
  Brain,
  Edit,
  HelpCircle,
  Loader2,
  Plus,
  Save,
  Terminal,
  Trash,
} from "lucide-react"
import { toast } from "sonner"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip.tsx"
import { ModelPicker } from "./model-picker.tsx"
import { Switch } from "./ui/switch.tsx"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog.tsx"
import {
  type AgentInfo,
  type Capability,
  getAgentInfo,
  getAvailableModels,
  getProviderInfo,
  isA2ACapability,
  isMCPCapability,
  isPrebuiltCapability,
  type Model,
  type PrebuiltCapability,
  type ProvidersResponse,
  updateAgentInfo,
} from "../lib/api.ts"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table.tsx"
import { CapabilityDialog } from "./capability-dialog.tsx"

export default function AgentEditor() {
  const [name, setName] = useState("")
  const [nameError, setNameError] = useState("")
  const [description, setDescription] = useState("")
  const [selectedModel, setSelectedModel] = useState<Model | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [availableModels, setAvailableModels] = useState<Model[]>([])
  const [providerInfo, setProviderInfo] = useState<ProvidersResponse | null>(
    null,
  )
  const [showNoModelsModal, setShowNoModelsModal] = useState(false)
  const [capabilities, setCapabilities] = useState<Capability[]>([])
  const [showCapabilityForm, setShowCapabilityForm] = useState(false)
  const [editIndex, setEditIndex] = useState<number | null>(null)

  // State to track original values for change detection
  const [originalState, setOriginalState] = useState<
    {
      name: string
      description: string
      modelName: string
      capabilities: Capability[]
    } | null
  >(null)

  // New state for capability form
  const [capabilityName, setCapabilityName] = useState("")
  const [capabilityType, setCapabilityType] = useState<"a2a" | "mcp" | "">("")
  const [capabilityEnabled, setCapabilityEnabled] = useState(true)
  const [agentUrl, setAgentUrl] = useState("") // For A2A capabilities
  const [mcpServerUrl, setMcpServerUrl] = useState("") // For MCP capabilities
  const [mcpServerType, setMcpServerType] = useState<"http" | "sse">("http") // For MCP server type
  const [mcpHeaders, setMcpHeaders] = useState<Record<string, string>>({}) // For MCP headers

  // Prebuilt capabilities state
  const [execEnabled, setExecEnabled] = useState(false)
  const [memoryEnabled, setMemoryEnabled] = useState(false)

  const handleSaveNameDescription = async () => {
    // Validate agent name before saving
    if (nameError) {
      toast.error("Invalid agent name", {
        description: "Please fix the agent name before saving.",
      })
      return
    }

    setIsSaving(true)
    const startTime = Date.now()
    try {
      const agentInfo: AgentInfo = {
        name,
        description,
        modelName: selectedModel?.id || "",
        modelParameters: {},
        capabilities: capabilities,
      }
      await updateAgentInfo(agentInfo)

      // Update original state after successful save
      setOriginalState({
        name,
        description,
        modelName: selectedModel?.id || "",
        capabilities: [...capabilities],
      })

      toast.success("Agent saved", {
        description: "Name and description updated successfully.",
      })
    } catch (error) {
      console.error("Error saving agent:", error)
      toast.error("Error saving agent", {
        description: "Failed to save agent configuration.",
      })
    } finally {
      const elapsed = Date.now() - startTime
      if (elapsed < 500) {
        await new Promise((res) => setTimeout(res, 500 - elapsed))
      }
      setIsSaving(false)
    }
  }

  const autoSaveAgent = async (
    nextCapabilities?: Capability[],
    nextModel?: Model | null,
    nextName?: string,
    nextDescription?: string,
  ) => {
    try {
      const finalName = nextName ?? name
      const finalDescription = nextDescription ?? description
      const finalModel = nextModel ?? selectedModel
      const finalCapabilities = nextCapabilities ?? capabilities

      const agentInfo: AgentInfo = {
        name: finalName,
        description: finalDescription,
        modelName: finalModel?.id || "",
        modelParameters: {},
        capabilities: finalCapabilities,
      }
      await updateAgentInfo(agentInfo)

      // Update original state after successful save
      setOriginalState({
        name: finalName,
        description: finalDescription,
        modelName: finalModel?.id || "",
        capabilities: [...finalCapabilities],
      })
    } catch (error) {
      console.error("Error auto-saving agent:", error)
      toast.error("Error auto-saving", {
        description: "Failed to save changes automatically.",
      })
    }
  }

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true)
        // Fetch models, provider info, and agent info in parallel
        const [models, providers, agentInfo] = await Promise.all([
          getAvailableModels(),
          getProviderInfo(),
          getAgentInfo(),
        ])
        setAvailableModels(models)
        setProviderInfo(providers)

        // Check if no models are available and show modal
        if (models.length === 0) {
          setShowNoModelsModal(true)
        }

        setName(agentInfo.name)
        setNameError("") // Clear any validation errors
        setDescription(agentInfo.description)
        const selectedModelFromBackend = models.find((m) =>
          m.id === agentInfo.modelName
        )
        setSelectedModel(selectedModelFromBackend || null)
        setCapabilities(agentInfo.capabilities || [])

        // Set prebuilt capability states based on existing capabilities
        const currentCapabilities = agentInfo.capabilities || []
        setExecEnabled(
          currentCapabilities.some((capability) =>
            isPrebuiltCapability(capability) &&
            capability.subtype === "exec" && capability.enabled
          ),
        )
        setMemoryEnabled(
          currentCapabilities.some((capability) =>
            isPrebuiltCapability(capability) &&
            capability.subtype === "memory" && capability.enabled
          ),
        )

        // Set original state for change detection
        setOriginalState({
          name: agentInfo.name,
          description: agentInfo.description,
          modelName: agentInfo.modelName,
          capabilities: currentCapabilities,
        })
      } catch (error) {
        console.error("Failed to fetch data:", error)
        toast.error("Error fetching data", {
          description: "Could not load agent or model data from server.",
        })
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [])

  const handleModelChange = (model: Model) => {
    setSelectedModel(model)
    // Auto-save when model changes, passing the model explicitly to avoid stale state
    setTimeout(() => autoSaveAgent(undefined, model), 0)
  }
  const handleModelSelect = (modelId: string) => {
    const model = availableModels.find((m) => m.id === modelId)
    if (model) {
      handleModelChange(model)
    }
  }

  const addCapability = (finalHeaders?: Record<string, string>) => {
    try {
      if (!capabilityName || !capabilityType) {
        toast.error("Invalid capability", {
          description: "Capability name and type are required.",
        })
        return
      }

      let newCapability: Capability

      if (capabilityType === "a2a") {
        if (!agentUrl) {
          toast.error("Invalid capability", {
            description: "Agent URL is required for A2A capability.",
          })
          return
        }
        try {
          // Validate URL (basic validation)
          new URL(agentUrl)
        } catch (_) {
          toast.error("Invalid URL", {
            description: "Please enter a valid Agent URL.",
          })
          return
        }
        newCapability = {
          name: capabilityName,
          enabled: capabilityEnabled,
          type: "a2a",
          agentUrl: agentUrl,
        }
      } else if (capabilityType === "mcp") {
        if (!mcpServerUrl) {
          toast.error("Invalid capability", {
            description: "Server URL is required for MCP server capability.",
          })
          return
        }
        try {
          // Validate URL (basic validation)
          new URL(mcpServerUrl)
        } catch (_) {
          toast.error("Invalid URL", {
            description: "Please enter a valid MCP server URL.",
          })
          return
        }
        const resolvedHeaders = finalHeaders ?? mcpHeaders
        newCapability = {
          name: capabilityName,
          enabled: capabilityEnabled,
          type: "mcp",
          serverUrl: mcpServerUrl,
          serverType: mcpServerType,
          headers: Object.keys(resolvedHeaders).length > 0
            ? resolvedHeaders
            : undefined,
        }
      } else {
        toast.error("Invalid capability type", {
          description: "Please select a valid capability type.",
        })
        return
      }

      let updatedCapabilities: Capability[]

      if (editIndex !== null) {
        // Update existing capability
        updatedCapabilities = [...capabilities]
        updatedCapabilities[editIndex] = newCapability
        toast.success("Capability updated", {
          description: `Capability "${capabilityName}" has been updated.`,
        })
      } else {
        // Add new capability
        updatedCapabilities = [...capabilities, newCapability]
        toast.success("Capability added", {
          description: `Capability "${capabilityName}" has been added.`,
        })
      }

      setCapabilities(updatedCapabilities)

      // Reset form
      resetCapabilityForm()

      // Auto-save when custom capability is added/updated
      setTimeout(() => autoSaveAgent(updatedCapabilities), 0)
    } catch (error) {
      console.error("Error adding capability:", error)
      toast.error("Error adding capability", {
        description: "An error occurred while adding the capability.",
      })
    }
  }

  const editCapability = (index: number) => {
    const capability = capabilities[index]

    // Don't allow editing prebuilt capabilities through the dialog
    if (isPrebuiltCapability(capability)) {
      toast.error("Cannot edit prebuilt capabilities", {
        description:
          "Use the toggles above to enable/disable prebuilt capabilities.",
      })
      return
    }

    setCapabilityName(capability.name)
    setCapabilityEnabled(capability.enabled)

    if (isA2ACapability(capability)) {
      setCapabilityType("a2a")
      setAgentUrl(capability.agentUrl)
      setMcpServerUrl("")
    } else if (isMCPCapability(capability)) {
      setCapabilityType("mcp")
      setMcpServerUrl(capability.serverUrl)
      setMcpServerType(capability.serverType)
      setMcpHeaders(capability.headers || {})
      setAgentUrl("")
    }

    setEditIndex(index)
    setShowCapabilityForm(true)
  }

  const deleteCapability = (index: number) => {
    const capability = capabilities[index]

    // Don't allow deleting prebuilt capabilities through the table
    if (isPrebuiltCapability(capability)) {
      toast.error("Cannot delete prebuilt capabilities", {
        description:
          "Use the toggles above to enable/disable prebuilt capabilities.",
      })
      return
    }

    const newCapabilities = [...capabilities]
    const capabilityName = capabilities[index].name
    newCapabilities.splice(index, 1)
    setCapabilities(newCapabilities)
    toast.success("Capability removed", {
      description: `Capability "${capabilityName}" has been removed.`,
    })

    // Auto-save when custom capability is deleted
    setTimeout(() => autoSaveAgent(newCapabilities), 0)
  }

  const resetCapabilityForm = () => {
    setCapabilityName("")
    setCapabilityType("")
    setCapabilityEnabled(true)
    setAgentUrl("") // Reset agentUrl
    setMcpServerUrl("") // Reset MCP fields
    setMcpServerType("http") // Reset MCP server type
    setMcpHeaders({}) // Reset MCP headers
    setEditIndex(null)
    setShowCapabilityForm(false)
  }

  const handleAddNewCapabilityClick = () => {
    resetCapabilityForm() // Clears form state, sets editIndex to null, and calls setShowCapabilityForm(false)
    setShowCapabilityForm(true) // Opens the dialog for a new capability
  }

  // Handle prebuilt capability toggles
  const handlePrebuiltCapabilityToggle = (
    subtype: "exec" | "memory",
    enabled: boolean,
  ) => {
    const capabilityConfig = {
      exec: {
        name: "exec",
        displayName: "Interactive Shell",
      },
      memory: {
        name: "memory",
        displayName: "Memory",
      },
    }

    const config = capabilityConfig[subtype]
    if (!config) return

    let newCapabilities = [...capabilities]

    if (enabled) {
      // Add the prebuilt capability if it doesn't exist
      const exists = newCapabilities.some((capability) =>
        isPrebuiltCapability(capability) && capability.subtype === subtype
      )
      if (!exists) {
        const newCapability: PrebuiltCapability = {
          name: config.name,
          enabled: true,
          type: "prebuilt",
          subtype: subtype,
        }
        newCapabilities.push(newCapability)
      } else {
        // Enable existing capability
        newCapabilities = newCapabilities.map((capability) =>
          isPrebuiltCapability(capability) && capability.subtype === subtype
            ? { ...capability, enabled: true }
            : capability
        )
      }
    } else {
      // Disable the prebuilt capability
      newCapabilities = newCapabilities.map((capability) =>
        isPrebuiltCapability(capability) && capability.subtype === subtype
          ? { ...capability, enabled: false }
          : capability
      )
    }

    setCapabilities(newCapabilities)

    // Update the toggle state
    if (subtype === "exec") setExecEnabled(enabled)
    else if (subtype === "memory") setMemoryEnabled(enabled)

    toast.success(
      enabled ? "Capability enabled" : "Capability disabled",
      {
        description: `${config.displayName} has been ${
          enabled ? "enabled" : "disabled"
        }.`,
      },
    )

    // Auto-save when capability toggles change
    setTimeout(() => autoSaveAgent(), 0)
  }

  if (isLoading) {
    return (
      <Card className="shadow-md">
        <CardContent className="flex items-center justify-center p-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="ml-2 text-lg">Loading agent information...</span>
        </CardContent>
      </Card>
    )
  }

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {/* Agent Information Card */}
        <Card className="shadow-md h-fit">
          <CardHeader>
            <div className="flex items-center gap-2">
              <CardTitle className="text-xl">Agent Information</CardTitle>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>Configure your agent's name and description</p>
                </TooltipContent>
              </Tooltip>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="agent-name">Name</Label>
              <Input
                id="agent-name"
                value={name}
                onChange={(e) => {
                  const value =
                    (e.target as HTMLInputElement | HTMLTextAreaElement).value
                  if (value.includes(" ")) {
                    setNameError("Name cannot contain spaces")
                  } else {
                    setNameError("")
                  }
                  setName(value)
                }}
                className={nameError ? "border-red-500" : ""}
              />
              {nameError && <p className="text-sm text-red-600">{nameError}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="agent-description">Description</Label>
              <Textarea
                id="agent-description"
                value={description}
                onChange={(e) =>
                  setDescription(
                    (e.target as HTMLInputElement | HTMLTextAreaElement).value,
                  )}
              />
            </div>
            <div className="flex justify-end">
              <Button
                onClick={handleSaveNameDescription}
                size="sm"
                disabled={isSaving || !!nameError ||
                  (name === originalState?.name &&
                    description === originalState?.description)}
              >
                {isSaving
                  ? (
                    <>
                      <Loader2 className="animate-spin mr-2" />Saving...
                    </>
                  )
                  : (
                    <>
                      <Save className="mr-2" />Save
                    </>
                  )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Model Configuration Card */}
        <Card className="shadow-md h-fit">
          <CardHeader>
            <div className="flex items-center gap-2">
              <CardTitle className="text-xl">Model</CardTitle>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>Select the AI model for your agent</p>
                </TooltipContent>
              </Tooltip>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            <ModelPicker
              providers={providerInfo}
              value={selectedModel?.id || ""}
              onChange={handleModelSelect}
              placeholder="Select a model"
            />
          </CardContent>
        </Card>

        {/* Capabilities Card */}
        <Card className="shadow-md h-fit">
          <CardHeader>
            <div className="flex items-center gap-2">
              <CardTitle className="text-xl">Capabilities</CardTitle>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>Configure tools and integrations for your agent</p>
                </TooltipContent>
              </Tooltip>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Prebuilt Capabilities Toggles */}
            <div className="space-y-3 p-4 bg-muted/50 rounded-lg">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Terminal className="h-5 w-5 text-muted-foreground" />
                    <div className="space-y-0.5">
                      <Label className="text-sm">Interactive Shell</Label>
                      <p className="text-xs text-muted-foreground">
                        Allows the agent to execute shell commands in its
                        container
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={execEnabled}
                    onCheckedChange={(checked) =>
                      handlePrebuiltCapabilityToggle("exec", checked)}
                  />
                </div>
                <div className="flex items-center justify-between opacity-60">
                  <div className="flex items-center gap-3">
                    <Brain className="h-5 w-5 text-muted-foreground" />
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <Label className="text-sm">Memory</Label>
                        <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                          Coming Soon
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Enables persistent memory storage for the agent
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={memoryEnabled}
                    onCheckedChange={(checked) =>
                      handlePrebuiltCapabilityToggle("memory", checked)}
                    disabled
                  />
                </div>
              </div>
            </div>

            <CapabilityDialog
              open={showCapabilityForm}
              onOpenChange={(open) => {
                setShowCapabilityForm(open)
                if (!open) resetCapabilityForm()
              }}
              capabilityName={capabilityName}
              setCapabilityName={setCapabilityName}
              capabilityType={capabilityType}
              setCapabilityType={setCapabilityType}
              capabilityEnabled={capabilityEnabled}
              setCapabilityEnabled={setCapabilityEnabled}
              agentUrl={agentUrl}
              setAgentUrl={setAgentUrl}
              mcpServerUrl={mcpServerUrl}
              setMcpServerUrl={setMcpServerUrl}
              mcpServerType={mcpServerType}
              setMcpServerType={setMcpServerType}
              mcpHeaders={mcpHeaders}
              setMcpHeaders={setMcpHeaders}
              editIndex={editIndex}
              onSubmit={addCapability}
              onCancel={() => setShowCapabilityForm(false)}
            />

            {/* Custom Capabilities Table */}
            {capabilities.filter((capability) =>
                !isPrebuiltCapability(capability)
              ).length > 0
              ? (
                <div className="space-y-2">
                  <Label className="text-sm font-medium">
                    Custom Capabilities
                  </Label>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="w-20">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {capabilities.filter((capability) =>
                        !isPrebuiltCapability(capability)
                      ).map(
                        (capability, _originalIndex) => {
                          const actualIndex = capabilities.findIndex((t) =>
                            t === capability
                          )
                          return (
                            <TableRow key={actualIndex}>
                              <TableCell>{capability.name}</TableCell>
                              <TableCell>
                                {isA2ACapability(capability)
                                  ? "Agent (A2A)"
                                  : isMCPCapability(capability)
                                  ? "MCP Server"
                                  : isPrebuiltCapability(capability)
                                  ? "Prebuilt"
                                  : "Unknown"}
                              </TableCell>
                              <TableCell>
                                <span
                                  className={`px-2 py-1 rounded-full text-xs ${
                                    capability.enabled
                                      ? "bg-green-100 text-green-800"
                                      : "bg-gray-100 text-gray-600"
                                  }`}
                                >
                                  {capability.enabled ? "Enabled" : "Disabled"}
                                </span>
                              </TableCell>
                              <TableCell className="flex gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => editCapability(actualIndex)}
                                  title="Edit capability"
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => deleteCapability(actualIndex)}
                                  title="Remove capability"
                                >
                                  <Trash className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          )
                        },
                      )}
                    </TableBody>
                  </Table>
                </div>
              )
              : (
                <div className="space-y-2">
                  <Label className="text-sm font-medium">
                    Custom Capabilities
                  </Label>
                  <div className="text-center p-4 text-muted-foreground border border-dashed rounded-md">
                    No custom capabilities configured. Add custom capabilities
                    like Agent (A2A) connections and remote MCP servers.
                  </div>
                </div>
              )}

            {/* Add Custom Capability Button */}
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="outline"
                onClick={handleAddNewCapabilityClick}
              >
                <Plus className="mr-2 h-4 w-4" />
                Add
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* No Models Available Modal */}
        <Dialog open={showNoModelsModal} onOpenChange={setShowNoModelsModal}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <HelpCircle className="h-5 w-5 text-orange-500" />
                No AI Models Available
              </DialogTitle>
              <DialogDescription>
                To use this agent, you need to configure at least one AI
                provider by setting the appropriate environment variables.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="text-sm">
                <p className="font-medium mb-3">Available Providers:</p>
                {providerInfo?.providers.map((provider) => (
                  <div key={provider.id} className="mb-3 p-3 border rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-medium">{provider.name}</span>
                      {provider.available
                        ? (
                          <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                            ✓ Available
                          </span>
                        )
                        : (
                          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
                            Not Configured
                          </span>
                        )}
                    </div>
                    <div className="text-xs text-gray-600">
                      <p className="mb-1">
                        {provider.models.length} models available
                      </p>
                      <p>
                        <strong>Required:</strong>{" "}
                        Set one of these environment variables:
                      </p>
                      <ul className="list-disc list-inside ml-2 mt-1">
                        {provider.requiredEnvVars.map((envVar) => (
                          <li key={envVar} className="font-mono text-xs">
                            {envVar}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ))}
              </div>

              <div className="bg-blue-50 p-3 rounded-lg text-sm">
                <p className="font-medium text-blue-900 mb-2">
                  💡 Quick Setup:
                </p>
                <ol className="list-decimal list-inside text-blue-800 space-y-1">
                  <li>Get API keys from your preferred AI provider(s)</li>
                  <li>Set the environment variable(s) in your deployment</li>
                  <li>Restart the application</li>
                  <li>Refresh this page to see available models</li>
                </ol>
              </div>
            </div>

            <div className="flex justify-end mt-4">
              <Button
                variant="outline"
                onClick={() => setShowNoModelsModal(false)}
              >
                Got it
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  )
}
