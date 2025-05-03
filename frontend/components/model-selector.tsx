"use client"

import { useState } from "react"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Eye, EyeOff } from "lucide-react"
import type { ModelConfig } from "./agent-customization"

// Available models
const MODELS = [
  { id: "gpt-4", name: "GPT-4" },
  { id: "gpt-3.5-turbo", name: "GPT-3.5 Turbo" },
  { id: "claude-3-opus", name: "Claude 3 Opus" },
  { id: "claude-3-sonnet", name: "Claude 3 Sonnet" },
  { id: "llama-3", name: "Llama 3" },
  { id: "mistral-large", name: "Mistral Large" },
]

interface ModelSelectorProps {
  selectedModel: ModelConfig
  onModelChange: (model: ModelConfig) => void
  onApiKeyChange: (apiKey: string) => void
}

export default function ModelSelector({ selectedModel, onModelChange, onApiKeyChange }: ModelSelectorProps) {
  const [showApiKey, setShowApiKey] = useState(false)

  const handleModelSelect = (modelId: string) => {
    const model = MODELS.find((m) => m.id === modelId)
    if (model) {
      onModelChange({
        id: model.id,
        name: model.name,
        apiKey: selectedModel.id === model.id ? selectedModel.apiKey : "",
      })
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="model-select">Model</Label>
        <Select value={selectedModel.id} onValueChange={handleModelSelect}>
          <SelectTrigger id="model-select" className="w-full">
            <SelectValue placeholder="Select a model" />
          </SelectTrigger>
          <SelectContent>
            {MODELS.map((model) => (
              <SelectItem key={model.id} value={model.id}>
                {model.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="api-key">API Key</Label>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2"
            onClick={() => setShowApiKey(!showApiKey)}
            type="button"
          >
            {showApiKey ? (
              <>
                <EyeOff className="h-4 w-4 mr-1" />
                <span className="text-xs">Hide</span>
              </>
            ) : (
              <>
                <Eye className="h-4 w-4 mr-1" />
                <span className="text-xs">Show</span>
              </>
            )}
          </Button>
        </div>
        <Input
          id="api-key"
          type={showApiKey ? "text" : "password"}
          placeholder={`Enter ${selectedModel.name} API key`}
          value={selectedModel.apiKey}
          onChange={(e) => onApiKeyChange(e.target.value)}
          className="font-mono text-sm"
        />
        <p className="text-xs text-muted-foreground">Your API key is stored locally and never shared.</p>
      </div>
    </div>
  )
}
