"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Save, Eye, Sparkles } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Separator } from "@/components/ui/separator"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import AgentCardDialog from "./agent-card-dialog"
import ModelSelector from "./model-selector"

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

  const handleModelChange = (model: ModelConfig) => {
    setSelectedModel(model)
  }

  const handleApiKeyChange = (apiKey: string) => {
    setSelectedModel({
      ...selectedModel,
      apiKey,
    })
  }

  const handleSave = () => {
    // In a real app, this would save the agent configuration
    console.log("Saving agent:", {
      name,
      description,
      model: selectedModel.id,
      // Don't log the actual API key in production
      hasApiKey: !!selectedModel.apiKey,
    })
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
              <Button variant="outline" size="sm">
                Reset
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Reset all fields to default</p>
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
          <Button onClick={handleSave} size="sm">
            <Save className="mr-2 h-4 w-4" />
            Save Agent
          </Button>
        </div>
      </CardFooter>
    </Card>
  )
}
