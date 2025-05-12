"use client"

import { useState, useEffect } from "react"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Save, Loader2, Edit, Trash } from "lucide-react"
import { Separator } from "@/components/ui/separator"
import { toast } from "sonner"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { getAgentInfo, getAvailableModels, updateAgentInfo, type AgentInfo, type Tool } from "@/lib/api"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ToolDialog } from "./tool-dialog"

export type Model = {
  model_name: string      // maps to model_name from backend
  displayName: string    // maps to display_name from backend
}

export default function AgentEditor() {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [selectedModel, setSelectedModel] = useState<Model | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [availableModels, setAvailableModels] = useState<{id: string; name: string}[]>([])
  const [tools, setTools] = useState<Tool[]>([])
  const [showToolForm, setShowToolForm] = useState(false)
  const [editIndex, setEditIndex] = useState<number | null>(null)
  
  // New state for tool form
  const [toolName, setToolName] = useState("")
  const [toolType, setToolType] = useState("")
  const [toolSchema, setToolSchema] = useState("")

  const handleSave = async () => {
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
        setDescription(agentInfo.description)
        setSelectedModel({ 
          model_name: agentInfo.modelName, 
          displayName: agentInfo.modelName
        })
        setTools(agentInfo.tools || [])
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
      setDescription(agentInfo.description)
      setSelectedModel({ 
        model_name: agentInfo.modelName, 
        displayName: agentInfo.modelName
      })
      setTools(agentInfo.tools || [])
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

      // Try to parse the schema as JSON
      let parsedSchema = {}
      try {
        parsedSchema = JSON.parse(toolSchema || '{}')
      } catch (error) {
        toast.error("Invalid schema", { description: "The tool schema must be valid JSON." })
        return
      }

      const newTool: Tool = {
        name: toolName,
        type: toolType,
        tool_schema: parsedSchema
      }

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
    const tool = tools[index]
    setToolName(tool.name)
    setToolType(tool.type)
    setToolSchema(JSON.stringify(tool.tool_schema, null, 2))
    setEditIndex(index)
    setShowToolForm(true)
  }

  const deleteTool = (index: number) => {
    const newTools = [...tools]
    const toolName = tools[index].name
    newTools.splice(index, 1)
    setTools(newTools)
    toast.success("Tool removed", { description: `Tool "${toolName}" has been removed.` })
  }

  const resetToolForm = () => {
    setToolName("")
    setToolType("")
    setToolSchema("")
    setEditIndex(null)
    setShowToolForm(false)
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
    <Card className="shadow-md">
      <CardHeader>
        <CardTitle className="text-xl">Edit Agent</CardTitle>
        <CardDescription>Configure your containerized A2A protocol agent</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="agent-name">Agent Name</Label>
          <Input id="agent-name" value={name} onChange={e => setName(e.target.value)} />
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
              editIndex={editIndex}
              onSubmit={addTool}
              onCancel={() => setShowToolForm(false)}
            />
          </div>

          {/* Tools Table */}
          {tools.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="w-20">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tools.map((tool, index) => (
                  <TableRow key={index}>
                    <TableCell>{tool.name}</TableCell>
                    <TableCell>{tool.type}</TableCell>
                    <TableCell className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => editTool(index)} title="Edit tool">
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => deleteTool(index)} title="Remove tool">
                        <Trash className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center p-4 text-gray-500 border border-dashed rounded-md">
              No tools configured. Tools can enhance your agent's capabilities.
            </div>
          )}
        </div>
      </CardContent>
      <Separator />
      <CardFooter className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={handleReset}>Reset</Button>
        <Button onClick={handleSave} size="sm" disabled={isSaving}>
          {isSaving ? <><Loader2 className="animate-spin mr-2" />Saving...</> : <><Save className="mr-2" />Save Agent</>}
        </Button>
      </CardFooter>
    </Card>
  )
}
