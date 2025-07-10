"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { ArrowRight, Loader2, MessageSquare, Plus } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card"
import { checkHealth, sendMessage, extractResponseText, extractToolCalls, getSessionHistory, type ToolCall as ApiToolCall } from "@/lib/api"
import { v4 as uuidv4 } from "uuid"
import Markdown from "react-markdown"
import { ToolCallDisplay } from "@/components/tool-call-display"
import { showErrorToast, getErrorMessage, isRecoverableError, type JSONRPCError } from "@/lib/error-utils"
import { ErrorDisplay } from "@/components/ui/error-display"

type ToolCall = ApiToolCall

type Message = {
  role: "user" | "agent"
  content: string
  isLoading?: boolean
  toolCalls?: ToolCall[]
}

// Constants for localStorage keys
const STORAGE_KEYS = {
  SESSION_ID: "peewee-agent-session-id"
}

export default function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isBackendConnected, setIsBackendConnected] = useState(false)
  const [sessionId, setSessionId] = useState<string>("")
  const [connectionError, setConnectionError] = useState<JSONRPCError | Error | string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  
  // Initialize state from localStorage on component mount
  useEffect(() => {
    const initializeState = async () => {
      try {
        // Load saved sessionId or create a new one
        const savedSessionId = localStorage.getItem(STORAGE_KEYS.SESSION_ID)
        let currentSessionId: string
        
        if (savedSessionId) {
          currentSessionId = savedSessionId
          setSessionId(currentSessionId)
          
          // Load chat history from backend for existing session
          try {
            console.log("Loading session history for:", currentSessionId)
            const history = await getSessionHistory(currentSessionId)
            console.log("Received history:", history)
            console.log("Number of events in history:", history.events.length)
            const loadedMessages: Message[] = []
            
            // First pass: collect all function calls and responses across all events
            const functionCalls = new Map<string, { name: string; args: Record<string, unknown> }>()
            const functionResponses = new Map<string, unknown>()
            
            for (const event of history.events) {
              if (event.content && event.content !== null) {
                try {
                  const contentObj = JSON.parse(event.content)
                  if (contentObj && contentObj.parts) {
                    for (const part of contentObj.parts) {
                      // Collect function calls
                      if (part.function_call) {
                        functionCalls.set(part.function_call.id, {
                          name: part.function_call.name,
                          args: part.function_call.args || {}
                        })
                      }
                      
                      // Collect function responses
                      if (part.function_response) {
                        functionResponses.set(part.function_response.id, part.function_response.response)
                      }
                    }
                  }
                } catch (e) {
                  console.error("Error parsing event content for tool calls:", e)
                }
              }
            }
            
            // Build tool calls by matching calls with responses
            const allToolCalls: ToolCall[] = []
            console.log("Function calls found:", functionCalls.size)
            console.log("Function responses found:", functionResponses.size)
            for (const [callId, call] of functionCalls.entries()) {
              const response = functionResponses.get(callId)
              console.log(`Matching call ${callId}:`, call, "with response:", response)
              if (response) {
                allToolCalls.push({
                  name: call.name,
                  args: call.args,
                  result: response
                })
              }
            }
            console.log("Total tool calls created:", allToolCalls.length, allToolCalls)
            
            // Second pass: create messages
            for (const event of history.events) {
              console.log("Processing event:", event)
              
              // Extract text content from the JSON string
              let textContent = ""
              
              if (event.content && event.content !== null) {
                try {
                  const contentObj = JSON.parse(event.content)
                  if (contentObj && contentObj.parts && contentObj.parts.length > 0) {
                    textContent = contentObj.parts.map((part: unknown) => (part as { text?: string }).text || "").join("")
                  }
                } catch (e) {
                  console.error("Error parsing event content:", e)
                  textContent = event.content // fallback to raw content
                }
              }
              
              if (event.author === 'user') {
                loadedMessages.push({
                  role: 'user',
                  content: textContent
                })
              } else if (event.author === 'capy_agent') {
                // For the final agent response, attach all tool calls
                if (textContent && allToolCalls.length > 0) {
                  loadedMessages.push({
                    role: 'agent',
                    content: textContent,
                    toolCalls: [...allToolCalls]  // Create a copy of the array
                  })
                  // Clear tool calls so they don't appear in subsequent messages
                  allToolCalls.length = 0
                } else if (textContent) {
                  loadedMessages.push({
                    role: 'agent',
                    content: textContent
                  })
                }
                // Skip empty agent messages (function call/response events with no text)
              }
            }
            
            console.log("Loaded messages:", loadedMessages)
            console.log("Number of loaded messages:", loadedMessages.length)
            setMessages(loadedMessages)
          } catch (error) {
            console.error("Failed to load session history:", error)
            showErrorToast(error, { title: "Could not load session history" })
            // If we can't load history, start fresh but keep the session ID
          }
        } else {
          currentSessionId = uuidv4()
          setSessionId(currentSessionId)
          localStorage.setItem(STORAGE_KEYS.SESSION_ID, currentSessionId)
        }
      } catch (error) {
        console.error("Error initializing state:", error)
        // If backend is down, create new session anyway
        const newSessionId = uuidv4()
        setSessionId(newSessionId)
        localStorage.setItem(STORAGE_KEYS.SESSION_ID, newSessionId)
      }
    }
    
    initializeState()
  }, [])
  
  

  // Check backend health on component mount
  useEffect(() => {
    const checkBackendHealth = async () => {
      try {
        const health = await checkHealth()
        setIsBackendConnected(health.status === "ok")
        setConnectionError(null)
      } catch (error) {
        console.error("Backend health check failed:", error)
        setIsBackendConnected(false)
        setConnectionError(error as JSONRPCError | Error | string)
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
      
      // Debug: Log the full task response
      console.log("Full task response:", taskResponse)
      console.log("Task history:", taskResponse.history)
      
      // Extract the response text and tool calls from the task
      const responseText = extractResponseText(taskResponse)
      const toolCalls = extractToolCalls(taskResponse)
      
      // Debug: Log extracted tool calls
      console.log("Extracted tool calls:", toolCalls)
      
      // Update the agent's message with the response
      setMessages(prev => {
        const updated = [...prev]
        const lastMessage = updated[updated.length - 1]
        if (lastMessage.role === "agent") {
          lastMessage.content = responseText || "I couldn't generate a response. Please try again."
          lastMessage.toolCalls = toolCalls.length > 0 ? toolCalls : undefined
          lastMessage.isLoading = false
        }
        return updated
      })
    } catch (error) {
      console.error("Error getting response from agent:", error)
      
      // Show error toast
      showErrorToast(error, { 
        title: "Failed to send message",
        action: isRecoverableError(error) ? (
          <Button variant="outline" size="sm" onClick={() => handleSendMessage()}>
            Retry
          </Button>
        ) : undefined
      })
      
      // Update with an error message
      setMessages(prev => {
        const updated = [...prev]
        const lastMessage = updated[updated.length - 1]
        if (lastMessage.role === "agent") {
          lastMessage.content = getErrorMessage(error)
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
    <Card className="flex flex-col flex-1 overflow-hidden shadow-md">
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

      <CardContent className="flex-1 overflow-y-auto min-h-0 p-4">
        {connectionError && !isBackendConnected && (
          <div className="mb-4">
            <ErrorDisplay
              error={connectionError}
              title="Connection Error"
              onRetry={() => {
                const checkBackendHealth = async () => {
                  try {
                    const health = await checkHealth()
                    setIsBackendConnected(health.status === "ok")
                    setConnectionError(null)
                  } catch (error) {
                    console.error("Backend health check failed:", error)
                    setIsBackendConnected(false)
                    setConnectionError(error as JSONRPCError | Error | string)
                  }
                }
                checkBackendHealth()
              }}
              onDismiss={() => setConnectionError(null)}
            />
          </div>
        )}
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
                    message.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted text-left"
                  }`}
                >
                  {message.role === "agent" ? (
                    <div className="space-y-2">
                      {message.toolCalls && (
                        <ToolCallDisplay toolCalls={message.toolCalls} />
                      )}
                      <div className="markdown">
                        <Markdown>{message.content}</Markdown>
                      </div>
                    </div>
                  ) : (
                    message.content
                  )}
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
