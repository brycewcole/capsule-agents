"use client"

import { useState, useEffect } from "react"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Save, Eye, Sparkles, Loader2 } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Separator } from "@/components/ui/separator"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { toast } from "@/components/ui/use-toast"
import AgentCardDialog from "./agent-card-dialog"
import ModelSelector from "./model-selector"
import { getAgentInfo, updateAgentInfo, AgentInfo } from "@/lib/api/agent-api"

export type ModelConfig = {
  id: string
  name: string
  apiKey: string
}

export default function AgentEditor() {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [selectedModel, setSelectedModel] = useState<ModelConfig>({
    id: "gpt-4",
    name: "GPT-4",
    apiKey: "",
  })
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  // Fetch agent info when component mounts
  useEffect(() => {
    const fetchAgentInfo = async () => {
      try {
        setIsLoading(true)
        const agentInfo = await getAgentInfo()
        setName(agentInfo.name)
        setDescription(agentInfo.description)
      } catch (error) {
        console.error("Failed to fetch agent info:", error)
        toast({
          title: "Error fetching agent information",
          description: "Could not load agent data from server.",
          variant: "destructive",
        })
      } finally {
        setIsLoading(false)
      }
    }

    fetchAgentInfo()
  }, [])

  const handleModelChange = (model: ModelConfig) => {
    setSelectedModel(model)
  }

  const handleApiKeyChange = (apiKey: string) => {
    setSelectedModel({
      ...selectedModel,
      apiKey,
    })
  }

  const handleReset = () => {
    // Reset to the last fetched values by re-fetching
    const fetchAgentInfo = async () => {
      try {
        setIsLoading(true)
        const agentInfo = await getAgentInfo()
        setName(agentInfo.name)
        setDescription(agentInfo.description)
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

    fetchAgentInfo()
  }

  const handleSave = async () => {
    // Save the agent configuration
    setIsSaving(true)
    const startTime = Date.now()
    try {
      const agentInfo: AgentInfo = { name, description }
      await updateAgentInfo(agentInfo)
      console.log("Model info (not saved to backend yet):", {
        model: selectedModel.id,
        hasApiKey: !!selectedModel.apiKey,
      })
      toast({
        title: "Agent saved",
        description: "Agent configuration has been updated successfully.",
      })
    } catch (error) {
      console.error("Error saving agent:", error)
      toast({
        title: "Error saving agent",
        description: "Failed to save agent configuration.",
        variant: "destructive",
      })
    } finally {
      // Ensure spinner shows for at least 500ms
      const elapsed = Date.now() - startTime
      const minDuration = 500
      if (elapsed < minDuration) {
        await new Promise(res => setTimeout(res, minDuration - elapsed))
      }
      setIsSaving(false)
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
        <CardTitle className="flex items-center gap-2 text-xl">
          <Sparkles className="h-5 w-5 text-primary" />
          Edit Agent
        </CardTitle>
        <CardDescription>Configure your containerized A2A protocol agent</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="basic" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="basic">Basic Info</TabsTrigger>
            <TabsTrigger value="model">Model & API</TabsTrigger>
          </TabsList>
          <TabsContent value="basic" className="space-y-6 pt-4">
            <div className="space-y-2">
              <Label htmlFor="agent-name">Agent Name</Label>
              <Input
                id="agent-name"
                placeholder="Enter agent name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="rounded-md"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="agent-description">Description</Label>
              <Textarea
                id="agent-description"
                placeholder="Describe what your agent does..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="min-h-[120px] rounded-md"
              />
            </div>
          </TabsContent>
          <TabsContent value="model" className="space-y-6 pt-4">
            <ModelSelector
              selectedModel={selectedModel}
              onModelChange={handleModelChange}
              onApiKeyChange={handleApiKeyChange}
            />
          </TabsContent>
        </Tabs>
      </CardContent>
      <Separator />
      <CardFooter className="flex justify-between p-4">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="sm" onClick={handleReset}>
                Reset
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Reset all fields to saved values</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <div className="flex gap-2">
          <AgentCardDialog name={name} description={description} model={selectedModel}>
            <Button variant="outline" size="sm">
              <Eye className="mr-2 h-4 w-4" />
              Preview
            </Button>
          </AgentCardDialog>
          <Button 
            onClick={handleSave} 
            size="sm" 
            disabled={isSaving}
          >
            {isSaving ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</>
            ) : (
              <><Save className="mr-2 h-4 w-4" />Save Agent</>
            )}
          </Button>
        </div>
      </CardFooter>
    </Card>
  )
}
