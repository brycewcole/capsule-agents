"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Save, Eye } from "lucide-react"
import AgentCardDialog from "./agent-card-dialog"
import ModelSelector from "./model-selector"

export type ModelConfig = {
  id: string
  name: string
  apiKey: string
}

export default function AgentCustomization() {
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
      <CardHeader className="pb-4">
        <CardTitle className="text-2xl font-bold">CapyAgents</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
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

        <ModelSelector
          selectedModel={selectedModel}
          onModelChange={handleModelChange}
          onApiKeyChange={handleApiKeyChange}
        />

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button onClick={handleSave} className="flex-1">
            <Save className="mr-2 h-4 w-4" />
            Save Agent
          </Button>

          <AgentCardDialog name={name} description={description} model={selectedModel}>
            <Button variant="outline" className="flex-1">
              <Eye className="mr-2 h-4 w-4" />
              View Agent Card
            </Button>
          </AgentCardDialog>
        </div>
      </CardContent>
    </Card>
  )
}
