"use client"

import { useState, useEffect } from "react"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Save, Loader2, Edit, Trash, Plus } from "lucide-react"
import { Separator } from "@/components/ui/separator"
import { toast } from "sonner"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { getAgentInfo, getAvailableModels, updateAgentInfo, type AgentInfo, type Tool } from "@/lib/api"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ToolDialog } from "./tool-dialog"

export type Model = {
  model_name: string      // maps to model_name from backend
  displayName: string    // maps to display_name from backend
}

export default function AgentEditor() {
  const [name, setName] = useState("")
  const [nameError, setNameError] = useState("")
  const [description, setDescription] = useState("")
  const [selectedModel, setSelectedModel] = useState<Model | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [availableModels, setAvailableModels] = useState<{id: string; name: string}[]>([])
  const [tools, setTools] = useState<Tool[]>([])
  const [showToolForm, setShowToolForm] = useState(false)
  const [editIndex, setEditIndex] = useState<number | null>(null)
  
  // State to track original values for change detection
  const [originalState, setOriginalState] = useState<{
    name: string;
    description: string;
    modelName: string;
    tools: Tool[];
  } | null>(null)
  
  // New state for tool form
  const [toolName, setToolName] = useState("")
  const [toolType, setToolType] = useState("")
  const [toolSchema, setToolSchema] = useState("")
  const [agentUrl, setAgentUrl] = useState("") // New state for a2a_call agent URL
  
  // MCP Server state
  const [mcpServerUrl, setMcpServerUrl] = useState("")
  
  // Prebuilt tools state
  const [fileAccessEnabled, setFileAccessEnabled] = useState(false)
  const [webSearchEnabled, setWebSearchEnabled] = useState(false)
  const [memoryEnabled, setMemoryEnabled] = useState(false)

  // Function to check if there are any changes
  const hasChanges = (): boolean => {
    if (!originalState) return false;
    
    return (
      name !== originalState.name ||
      description !== originalState.description ||
      selectedModel?.model_name !== originalState.modelName ||
      JSON.stringify(tools) !== JSON.stringify(originalState.tools)
    );
  };

  const handleSave = async () => {
    // Validate agent name before saving
    if (nameError) {
      toast.error("Invalid agent name", { description: "Please fix the agent name before saving." })
      return
    }
    
    setIsSaving(true)
    const startTime = Date.now()
    try {
      const agentInfo: AgentInfo = {
        name,
        description,
        modelName: selectedModel?.model_name || "",
        modelParameters: {},
        tools: tools
      }
      await updateAgentInfo(agentInfo)
      
      // Update original state after successful save
      setOriginalState({
        name,
        description,
        modelName: selectedModel?.model_name || "",
        tools: [...tools]
      })
      
      toast.success("Agent saved", { description: "Agent configuration has been updated successfully." })
    } catch (error) {
      console.error("Error saving agent:", error)
      toast.error("Error saving agent", { description: "Failed to save agent configuration." })
    } finally {
      const elapsed = Date.now() - startTime
      if (elapsed < 500) await new Promise(res => setTimeout(res, 500 - elapsed))
      setIsSaving(false)
    }
  }

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true)
        // Fetch models and agent info in parallel
        const [models, agentInfo] = await Promise.all([
          getAvailableModels(),
          getAgentInfo()
        ]);
        setAvailableModels(models.map(model => ({ id: model.model_name, name: model.display_name })));
        setName(agentInfo.name)
        setNameError("") // Clear any validation errors
        setDescription(agentInfo.description)
        setSelectedModel({ 
          model_name: agentInfo.modelName, 
          displayName: agentInfo.modelName
        })
        setTools(agentInfo.tools || [])
        
        // Set prebuilt tool states based on existing tools
        const currentTools = agentInfo.tools || []
        setFileAccessEnabled(currentTools.some(tool => tool.type === "prebuilt" && tool.tool_schema?.type === "file_access"))
        setWebSearchEnabled(currentTools.some(tool => tool.type === "prebuilt" && tool.tool_schema?.type === "brave_search"))
        setMemoryEnabled(currentTools.some(tool => tool.type === "prebuilt" && tool.tool_schema?.type === "memory"))
        
        // Set original state for change detection
        setOriginalState({
          name: agentInfo.name,
          description: agentInfo.description,
          modelName: agentInfo.modelName,
          tools: currentTools
        })
      } catch (error) {
        console.error("Failed to fetch data:", error)
        toast.error("Error fetching data", { description: "Could not load agent or model data from server." })
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
      handleModelChange({ model_name: model.id, displayName: model.name })
    }
  }

  const handleReset = async () => {
    try {
      setIsLoading(true)
      const agentInfo = await getAgentInfo()
      setName(agentInfo.name)
      setNameError("") // Clear any validation errors
      setDescription(agentInfo.description)
      setSelectedModel({ 
        model_name: agentInfo.modelName, 
        displayName: agentInfo.modelName
      })
      setTools(agentInfo.tools || [])
      
      // Reset prebuilt tool states
      const currentTools = agentInfo.tools || []
      setFileAccessEnabled(currentTools.some(tool => tool.type === "prebuilt" && tool.tool_schema?.type === "file_access"))
      setWebSearchEnabled(currentTools.some(tool => tool.type === "prebuilt" && tool.tool_schema?.type === "brave_search"))
      setMemoryEnabled(currentTools.some(tool => tool.type === "prebuilt" && tool.tool_schema?.type === "memory"))
      
      // Reset original state for change detection
      setOriginalState({
        name: agentInfo.name,
        description: agentInfo.description,
        modelName: agentInfo.modelName,
        tools: currentTools
      })
      
      toast.success("Reset successful", { description: "Agent data has been reset to saved values." })
    } catch (error) {
      console.error("Failed to fetch agent info:", error)
      toast.error("Error resetting data", { description: "Could not load saved agent data from server." })
    } finally {
      setIsLoading(false)
    }
  }

  const addTool = () => {
    try {
      if (!toolName || !toolType) {
        toast.error("Invalid tool", { description: "Tool name and type are required." })
        return
      }

      let toolDataSchema: Record<string, any> = {};

      if (toolType === "a2a_call") {
        if (!agentUrl) {
          toast.error("Invalid tool", { description: "Agent URL is required for a2a_call tool." });
          return;
        }
        try {
          // Validate URL (basic validation)
          new URL(agentUrl);
        } catch (_) {
          toast.error("Invalid URL", { description: "Please enter a valid Agent URL." });
          return;
        }
        toolDataSchema = { agent_url: agentUrl };
      } else if (toolType === "mcp_server") {
        if (!mcpServerUrl) {
          toast.error("Invalid tool", { description: "Server URL is required for MCP server tool." });
          return;
        }
        try {
          // Validate URL (basic validation)
          new URL(mcpServerUrl);
        } catch (_) {
          toast.error("Invalid URL", { description: "Please enter a valid MCP server URL." });
          return;
        }
        toolDataSchema = { 
          server_url: mcpServerUrl
        };
      } else {
        // Try to parse the schema as JSON for other tool types
        try {
          toolDataSchema = JSON.parse(toolSchema || '{}');
        } catch (error) {
          toast.error("Invalid schema", { description: "The tool schema must be valid JSON." });
          return;
        }
      }

      const newTool: Tool = {
        name: toolName,
        type: toolType,
        tool_schema: toolDataSchema,
      };

      if (editIndex !== null) {
        // Update existing tool
        const newTools = [...tools]
        newTools[editIndex] = newTool
        setTools(newTools)
        toast.success("Tool updated", { description: `Tool "${toolName}" has been updated.` })
      } else {
        // Add new tool
        setTools([...tools, newTool])
        toast.success("Tool added", { description: `Tool "${toolName}" has been added.` })
      }

      // Reset form
      resetToolForm()
    } catch (error) {
      console.error("Error adding tool:", error)
      toast.error("Error adding tool", { description: "An error occurred while adding the tool." })
    }
  }

  const editTool = (index: number) => {
    const tool = tools[index];
    
    // Don't allow editing prebuilt tools through the dialog
    if (tool.type === "prebuilt") {
      toast.error("Cannot edit prebuilt tools", { description: "Use the toggles above to enable/disable prebuilt tools." })
      return;
    }
    
    setToolName(tool.name);
    
    if (tool.type === "a2a_call" && tool.tool_schema && typeof tool.tool_schema.agent_url === 'string') {
      setToolType(tool.type);
      setAgentUrl(tool.tool_schema.agent_url);
    } else if (tool.type === "mcp_server" && tool.tool_schema) {
      setToolType(tool.type);
      setMcpServerUrl(tool.tool_schema.server_url || "");
    } else {
      setToolType(tool.type);
      setToolSchema(JSON.stringify(tool.tool_schema || {}, null, 2));
      setAgentUrl("");
    }
    
    setEditIndex(index);
    setShowToolForm(true);
  };

  const deleteTool = (index: number) => {
    const tool = tools[index]
    
    // Don't allow deleting prebuilt tools through the table
    if (tool.type === "prebuilt") {
      toast.error("Cannot delete prebuilt tools", { description: "Use the toggles above to enable/disable prebuilt tools." })
      return;
    }
    
    const newTools = [...tools]
    const toolName = tools[index].name
    newTools.splice(index, 1)
    setTools(newTools)
    toast.success("Tool removed", { description: `Tool "${toolName}" has been removed.` })
  }

  const resetToolForm = () => {
    setToolName("");
    setToolType("");
    setToolSchema("");
    setAgentUrl(""); // Reset agentUrl
    // Reset MCP fields
    setMcpServerUrl("");
    setEditIndex(null);
    setShowToolForm(false);
  };

  const handleAddNewToolClick = () => {
    resetToolForm(); // Clears form state, sets editIndex to null, and calls setShowToolForm(false)
    setShowToolForm(true); // Opens the dialog for a new tool
  };
  
  // Handle prebuilt tool toggles
  const handlePrebuiltToolToggle = (toolType: string, enabled: boolean) => {
    const toolConfig = {
      file_access: { name: "file_access", displayName: "File Access", tool_schema: { type: "file_access" } },
      brave_search: { name: "brave_search", displayName: "Web Search", tool_schema: { type: "brave_search" } },
      memory: { name: "memory", displayName: "Memory", tool_schema: { type: "memory" } }
    };
    
    const config = toolConfig[toolType as keyof typeof toolConfig];
    if (!config) return;
    
    let newTools = [...tools];
    
    if (enabled) {
      // Add the prebuilt tool if it doesn't exist
      const exists = newTools.some(tool => tool.type === "prebuilt" && tool.tool_schema?.type === toolType);
      if (!exists) {
        newTools.push({
          name: config.name,
          type: "prebuilt",
          tool_schema: config.tool_schema
        });
      }
    } else {
      // Remove the prebuilt tool
      newTools = newTools.filter(tool => !(tool.type === "prebuilt" && tool.tool_schema?.type === toolType));
    }
    
    setTools(newTools);
    
    // Update the toggle state
    if (toolType === "file_access") setFileAccessEnabled(enabled);
    else if (toolType === "brave_search") setWebSearchEnabled(enabled);
    else if (toolType === "memory") setMemoryEnabled(enabled);
    
    toast.success(
      enabled ? "Tool enabled" : "Tool disabled", 
      { description: `${config.displayName} has been ${enabled ? "enabled" : "disabled"}.` }
    );
  };

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
    <Card className="shadow-md">
      <CardHeader>
        <CardTitle className="text-xl">Edit Agent</CardTitle>
        <CardDescription>Configure your containerized A2A protocol agent</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="agent-name">Agent Name</Label>
          <Input 
            id="agent-name" 
            value={name} 
            onChange={e => {
              const value = e.target.value
              if (value.includes(' ')) {
                setNameError("Agent name cannot contain spaces")
              } else {
                setNameError("")
              }
              setName(value)
            }}
            className={nameError ? "border-red-500" : ""}
          />
          {nameError && (
            <p className="text-sm text-red-600">{nameError}</p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="agent-description">Description</Label>
          <Textarea id="agent-description" value={description} onChange={e => setDescription(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="model-select">Model</Label>
          <Select value={selectedModel?.model_name || ""} onValueChange={handleModelSelect}>
            <SelectTrigger id="model-select" className="w-full">
              <SelectValue placeholder="Select a model" />
            </SelectTrigger>
            <SelectContent>
              {availableModels.map((model) => (
                <SelectItem key={model.id} value={model.id}>
                  {model.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Tools Section */}
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <Label>Tools</Label>
            <Button size="sm" variant="outline" onClick={handleAddNewToolClick}>
              <Plus className="mr-2 h-4 w-4" />
              Add Custom Tool
            </Button>
          </div>
          
          {/* Prebuilt Tools Toggles */}
          <div className="space-y-3 p-4 bg-muted/50 rounded-lg">
            <Label className="text-sm font-medium">Prebuilt Tools</Label>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm">File Access</Label>
                  <p className="text-xs text-muted-foreground">Allows the agent to read and write files</p>
                </div>
                <Switch 
                  checked={fileAccessEnabled} 
                  onCheckedChange={(checked) => handlePrebuiltToolToggle("file_access", checked)}
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm">Web Search</Label>
                  <p className="text-xs text-muted-foreground">Enables web search capabilities using Brave Search</p>
                </div>
                <Switch 
                  checked={webSearchEnabled} 
                  onCheckedChange={(checked) => handlePrebuiltToolToggle("brave_search", checked)}
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm">Memory</Label>
                  <p className="text-xs text-muted-foreground">Enables persistent memory storage for the agent</p>
                </div>
                <Switch 
                  checked={memoryEnabled} 
                  onCheckedChange={(checked) => handlePrebuiltToolToggle("memory", checked)}
                />
              </div>
            </div>
          </div>

          <ToolDialog
            open={showToolForm}
            onOpenChange={(open) => {
              setShowToolForm(open);
              if (!open) resetToolForm();
            }}
            toolName={toolName}
            setToolName={setToolName}
            toolType={toolType}
            setToolType={setToolType}
            toolSchema={toolSchema}
            setToolSchema={setToolSchema}
            agentUrl={agentUrl}
            setAgentUrl={setAgentUrl}
            mcpServerUrl={mcpServerUrl}
            setMcpServerUrl={setMcpServerUrl}
            editIndex={editIndex}
            onSubmit={addTool}
            onCancel={() => setShowToolForm(false)}
          />

          {/* Custom Tools Table */}
          {tools.filter(tool => tool.type !== "prebuilt").length > 0 ? (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Custom Tools</Label>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="w-20">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tools.filter(tool => tool.type !== "prebuilt").map((tool, _originalIndex) => {
                    const actualIndex = tools.findIndex(t => t === tool);
                    return (
                      <TableRow key={actualIndex}>
                        <TableCell>{tool.name}</TableCell>
                        <TableCell>
                          {tool.type === "a2a_call" ? "Agent (A2A)" : 
                           tool.type === "mcp_server" ? "MCP Server" : tool.type}
                        </TableCell>
                        <TableCell className="flex gap-1">
                          <Button variant="ghost" size="sm" onClick={() => editTool(actualIndex)} title="Edit tool">
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => deleteTool(actualIndex)} title="Remove tool">
                            <Trash className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Custom Tools</Label>
              <div className="text-center p-4 text-muted-foreground border border-dashed rounded-md">
                No custom tools configured. Add custom tools like Agent (A2A) connections and remote MCP servers.
              </div>
            </div>
          )}
        </div>
      </CardContent>
      <Separator />
      <CardFooter className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={handleReset}>Reset</Button>
        <Button onClick={handleSave} size="sm" disabled={isSaving || !!nameError || !hasChanges()}>
          {isSaving ? <><Loader2 className="animate-spin mr-2" />Saving...</> : <><Save className="mr-2" />Save Agent</>}
        </Button>
      </CardFooter>
    </Card>
  )
}
