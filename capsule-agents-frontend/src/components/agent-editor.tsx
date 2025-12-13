"use client"

import { useEffect, useState } from "react"
import { Input } from "./ui/input.tsx"
import { Textarea } from "./ui/textarea.tsx"
import { Label } from "./ui/label.tsx"
import { Button } from "./ui/button.tsx"
import {
  Bot,
  Brain,
  Edit,
  FileText,
  HelpCircle,
  Loader2,
  Pencil,
  Plus,
  Save,
  Search,
  Terminal,
  Trash,
  Zap,
} from "lucide-react"
import { toast } from "sonner"
import { TooltipProvider } from "./ui/tooltip.tsx"
import { ModelPicker } from "./model-picker.tsx"
import { Switch } from "./ui/switch.tsx"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog.tsx"
import {
  type AgentInfo,
  type Capability,
  type DefaultPrompt,
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
import { CapabilityDialog } from "./capability-dialog.tsx"
import { HooksConfig } from "./hooks-config.tsx"
import { ItemsTable } from "./ui/items-table.tsx"

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
      builtInPromptsEnabled: boolean
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
  const [readFileEnabled, setReadFileEnabled] = useState(false)
  const [grepFilesEnabled, setGrepFilesEnabled] = useState(false)
  const [editFileEnabled, setEditFileEnabled] = useState(false)
  const [builtInPromptsEnabled, setDefaultPromptsEnabled] = useState(true)
  const [builtInPrompts, setDefaultPrompts] = useState<DefaultPrompt[]>([])
  const [showDefaultPromptDialog, setShowDefaultPromptDialog] = useState(false)
  const [hooks, setHooks] = useState<import("../lib/api.ts").HookConfig[]>([])

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
        builtInPromptsEnabled,
        hooks,
      }
      const updated = await updateAgentInfo(agentInfo)

      // Update original state after successful save
      setOriginalState({
        name: updated.name,
        description: updated.description,
        modelName: updated.modelName,
        capabilities: [...(updated.capabilities ?? capabilities)],
        builtInPromptsEnabled: updated.builtInPromptsEnabled,
      })
      setCapabilities(updated.capabilities ?? capabilities)
      setDefaultPrompts(updated.builtInPrompts ?? [])
      setDefaultPromptsEnabled(updated.builtInPromptsEnabled)

      // Update document title with new agent name
      if (name) {
        document.title = name
      }

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
    nextDefaultPromptsEnabled?: boolean,
    nextHooks?: import("../lib/api.ts").HookConfig[],
  ) => {
    try {
      const finalName = nextName ?? name
      const finalDescription = nextDescription ?? description
      const finalModel = nextModel ?? selectedModel
      const finalCapabilities = nextCapabilities ?? capabilities
      const finalDefaultPromptsEnabled = nextDefaultPromptsEnabled ??
        builtInPromptsEnabled
      const finalHooks = nextHooks ?? hooks

      const agentInfo: AgentInfo = {
        name: finalName,
        description: finalDescription,
        modelName: finalModel?.id || "",
        modelParameters: {},
        capabilities: finalCapabilities,
        builtInPromptsEnabled: finalDefaultPromptsEnabled,
        hooks: finalHooks,
      }
      const updated = await updateAgentInfo(agentInfo)

      // Update original state after successful save
      setOriginalState({
        name: updated.name,
        description: updated.description,
        modelName: updated.modelName,
        capabilities: [...(updated.capabilities ?? finalCapabilities)],
        builtInPromptsEnabled: updated.builtInPromptsEnabled,
      })
      setCapabilities(updated.capabilities ?? finalCapabilities)
      setDefaultPrompts(updated.builtInPrompts ?? [])
      setDefaultPromptsEnabled(updated.builtInPromptsEnabled)
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
        setDefaultPromptsEnabled(
          agentInfo.builtInPromptsEnabled ?? true,
        )
        setDefaultPrompts(agentInfo.builtInPrompts ?? [])
        setHooks(agentInfo.hooks ?? [])

        // Update document title with agent name from config
        if (agentInfo.name) {
          document.title = agentInfo.name
        }

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
        setReadFileEnabled(
          currentCapabilities.some((capability) =>
            isPrebuiltCapability(capability) &&
            capability.subtype === "read_file" && capability.enabled
          ),
        )
        setGrepFilesEnabled(
          currentCapabilities.some((capability) =>
            isPrebuiltCapability(capability) &&
            capability.subtype === "grep_files" && capability.enabled
          ),
        )
        setEditFileEnabled(
          currentCapabilities.some((capability) =>
            isPrebuiltCapability(capability) &&
            capability.subtype === "edit_file" && capability.enabled
          ),
        )

        // Set original state for change detection
        setOriginalState({
          name: agentInfo.name,
          description: agentInfo.description,
          modelName: agentInfo.modelName,
          capabilities: currentCapabilities,
          builtInPromptsEnabled: agentInfo.builtInPromptsEnabled ?? true,
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
    subtype: "exec" | "memory" | "read_file" | "grep_files" | "edit_file",
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
      read_file: {
        name: "read_file",
        displayName: "Read Files",
      },
      grep_files: {
        name: "grep_files",
        displayName: "Search Files",
      },
      edit_file: {
        name: "edit_file",
        displayName: "Edit Files",
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
    else if (subtype === "read_file") setReadFileEnabled(enabled)
    else if (subtype === "grep_files") setGrepFilesEnabled(enabled)
    else if (subtype === "edit_file") setEditFileEnabled(enabled)

    toast.success(
      enabled ? "Capability enabled" : "Capability disabled",
      {
        description: `${config.displayName} has been ${
          enabled ? "enabled" : "disabled"
        }.`,
      },
    )

    // Auto-save when capability toggles change - pass newCapabilities to avoid stale state
    setTimeout(() => autoSaveAgent(newCapabilities), 0)
  }

  const handleDefaultPromptToggle = (enabled: boolean) => {
    setDefaultPromptsEnabled(enabled)
    toast.success(
      enabled ? "Default prompts enabled" : "Default prompts disabled",
      {
        description: enabled
          ? "Combined prompt includes the built-in defaults."
          : "The agent will only use your custom description.",
      },
    )
    setTimeout(
      () =>
        autoSaveAgent(
          undefined,
          undefined,
          undefined,
          undefined,
          enabled,
        ),
      0,
    )
  }

  const applicablePrompts = builtInPrompts.filter((prompt) =>
    prompt.matchesModel
  )

  if (isLoading) {
    return (
      <section
        className="rounded-2xl border bg-white p-6 shadow-sm"
        aria-labelledby="agent-heading"
      >
        <div className="flex h-40 flex-col items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span>Loading agent information...</span>
        </div>
      </section>
    )
  }

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {/* Agent Information Card */}
        <section
          className="rounded-2xl border bg-white p-6 shadow-sm"
          aria-labelledby="agent-heading"
        >
          <div className="space-y-1 mb-6">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5" />
              <h3
                id="agent-heading"
                className="text-xl font-semibold text-foreground"
              >
                Agent Information
              </h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Configure your agent's name and description
            </p>
          </div>

          <div className="space-y-4">
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto p-0 text-muted-foreground"
              onClick={() => setShowDefaultPromptDialog(true)}
            >
              View built-in prompts
            </Button>
            <div className="space-y-2">
              <Label htmlFor="agent-name">Name</Label>
              <Input
                id="agent-name"
                value={name}
                onChange={(e) => {
                  const value =
                    (e.target as HTMLInputElement | HTMLTextAreaElement).value
                  setNameError("")
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
          </div>
        </section>

        {/* Model Configuration Card */}
        <section
          className="rounded-2xl border bg-white p-6 shadow-sm"
          aria-labelledby="model-heading"
        >
          <div className="space-y-1 mb-6">
            <div className="flex items-center gap-2">
              <Brain className="h-5 w-5" />
              <h3
                id="model-heading"
                className="text-xl font-semibold text-foreground"
              >
                Model
              </h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Select the AI model for your agent
            </p>
          </div>

          <div className="space-y-2">
            <ModelPicker
              providers={providerInfo}
              value={selectedModel?.id || ""}
              onChange={handleModelSelect}
              placeholder="Select a model"
            />
          </div>
        </section>

        {/* Capabilities Card */}
        <section
          className="rounded-2xl border bg-white p-6 shadow-sm"
          aria-labelledby="capabilities-heading"
        >
          <div className="space-y-1 mb-6">
            <div className="flex items-center gap-2">
              <Zap className="h-5 w-5" />
              <h3
                id="capabilities-heading"
                className="text-xl font-semibold text-foreground"
              >
                Capabilities
              </h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Configure tools and integrations for your agent
            </p>
          </div>

          <div className="space-y-4">
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
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                    <div className="space-y-0.5">
                      <Label className="text-sm">Read Files</Label>
                      <p className="text-xs text-muted-foreground">
                        Allows the agent to read file contents with pagination
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={readFileEnabled}
                    onCheckedChange={(checked) =>
                      handlePrebuiltCapabilityToggle("read_file", checked)}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Search className="h-5 w-5 text-muted-foreground" />
                    <div className="space-y-0.5">
                      <Label className="text-sm">Search Files</Label>
                      <p className="text-xs text-muted-foreground">
                        Enables searching for patterns in files using ripgrep
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={grepFilesEnabled}
                    onCheckedChange={(checked) =>
                      handlePrebuiltCapabilityToggle("grep_files", checked)}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Pencil className="h-5 w-5 text-muted-foreground" />
                    <div className="space-y-0.5">
                      <Label className="text-sm">Edit Files</Label>
                      <p className="text-xs text-muted-foreground">
                        Allows the agent to edit files via string replacement
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={editFileEnabled}
                    onCheckedChange={(checked) =>
                      handlePrebuiltCapabilityToggle("edit_file", checked)}
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
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                Custom Capabilities
              </Label>
              <ItemsTable
                items={capabilities.filter((capability) =>
                  !isPrebuiltCapability(capability)
                ).map((capability) => ({
                  capability,
                  actualIndex: capabilities.findIndex((t) => t === capability),
                }))}
                columns={[
                  {
                    header: "Name",
                    accessor: (item) => item.capability.name,
                  },
                  {
                    header: "Type",
                    accessor: (item) =>
                      isA2ACapability(item.capability)
                        ? "Agent (A2A)"
                        : isMCPCapability(item.capability)
                        ? "MCP Server"
                        : isPrebuiltCapability(item.capability)
                        ? "Prebuilt"
                        : "Unknown",
                  },
                ]}
                getEnabled={(item) => item.capability.enabled}
                onAdd={handleAddNewCapabilityClick}
                onEdit={(index) => {
                  const item = capabilities.filter((capability) =>
                    !isPrebuiltCapability(capability)
                  ).map((capability) => ({
                    capability,
                    actualIndex: capabilities.findIndex((t) =>
                      t === capability
                    ),
                  }))[index]
                  editCapability(item.actualIndex)
                }}
                onDelete={(index) => {
                  const item = capabilities.filter((capability) =>
                    !isPrebuiltCapability(capability)
                  ).map((capability) => ({
                    capability,
                    actualIndex: capabilities.findIndex((t) =>
                      t === capability
                    ),
                  }))[index]
                  deleteCapability(item.actualIndex)
                }}
                addButtonLabel="Add"
                emptyMessage="No custom capabilities configured. Add custom capabilities like Agent (A2A) connections and remote MCP servers."
              />
            </div>
          </div>
        </section>

        {/* Hooks Configuration */}
        <HooksConfig
          hooks={hooks}
          onChange={(newHooks) => {
            setHooks(newHooks)
            toast.success("Hooks updated")
            setTimeout(
              () =>
                autoSaveAgent(
                  undefined,
                  undefined,
                  undefined,
                  undefined,
                  undefined,
                  newHooks,
                ),
              0,
            )
          }}
        />

        <Dialog
          open={showDefaultPromptDialog}
          onOpenChange={setShowDefaultPromptDialog}
        >
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Built-in prompts</DialogTitle>
              <DialogDescription>
                Capsule’s built-in instructions that prepend your custom
                description when enabled.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 p-4">
              <div>
                <p className="text-sm font-medium text-foreground">
                  {builtInPromptsEnabled
                    ? "Built-in prompts enabled"
                    : "Built-in prompts disabled"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Toggle to control whether built-in prompts prepend your custom
                  description.
                </p>
              </div>
              <Switch
                checked={builtInPromptsEnabled}
                onCheckedChange={handleDefaultPromptToggle}
                aria-label="Toggle default prompts"
              />
            </div>

            {applicablePrompts.length === 0
              ? (
                <div className="rounded-md border border-dashed bg-muted/30 p-4 text-sm text-muted-foreground">
                  No default prompts currently target this model.
                </div>
              )
              : (
                <div className="max-h-[60vh] overflow-y-auto space-y-5 pr-1">
                  {!builtInPromptsEnabled && (
                    <div className="rounded-md border border-dashed bg-amber-50 p-3 text-sm text-amber-900">
                      Built-in prompts are disabled. Enable them to include the
                      instructions below.
                    </div>
                  )}

                  {applicablePrompts.map((prompt) => (
                    <div
                      key={prompt.id}
                      className="space-y-4 rounded-2xl border bg-muted/20 p-5"
                    >
                      <div>
                        <h4 className="text-base font-semibold text-foreground">
                          {prompt.title}
                        </h4>
                      </div>
                      <div className="rounded-xl border border-dashed bg-background/70 p-4 text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap">
                        {prompt.text}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {prompt.modelFilter?.include &&
                            prompt.modelFilter.include.length > 0
                          ? (
                            <>
                              Matches:{" "}
                              <span className="font-medium text-foreground">
                                {prompt.modelFilter.include.join(", ")}
                              </span>
                            </>
                          )
                          : "Applies to all models."}
                      </p>
                    </div>
                  ))}
                </div>
              )}

            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Close</Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>

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
