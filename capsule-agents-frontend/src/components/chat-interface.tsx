"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { ArrowRight, Loader2, MessageSquare, Plus } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card"
import { checkHealth, streamMessage, extractResponseText, extractToolCalls, type ToolCall as ApiToolCall, type A2ATask } from "@/lib/api"
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


export default function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isBackendConnected, setIsBackendConnected] = useState(false)
  const [connectionError, setConnectionError] = useState<JSONRPCError | Error | string | null>(null)
  const [currentTask, setCurrentTask] = useState<A2ATask | null>(null)
  // Defer contextId assignment to backend on first message
  const [contextId, setContextId] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  
  // Initialize state - check backend connection
  useEffect(() => {
    const initializeState = async () => {
      try {
        console.log("Checking backend health...")
        await checkHealth()
        setIsBackendConnected(true)
        setConnectionError(null)
        console.log("Backend connection successful")
      } catch (error) {
        console.error("Backend connection failed:", error)
        setIsBackendConnected(false)
        setConnectionError(error as JSONRPCError | Error)
      }
    }

    initializeState()
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
    setCurrentTask(null)
    // Clear contextId so backend will assign a fresh one on next message
    setContextId(null)
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
      // Use A2A streaming
      let currentResponseText = ""
      let finalToolCalls: ToolCall[] = []
      
      for await (const event of streamMessage(userMessage, contextId)) {
        console.log("Received A2A event:", event)
        
        // Handle different event types
        if (event.kind === "task") {
          // Initial task created
          const task = event as A2ATask
          setCurrentTask(task)
          // Capture backend-assigned contextId on first response
          if (!contextId && task.contextId) {
            setContextId(task.contextId)
          } else if (contextId && task.contextId !== contextId) {
            console.warn('Task contextId changed from expected contextId:', { expected: contextId, received: task.contextId })
          }
          console.log("Task created:", task.id, "contextId:", task.contextId)
        } else if (event.kind === "message" && event.role === "agent") {
          // Agent message response (could be streaming or final)
          const newText = extractResponseText(event)
          if (newText) {
            currentResponseText = newText
            
            // Update the agent's message
            setMessages(prev => {
              const updated = [...prev]
              const lastMessage = updated[updated.length - 1]
              if (lastMessage.role === "agent") {
                lastMessage.content = currentResponseText
                // For simple messages (no task), this is the final response
                lastMessage.isLoading = currentTask !== null
              }
              return updated
            })
            
            // If no task was created, this is a simple message and we're done
            if (currentTask === null) {
              setIsLoading(false)
              break
            }
          }
        } else if (event.kind === "status-update") {
          // Handle status updates
          console.log("Status update:", event.status.state)
          
          if (event.final && event.status.state === "completed") {
            // Final completion - extract tool calls from current task
            if (currentTask) {
              finalToolCalls = extractToolCalls(currentTask)
            }
            
            // Mark as complete
            setMessages(prev => {
              const updated = [...prev]
              const lastMessage = updated[updated.length - 1]
              if (lastMessage.role === "agent") {
                lastMessage.content = currentResponseText
                lastMessage.toolCalls = finalToolCalls.length > 0 ? finalToolCalls : undefined
                lastMessage.isLoading = false
              }
              return updated
            })
            
            setIsLoading(false)
            break
          } else if (event.final && event.status.state === "failed") {
            // Handle failure
            throw new Error(extractResponseText(event) || "Task failed")
          }
        }
      }
      
    } catch (error) {
      console.error("Error getting response from agent:", error)
      
      // Show error toast with development details and specific guidance
      showErrorToast(error, { 
        title: "A2A Streaming Error",
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
    <Card className="flex flex-col h-full overflow-hidden shadow-md">
      <CardHeader className="pb-4 flex flex-row justify-between items-center">
        <div>
          <CardTitle className="flex items-center gap-2 text-xl">
            <MessageSquare className="h-5 w-5 text-primary" />
            Chat with agent
          </CardTitle>
          <CardDescription>
            {isBackendConnected 
              ? (contextId ? `Conversation context: ${contextId.slice(-8)}` : "New conversation")
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
