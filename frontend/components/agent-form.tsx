"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

export default function AgentForm() {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">CapyAgents</h1>
      <div className="space-y-4">
        <div>
          <Input
            placeholder="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-md border border-gray-300"
          />
        </div>
        <div>
          <Textarea
            placeholder="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="min-h-[120px] rounded-md border border-gray-300"
          />
        </div>
      </div>
    </div>
  )
}
