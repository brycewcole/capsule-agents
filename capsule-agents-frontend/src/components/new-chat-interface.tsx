"use client"

import { useEffect, useState, useRef } from "react"
import { useChat } from '@ai-sdk/react'
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { ArrowRight, Loader2, MessageSquare, Plus } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card"
import { ChatStorage, chatAPI } from "@/lib/chat-api"
import Markdown from "react-markdown"
// import { ToolCallDisplay } from "@/components/tool-call-display"
import { showErrorToast } from "@/lib/error-utils"
import { ErrorDisplay } from "@/components/ui/error-display"

export default function NewChatInterface() {
  const [isBackendConnected, setIsBackendConnected] = useState(false)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [currentChatId, setCurrentChatId] = useState<string>("")
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Initialize chat session on mount
  useEffect(() => {
    const initializeChat = async () => {
      try {
        const chatId = await ChatStorage.getOrCreateChatId()
        setCurrentChatId(chatId)
      } catch (error) {
        console.error("Failed to initialize chat:", error)
        showErrorToast(error, { title: "Failed to initialize chat" })
      }
    }
    
    initializeChat()
  }, [])

  // Initialize chat with useChat hook
  const { messages, append, isLoading, stop } = useChat({
    api: '/api/chat',
    body: {
      chatId: currentChatId,
    },
    streamProtocol: 'text',
    onError: (error: Error) => {
      console.error('Chat error:', error)
      showErrorToast(error, { title: "Chat Error" })
    },
  })

  // Check backend health on component mount
  useEffect(() => {
    const checkBackendHealth = async () => {
      try {
        const health = await chatAPI.checkHealth()
        setIsBackendConnected(health.status === "ok")
        setConnectionError(null)
      } catch (error: any) {
        console.error("Backend health check failed:", error)
        setIsBackendConnected(false)
        setConnectionError(error?.message || "Connection failed")
      }
    }
    
    checkBackendHealth()
  }, [])

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const handleNewChat = async () => {
    try {
      const chatId = ChatStorage.startNewChat()
      setCurrentChatId(chatId)
      
      // Force component to re-render with new chat
      window.location.reload()
    } catch (error: any) {
      console.error("Failed to start new chat:", error)
      showErrorToast(error, { title: "Failed to start new chat" })
    }
  }

  const handleSendMessage = (input: string) => {
    if (!input.trim() || isLoading) return
    
    append({
      role: 'user',
      content: input,
    })
  }

  const handleRetryConnection = async () => {
    try {
      const health = await chatAPI.checkHealth()
      setIsBackendConnected(health.status === "ok")
      setConnectionError(null)
    } catch (error: any) {
      console.error("Backend health check failed:", error)
      setIsBackendConnected(false)
      setConnectionError(error?.message || "Connection failed")
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
              onRetry={handleRetryConnection}
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
            messages.map((message) => (
              <div 
                key={message.id} 
                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-2 ${
                    message.role === "user" 
                      ? "bg-primary text-primary-foreground" 
                      : "bg-muted text-left"
                  }`}
                >
                  {message.role === "assistant" ? (
                    <div className="space-y-2">
                      {/* For now, just render the content as markdown */}
                      <div className="markdown">
                        <Markdown>{message.content}</Markdown>
                      </div>
                    </div>
                  ) : (
                    <div>{message.content}</div>
                  )}
                </div>
              </div>
            ))
          )}
          
          {/* Show loading indicator when streaming */}
          {isLoading && (
            <div className="flex justify-start">
              <div className="max-w-[80%] rounded-2xl px-4 py-2 bg-muted">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>
      </CardContent>

      <CardFooter className="border-t p-4">
        <ChatInput 
          onSendMessage={handleSendMessage}
          disabled={!isBackendConnected || isLoading}
          isLoading={isLoading}
          onStop={stop}
        />
      </CardFooter>
    </Card>
  )
}

// Separate input component for better organization
function ChatInput({ 
  onSendMessage, 
  disabled, 
  isLoading, 
  onStop 
}: {
  onSendMessage: (message: string) => void
  disabled: boolean
  isLoading: boolean
  onStop: () => void
}) {
  const [input, setInput] = useState("")

  const handleSubmit = () => {
    if (!input.trim() || disabled) return
    
    onSendMessage(input)
    setInput("")
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="flex w-full items-center gap-2">
      <Input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Type your message..."
        className="flex-1 rounded-full"
        disabled={disabled}
      />
      
      {isLoading ? (
        <Button 
          onClick={onStop}
          size="icon" 
          variant="outline"
          className="rounded-full" 
        >
          <div className="h-4 w-4 border-2 border-current border-r-transparent rounded-full animate-spin" />
          <span className="sr-only">Stop</span>
        </Button>
      ) : (
        <Button 
          onClick={handleSubmit}
          size="icon" 
          className="rounded-full" 
          disabled={!input.trim() || disabled}
        >
          <ArrowRight className="h-4 w-4" />
          <span className="sr-only">Send message</span>
        </Button>
      )}
    </div>
  )
}