"use client"

import type React from "react"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { ArrowRight, MessageSquare } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card"

type Message = {
  role: "user" | "agent"
  content: string
}

export default function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([
    { role: "user", content: "whats the capital of France?" },
    { role: "agent", content: "The capital of France is paris" },
    { role: "user", content: "cool thanks" },
    { role: "agent", content: "anytime!" },
  ])
  const [input, setInput] = useState("")

  const handleSendMessage = () => {
    if (!input.trim()) return

    // Add user message
    setMessages([...messages, { role: "user", content: input }])

    // Simulate agent response (in a real app, this would call an API)
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          role: "agent",
          content: "I'm a simple demo agent. Ask me something else!",
        },
      ])
    }, 1000)

    setInput("")
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  return (
    <Card className="flex h-full flex-col shadow-md">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-xl">
          <MessageSquare className="h-5 w-5 text-primary" />
          Chat with agent
        </CardTitle>
        <CardDescription>Test your agent with real-time conversation</CardDescription>
      </CardHeader>

      <CardContent className="flex-1 overflow-y-auto">
        <div className="flex flex-col space-y-4">
          {messages.map((message, index) => (
            <div key={index} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-2 ${
                  message.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
                }`}
              >
                {message.content}
              </div>
            </div>
          ))}
        </div>
      </CardContent>

      <CardFooter className="border-t p-4">
        <div className="flex w-full items-center gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your message..."
            className="flex-1 rounded-full"
          />
          <Button onClick={handleSendMessage} size="icon" className="rounded-full" disabled={!input.trim()}>
            <ArrowRight className="h-4 w-4" />
            <span className="sr-only">Send message</span>
          </Button>
        </div>
      </CardFooter>
    </Card>
  )
}
