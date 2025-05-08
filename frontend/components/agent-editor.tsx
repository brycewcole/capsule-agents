"use client"

import { useState, useEffect } from "react"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Save, Loader2 } from "lucide-react"
import { Separator } from "@/components/ui/separator"
import { toast } from "@/components/ui/use-toast"
import { getAgentInfo, updateAgentInfo, AgentInfo, getAvailableModels } from "@/lib/api/agent-api"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

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

  const handleSave = async () => {
    setIsSaving(true)
    const startTime = Date.now()
    try {
      const agentInfo: AgentInfo = {
        name,
        description,
        modelName: selectedModel?.model_name || "",
        modelParameters: {}
      }
      await updateAgentInfo(agentInfo)
      toast({ title: "Agent saved", description: "Agent configuration has been updated successfully." })
    } catch (error) {
      console.error("Error saving agent:", error)
      toast({ title: "Error saving agent", description: "Failed to save agent configuration.", variant: "destructive" })
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
      } catch (error) {
        console.error("Failed to fetch data:", error)
        toast({
          title: "Error fetching data",
          description: "Could not load agent or model data from server.",
          variant: "destructive",
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
      toast({
        title: "Reset successful",
        description: "Agent data has been reset to saved values.",
      })
    } catch (error) {
      console.error("Failed to fetch agent info:", error)
      toast({
        title: "Error resetting data",
        description: "Could not load saved agent data from server.",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
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
