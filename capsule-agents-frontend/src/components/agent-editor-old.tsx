"use client"

import { useEffect, useState } from "react"
import { Input } from "./ui/input.tsx"
import { Textarea } from "./ui/textarea.tsx"
import { Label } from "./ui/label.tsx"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./ui/card.tsx"
import { Button } from "./ui/button.tsx"
import { Edit, HelpCircle, Loader2, Plus, Save, Trash } from "lucide-react"
import { Separator } from "./ui/separator.tsx"
import { toast } from "sonner"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "./ui/select.tsx"
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
  getAgentInfo,
  getAvailableModels,
  getProviderInfo,
  type Model,
  type ProvidersResponse,
  type Tool,
  type PrebuiltTool,
  type A2ATool,
  type MCPTool,
  isPrebuiltTool,
  isA2ATool,
  isMCPTool,
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
import { ToolDialog } from "./tool-dialog.tsx"

export default function AgentEditor() {
  const [name, setName] = useState("")
  const [nameError, setNameError] = useState("")
  const [description, setDescription] = useState("")
  const [selectedModel, setSelectedModel] = useState<Model | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [availableModels, setAvailableModels] = useState<Model[]>([])
  const [providerInfo, setProviderInfo] = useState<ProvidersResponse | null>(null)
  const [showNoModelsModal, setShowNoModelsModal] = useState(false)
  const [tools, setTools] = useState<Tool[]>([])
  const [showToolForm, setShowToolForm] = useState(false)
  const [editIndex, setEditIndex] = useState<number | null>(null)

  // State to track original values for change detection
  const [originalState, setOriginalState] = useState<
    {
      name: string
      description: string
      modelName: string
      tools: Tool[]
    } | null
  >(null)

  // New state for tool form
  const [toolName, setToolName] = useState("")
  const [toolType, setToolType] = useState<"a2a" | "mcp" | "">("")
  const [toolEnabled, setToolEnabled] = useState(true)
  const [agentUrl, setAgentUrl] = useState("") // For A2A tools
  const [mcpServerUrl, setMcpServerUrl] = useState("") // For MCP tools

  // Prebuilt tools state
  const [fileAccessEnabled, setFileAccessEnabled] = useState(false)
  const [webSearchEnabled, setWebSearchEnabled] = useState(false)
  const [memoryEnabled, setMemoryEnabled] = useState(false)

  // Function to check if there are any changes
  const hasChanges = (): boolean => {
    if (!originalState) return false

    return (
      name !== originalState.name ||
      description !== originalState.description ||
      selectedModel?.id !== originalState.modelName ||
      JSON.stringify(tools) !== JSON.stringify(originalState.tools)
    )
  }

  const handleSave = async () => {
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
        tools: tools,
      }
      await updateAgentInfo(agentInfo)

      // Update original state after successful save
      setOriginalState({
        name,
        description,
        modelName: selectedModel?.id || "",
        tools: [...tools],
      })

      toast.success("Agent saved", {
        description: "Agent configuration has been updated successfully.",
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
<<<<<<< HEAD
        
        // Check if no models are available and show modal
        if (models.length === 0) {
          setShowNoModelsModal(true)
        }
        
||||||| 7aef63e
        setAvailableModels(
          models.map((model) => ({
            id: model.model_name,
            name: model.display_name,
          })),
        )
=======

        // Check if no models are available and show modal
        if (models.length === 0) {
          setShowNoModelsModal(true)
        }

>>>>>>> main
        setName(agentInfo.name)
        setNameError("") // Clear any validation errors
        setDescription(agentInfo.description)
        const selectedModelFromBackend = models.find((m) =>
          m.id === agentInfo.modelName
        )
        setSelectedModel(selectedModelFromBackend || null)
        setTools(agentInfo.tools || [])

        // Set prebuilt tool states based on existing tools
        const currentTools = agentInfo.tools || []
        setFileAccessEnabled(
          currentTools.some((tool) =>
            isPrebuiltTool(tool) && tool.subtype === "file_access" && tool.enabled
          ),
        )
        setWebSearchEnabled(
          currentTools.some((tool) =>
            isPrebuiltTool(tool) && tool.subtype === "brave_search" && tool.enabled
          ),
        )
        setMemoryEnabled(
          currentTools.some((tool) =>
            isPrebuiltTool(tool) && tool.subtype === "memory" && tool.enabled
          ),
        )

        // Set original state for change detection
        setOriginalState({
          name: agentInfo.name,
          description: agentInfo.description,
          modelName: agentInfo.modelName,
          tools: currentTools,
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

  const handleModelChange = (model: Model) => setSelectedModel(model)
  const handleModelSelect = (modelId: string) => {
    const model = availableModels.find((m) => m.id === modelId)
    if (model) {
      handleModelChange(model)
    }
  }

  const handleReset = async () => {
    try {
      setIsLoading(true)
      const agentInfo = await getAgentInfo()
      setName(agentInfo.name)
      setNameError("") // Clear any validation errors
      setDescription(agentInfo.description)
      const selectedModelFromBackend = availableModels.find((m) =>
        m.id === agentInfo.modelName
      )
      setSelectedModel(selectedModelFromBackend || null)
      setTools(agentInfo.tools || [])

      // Reset prebuilt tool states
      const currentTools = agentInfo.tools || []
      setFileAccessEnabled(
        currentTools.some((tool) =>
          isPrebuiltTool(tool) && tool.subtype === "file_access" && tool.enabled
        ),
      )
      setWebSearchEnabled(
        currentTools.some((tool) =>
          isPrebuiltTool(tool) && tool.subtype === "brave_search" && tool.enabled
        ),
      )
      setMemoryEnabled(
        currentTools.some((tool) =>
          isPrebuiltTool(tool) && tool.subtype === "memory" && tool.enabled
        ),
      )

      // Reset original state for change detection
      setOriginalState({
        name: agentInfo.name,
        description: agentInfo.description,
        modelName: agentInfo.modelName,
        tools: currentTools,
      })

      toast.success("Reset successful", {
        description: "Agent data has been reset to saved values.",
      })
    } catch (error) {
      console.error("Failed to fetch agent info:", error)
      toast.error("Error resetting data", {
        description: "Could not load saved agent data from server.",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const addTool = () => {
    try {
      if (!toolName || !toolType) {
        toast.error("Invalid tool", {
          description: "Tool name and type are required.",
        })
        return
      }

      let newTool: Tool

      if (toolType === "a2a") {
        if (!agentUrl) {
          toast.error("Invalid tool", {
            description: "Agent URL is required for A2A tool.",
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
        newTool = {
          name: toolName,
          enabled: toolEnabled,
          type: "a2a",
          agentUrl: agentUrl,
        }
      } else if (toolType === "mcp") {
        if (!mcpServerUrl) {
          toast.error("Invalid tool", {
            description: "Server URL is required for MCP server tool.",
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
        newTool = {
          name: toolName,
          enabled: toolEnabled,
          type: "mcp",
          serverUrl: mcpServerUrl,
        }
      } else {
        toast.error("Invalid tool type", {
          description: "Please select a valid tool type.",
        })
        return
      }

      if (editIndex !== null) {
        // Update existing tool
        const newTools = [...tools]
        newTools[editIndex] = newTool
        setTools(newTools)
        toast.success("Tool updated", {
          description: `Tool "${toolName}" has been updated.`,
        })
      } else {
        // Add new tool
        setTools([...tools, newTool])
        toast.success("Tool added", {
          description: `Tool "${toolName}" has been added.`,
        })
      }

      // Reset form
      resetToolForm()
    } catch (error) {
      console.error("Error adding tool:", error)
      toast.error("Error adding tool", {
        description: "An error occurred while adding the tool.",
      })
    }
  }

  const editTool = (index: number) => {
    const tool = tools[index]

    // Don't allow editing prebuilt tools through the dialog
    if (isPrebuiltTool(tool)) {
      toast.error("Cannot edit prebuilt tools", {
        description: "Use the toggles above to enable/disable prebuilt tools.",
      })
      return
    }

    setToolName(tool.name)
    setToolEnabled(tool.enabled)

    if (isA2ATool(tool)) {
      setToolType("a2a")
      setAgentUrl(tool.agentUrl)
      setMcpServerUrl("")
    } else if (isMCPTool(tool)) {
      setToolType("mcp")
      setMcpServerUrl(tool.serverUrl)
      setAgentUrl("")
    }

    setEditIndex(index)
    setShowToolForm(true)
  }

  const deleteTool = (index: number) => {
    const tool = tools[index]

    // Don't allow deleting prebuilt tools through the table
    if (isPrebuiltTool(tool)) {
      toast.error("Cannot delete prebuilt tools", {
        description: "Use the toggles above to enable/disable prebuilt tools.",
      })
      return
    }

    const newTools = [...tools]
    const toolName = tools[index].name
    newTools.splice(index, 1)
    setTools(newTools)
    toast.success("Tool removed", {
      description: `Tool "${toolName}" has been removed.`,
    })
  }

  const resetToolForm = () => {
    setToolName("")
    setToolType("")
    setToolEnabled(true)
    setAgentUrl("") // Reset agentUrl
    setMcpServerUrl("") // Reset MCP fields
    setEditIndex(null)
    setShowToolForm(false)
  }

  const handleAddNewToolClick = () => {
    resetToolForm() // Clears form state, sets editIndex to null, and calls setShowToolForm(false)
    setShowToolForm(true) // Opens the dialog for a new tool
  }

  // Handle prebuilt tool toggles
  const handlePrebuiltToolToggle = (subtype: "file_access" | "brave_search" | "memory", enabled: boolean) => {
    const toolConfig = {
      file_access: {
        name: "file_access",
        displayName: "File Access",
      },
      brave_search: {
        name: "brave_search",
        displayName: "Web Search",
      },
      memory: {
        name: "memory",
        displayName: "Memory",
      },
    }

    const config = toolConfig[subtype]
    if (!config) return

    let newTools = [...tools]

    if (enabled) {
      // Add the prebuilt tool if it doesn't exist
      const exists = newTools.some((tool) =>
        isPrebuiltTool(tool) && tool.subtype === subtype
      )
      if (!exists) {
        const newTool: PrebuiltTool = {
          name: config.name,
          enabled: true,
          type: "prebuilt",
          subtype: subtype,
        }
        newTools.push(newTool)
      } else {
        // Enable existing tool
        newTools = newTools.map(tool => 
          isPrebuiltTool(tool) && tool.subtype === subtype 
            ? { ...tool, enabled: true }
            : tool
        )
      }
    } else {
      // Disable the prebuilt tool
      newTools = newTools.map(tool => 
        isPrebuiltTool(tool) && tool.subtype === subtype 
          ? { ...tool, enabled: false }
          : tool
      )
    }

    setTools(newTools)

    // Update the toggle state
    if (subtype === "file_access") setFileAccessEnabled(enabled)
    else if (subtype === "brave_search") setWebSearchEnabled(enabled)
    else if (subtype === "memory") setMemoryEnabled(enabled)

    toast.success(
      enabled ? "Tool enabled" : "Tool disabled",
      {
        description: `${config.displayName} has been ${
          enabled ? "enabled" : "disabled"
        }.`,
      },
    )
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
    <Card className="shadow-md h-fit">
      <CardHeader>
        <CardTitle className="text-xl">Edit Agent</CardTitle>
        <CardDescription>
          Configure your containerized A2A protocol agent
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="agent-name">Agent Name</Label>
          <Input
            id="agent-name"
            value={name}
            onChange={(e) => {
              const value =
                (e.target as HTMLInputElement | HTMLTextAreaElement).value
              if (value.includes(" ")) {
                setNameError("Agent name cannot contain spaces")
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
        <div className="space-y-2">
          <Label htmlFor="model-select">Model</Label>
          <Select
            value={selectedModel?.id || ""}
            onValueChange={handleModelSelect}
          >
            <SelectTrigger id="model-select" className="w-full">
              <SelectValue placeholder="Select a model" />
            </SelectTrigger>
            <SelectContent>
              {(() => {
                if (!providerInfo) return null

                return providerInfo.providers.map((provider) => {
                  const isAvailable = provider.available
                  const requiredVars = provider.requiredEnvVars.join(" or ")
<<<<<<< HEAD
                  
                  return (
                    <SelectGroup key={provider.id}>
                      <SelectLabel
                        className={`${isAvailable ? "" : "text-gray-400"} flex items-center gap-1`}
                      >
                        {provider.name}
                        {!isAvailable && (
                          <div className="relative group">
                            <HelpCircle className="h-3 w-3 text-gray-400 cursor-help" />
                            <div className="absolute left-0 top-full mt-1 px-2 py-1 text-xs bg-gray-800 text-white rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50">
                              Required: {requiredVars}
                            </div>
                          </div>
                        )}
                      </SelectLabel>
                      {provider.models.map((model) => (
                        <SelectItem
                          key={model.id}
                          value={model.id}
                          disabled={!isAvailable}
                          className={!isAvailable ? "text-gray-400" : ""}
                          title={!isAvailable 
                            ? `Set ${requiredVars} environment variable to enable this provider`
                            : model.description || ""
                          }
||||||| 7aef63e
              {availableModels.map((model) => (
                <SelectItem key={model.id} value={model.id}>
                  {model.name}
                </SelectItem>
              ))}
=======

                  return (
                    <SelectGroup key={provider.id}>
                      <SelectLabel
                        className={`${
                          isAvailable ? "" : "text-gray-400"
                        } flex items-center gap-1`}
                      >
                        {provider.name}
                        {!isAvailable && (
                          <div className="relative group">
                            <HelpCircle className="h-3 w-3 text-gray-400 cursor-help" />
                            <div className="absolute left-0 top-full mt-1 px-2 py-1 text-xs bg-gray-800 text-white rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50">
                              Required: {requiredVars}
                            </div>
                          </div>
                        )}
                      </SelectLabel>
                      {provider.models.map((model) => (
                        <SelectItem
                          key={model.id}
                          value={model.id}
                          disabled={!isAvailable}
                          className={!isAvailable ? "text-gray-400" : ""}
                          title={!isAvailable
                            ? `Set ${requiredVars} environment variable to enable this provider`
                            : model.description || ""}
>>>>>>> main
                        >
                          <div className="flex items-center justify-between w-full">
                            <span>{model.name}</span>
                            {!isAvailable && (
                              <span className="text-xs text-gray-400 ml-2">
                                Missing API key
                              </span>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )
                })
              })()}
            </SelectContent>
          </Select>
        </div>

        {/* Tools Section */}
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <Label>Tools</Label>
          </div>

          {/* Prebuilt Tools Toggles */}
          <div className="space-y-3 p-4 bg-muted/50 rounded-lg">
            <Label className="text-sm font-medium">Prebuilt Tools</Label>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm">File Access</Label>
                  <p className="text-xs text-muted-foreground">
                    Allows the agent to read and write files
                  </p>
                </div>
                <Switch
                  checked={fileAccessEnabled}
                  onCheckedChange={(checked) =>
                    handlePrebuiltToolToggle("file_access", checked)}
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm">Web Search</Label>
                  <p className="text-xs text-muted-foreground">
                    Enables web search capabilities using Brave Search
                  </p>
                </div>
                <Switch
                  checked={webSearchEnabled}
                  onCheckedChange={(checked) =>
                    handlePrebuiltToolToggle("brave_search", checked)}
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm">Memory</Label>
                  <p className="text-xs text-muted-foreground">
                    Enables persistent memory storage for the agent
                  </p>
                </div>
                <Switch
                  checked={memoryEnabled}
                  onCheckedChange={(checked) =>
                    handlePrebuiltToolToggle("memory", checked)}
                />
              </div>
            </div>
          </div>

          <ToolDialog
            open={showToolForm}
            onOpenChange={(open) => {
              setShowToolForm(open)
              if (!open) resetToolForm()
            }}
            toolName={toolName}
            setToolName={setToolName}
            toolType={toolType}
            setToolType={setToolType}
            toolEnabled={toolEnabled}
            setToolEnabled={setToolEnabled}
            agentUrl={agentUrl}
            setAgentUrl={setAgentUrl}
            mcpServerUrl={mcpServerUrl}
            setMcpServerUrl={setMcpServerUrl}
            editIndex={editIndex}
            onSubmit={addTool}
            onCancel={() => setShowToolForm(false)}
          />

          {/* Custom Tools Table */}
          {tools.filter((tool) => !isPrebuiltTool(tool)).length > 0
            ? (
              <div className="space-y-2">
                <Label className="text-sm font-medium">Custom Tools</Label>
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
                    {tools.filter((tool) => !isPrebuiltTool(tool)).map(
                      (tool, _originalIndex) => {
                        const actualIndex = tools.findIndex((t) => t === tool)
                        return (
                          <TableRow key={actualIndex}>
                            <TableCell>{tool.name}</TableCell>
                            <TableCell>
                              {isA2ATool(tool)
                                ? "Agent (A2A)"
                                : isMCPTool(tool)
                                ? "MCP Server"
                                : tool.type}
                            </TableCell>
                            <TableCell>
                              <span className={`px-2 py-1 rounded-full text-xs ${
                                tool.enabled 
                                  ? "bg-green-100 text-green-800" 
                                  : "bg-gray-100 text-gray-600"
                              }`}>
                                {tool.enabled ? "Enabled" : "Disabled"}
                              </span>
                            </TableCell>
                            <TableCell className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => editTool(actualIndex)}
                                title="Edit tool"
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => deleteTool(actualIndex)}
                                title="Remove tool"
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
                <Label className="text-sm font-medium">Custom Tools</Label>
                <div className="text-center p-4 text-muted-foreground border border-dashed rounded-md">
                  No custom tools configured. Add custom tools like Agent (A2A)
                  connections and remote MCP servers.
                </div>
              </div>
            )}

          {/* Add Custom Tool Button */}
          <div className="flex justify-end">
            <Button size="sm" variant="outline" onClick={handleAddNewToolClick}>
              <Plus className="mr-2 h-4 w-4" />
              Add Custom Tool
            </Button>
          </div>
        </div>
      </CardContent>
      <Separator />
      <CardFooter className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={handleReset}>Reset</Button>
        <Button
          onClick={handleSave}
          size="sm"
          disabled={isSaving || !!nameError || !hasChanges()}
        >
          {isSaving
            ? (
              <>
                <Loader2 className="animate-spin mr-2" />Saving...
              </>
            )
            : (
              <>
                <Save className="mr-2" />Save Agent
              </>
            )}
        </Button>
      </CardFooter>

      {/* No Models Available Modal */}
      <Dialog open={showNoModelsModal} onOpenChange={setShowNoModelsModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HelpCircle className="h-5 w-5 text-orange-500" />
              No AI Models Available
            </DialogTitle>
            <DialogDescription>
<<<<<<< HEAD
              To use this agent, you need to configure at least one AI provider by setting the appropriate environment variables.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="text-sm">
              <p className="font-medium mb-3">Available Providers:</p>
              {providerInfo?.providers.map((provider) => (
                <div key={provider.id} className="mb-3 p-3 border rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-medium">{provider.name}</span>
                    {provider.available ? (
                      <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                        ✓ Available
                      </span>
                    ) : (
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
                        Not Configured
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-600">
                    <p className="mb-1">{provider.models.length} models available</p>
                    <p>
                      <strong>Required:</strong> Set one of these environment variables:
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
              <p className="font-medium text-blue-900 mb-2">💡 Quick Setup:</p>
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
||||||| 7aef63e
=======
              To use this agent, you need to configure at least one AI provider
              by setting the appropriate environment variables.
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
              <p className="font-medium text-blue-900 mb-2">💡 Quick Setup:</p>
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
>>>>>>> main
              onClick={() => setShowNoModelsModal(false)}
            >
              Got it
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
