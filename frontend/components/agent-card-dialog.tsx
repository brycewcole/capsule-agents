"use client"

import type { ReactNode } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { ModelConfig } from "./agent-customization"

interface AgentCardDialogProps {
  children: ReactNode
  name: string
  description: string
  model: ModelConfig
}

export default function AgentCardDialog({ children, name, description, model }: AgentCardDialogProps) {
  // Generate a timestamp for the "created at" field
  const createdAt = new Date().toLocaleString()

  // Generate a random ID for demo purposes
  const agentId = `agent_${Math.random().toString(36).substring(2, 10)}`

  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Agent Card</DialogTitle>
          <DialogDescription>Full metadata for your agent configuration.</DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <Card>
            <CardHeader className="bg-muted/50 pb-2">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">{name || "Unnamed Agent"}</h3>
                <Badge variant="outline">A2A Protocol</Badge>
              </div>
            </CardHeader>

            <CardContent className="pt-4">
              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Description</h4>
                  <p className="mt-1">{description || "No description provided."}</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground">Agent ID</h4>
                    <p className="mt-1 text-sm font-mono">{agentId}</p>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground">Created</h4>
                    <p className="mt-1 text-sm">{createdAt}</p>
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Model</h4>
                  <div className="mt-1 flex items-center gap-2">
                    <Badge>{model.name}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {model.apiKey ? "API Key Set ✓" : "No API Key"}
                    </span>
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Capabilities</h4>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <Badge variant="secondary">Text Generation</Badge>
                    <Badge variant="secondary">Q&A</Badge>
                    <Badge variant="secondary">Containerized</Badge>
                  </div>
                </div>
              </div>
            </CardContent>

            <CardFooter className="border-t bg-muted/20 text-xs text-muted-foreground">
              Powered by Capy Agents Framework
            </CardFooter>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  )
}
