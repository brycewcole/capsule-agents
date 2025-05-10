"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { ArrowRight, Loader2, MessageSquare, Plus } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card"
import { checkHealth, sendMessage, extractResponseText } from "@/lib/api"
import { v4 as uuidv4 } from "uuid"

type Message = {
  role: "user" | "agent"
  content: string
  isLoading?: boolean
}

// Constants for localStorage keys
const STORAGE_KEYS = {
  MESSAGES: "peewee-agent-messages",
  SESSION_ID: "peewee-agent-session-id"
}

export default function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isBackendConnected, setIsBackendConnected] = useState(false)
  const [sessionId, setSessionId] = useState<string>("")
  const messagesEndRef = useRef<HTMLDivElement>(null)
  
  // Initialize state from localStorage on component mount
  useEffect(() => {
    // Load saved messages if they exist
    const savedMessages = localStorage.getItem(STORAGE_KEYS.MESSAGES)
    if (savedMessages) {
      try {
        setMessages(JSON.parse(savedMessages))
      } catch (e) {
        console.error("Error parsing saved messages:", e)
        // If there's an error parsing, clear the storage
        localStorage.removeItem(STORAGE_KEYS.MESSAGES)
      }
    }
    
    // Load saved sessionId or create a new one
    const savedSessionId = localStorage.getItem(STORAGE_KEYS.SESSION_ID)
    if (savedSessionId) {
      setSessionId(savedSessionId)
    } else {
      const newSessionId = uuidv4()
      setSessionId(newSessionId)
      localStorage.setItem(STORAGE_KEYS.SESSION_ID, newSessionId)
    }
  }, [])
  
  // Save messages to localStorage whenever they change
  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(messages))
    }
  }, [messages])
  
  // Check backend health on component mount
  useEffect(() => {
    const checkBackendHealth = async () => {
      try {
        const health = await checkHealth()
        setIsBackendConnected(health.status === "ok")
      } catch (error) {
        console.error("Backend health check failed:", error)
        setIsBackendConnected(false)
      }
    }
    
    checkBackendHealth()
  }, [])
  
  // Scroll to bottom of messages
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [])
  
  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  const handleNewChat = () => {
    setMessages([])
    const newSessionId = uuidv4()
    setSessionId(newSessionId)
    
    // Update localStorage
    localStorage.setItem(STORAGE_KEYS.SESSION_ID, newSessionId)
    localStorage.removeItem(STORAGE_KEYS.MESSAGES)
  }

  const handleSendMessage = async () => {
    if (!input.trim() || isLoading) return
    
    const userMessage = input.trim()
    setInput("")
    setIsLoading(true)
    
    // Add user message
    setMessages(prev => [...prev, { role: "user", content: userMessage }])
    
    // Add placeholder for agent response
    setMessages(prev => [...prev, { role: "agent", content: "", isLoading: true }])
    
    try {
      // Send the message with the current sessionId
      const taskResponse = await sendMessage(userMessage, sessionId)
      
      // Extract the response text from the task
      const responseText = extractResponseText(taskResponse)
      
      // Update the agent's message with the response
      setMessages(prev => {
        const updated = [...prev]
        const lastMessage = updated[updated.length - 1]
        if (lastMessage.role === "agent") {
          lastMessage.content = responseText || "I couldn't generate a response. Please try again."
          lastMessage.isLoading = false
        }
        return updated
      })
    } catch (error) {
      console.error("Error getting response from agent:", error)
      
      // Update with an error message
      setMessages(prev => {
        const updated = [...prev]
        const lastMessage = updated[updated.length - 1]
        if (lastMessage.role === "agent") {
          lastMessage.content = "Sorry, there was an error connecting to the agent. Please try again later."
          lastMessage.isLoading = false
        }
        return updated
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  return (
    <Card className="flex flex-col flex-1 min-h-0 overflow-hidden shadow-md">
      <CardHeader className="pb-4 flex flex-row justify-between items-center">
        <div>
          <CardTitle className="flex items-center gap-2 text-xl">
            <MessageSquare className="h-5 w-5 text-primary" />
            Chat with agent
          </CardTitle>
          <CardDescription>
            {isBackendConnected 
              ? "Test your agent with real-time conversation" 
              : "⚠️ Backend not connected. Check your API connection."}
          </CardDescription>
        </div>
        <Button
          variant="outline"
          size="icon"
          title="New Chat"
          onClick={handleNewChat}
          disabled={isLoading}
        >
          <Plus className="h-4 w-4" />
          <span className="sr-only">New Chat</span>
        </Button>
      </CardHeader>

      <CardContent className="flex-1 min-h-0 overflow-y-auto">
        <div className="flex flex-col space-y-4">
          {messages.length === 0 ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              Send a message to start the conversation
            </div>
          ) : (
            messages.map((message, index) => (
              <div key={index} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-2 ${
                    message.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
                  }`}
                >
                  {message.content}
                  {message.isLoading && (
                    <Loader2 className="h-4 w-4 ml-1 inline animate-spin" />
                  )}
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
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
            disabled={isLoading || !isBackendConnected}
          />
          <Button 
            onClick={handleSendMessage} 
            size="icon" 
            className="rounded-full" 
            disabled={!input.trim() || isLoading || !isBackendConnected}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowRight className="h-4 w-4" />
            )}
            <span className="sr-only">Send message</span>
          </Button>
        </div>
      </CardFooter>
    </Card>
  )
}
