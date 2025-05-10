import { useState, useRef, useEffect, FormEvent } from "react"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Loader2, Send } from "lucide-react"
import { toast } from "@/hooks/use-toast"
import { sendMessage, extractResponseText } from "@/lib/api/agent-api"

type Message = {
  id: string
  role: "user" | "assistant"
  content: string
  pending?: boolean
}

export default function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [sessionId, setSessionId] = useState<string | undefined>(undefined)

  // Scroll to bottom whenever messages change
  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    
    if (!input.trim() || isLoading) return
    
    const userMessage = input.trim()
    setInput("")
    
    // Add user message to chat
    const tempId = Date.now().toString()
    setMessages((prev) => [
      ...prev,
      { id: tempId, role: "user", content: userMessage }
    ])
    
    // Add a temporary loading message
    const loadingMsgId = `loading-${Date.now()}`
    setMessages((prev) => [
      ...prev,
      { id: loadingMsgId, role: "assistant", content: "", pending: true }
    ])
    
    setIsLoading(true)
    
    try {
      // Send to backend
      const response = await sendMessage(userMessage, sessionId)
      
      // Store session ID for future messages
      if (!sessionId && response.sessionId) {
        setSessionId(response.sessionId)
      }
      
      // Extract text from response
      const textResponse = extractResponseText(response)
      
      // Replace loading message with actual response
      setMessages((prev) => 
        prev.map(msg => 
          msg.id === loadingMsgId 
            ? { id: response.id || loadingMsgId, role: "assistant", content: textResponse } 
            : msg
        )
      )
    } catch (error) {
      console.error("Error sending message:", error)
      
      // Remove loading message and show error
      setMessages((prev) => prev.filter(msg => msg.id !== loadingMsgId))
      toast({
        title: "Message failed",
        description: "Failed to send message to agent.",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
      // Focus on input after sending
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }

  return (
    <Card className="flex flex-col h-full shadow-md">
      <CardHeader>
        <CardTitle className="text-xl">Chat with Agent</CardTitle>
      </CardHeader>
      <CardContent className="flex-grow overflow-auto p-4">
        <div className="flex flex-col space-y-4">
          {messages.length === 0 ? (
            <div className="flex h-full items-center justify-center text-center text-muted-foreground p-8">
              <p>No messages yet. Start a conversation!</p>
            </div>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={`flex flex-col ${
                  message.role === "user" ? "items-end" : "items-start"
                }`}
              >
                <div
                  className={`max-w-[80%] rounded-lg px-4 py-2 text-sm ${
                    message.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  }`}
                >
                  {message.pending ? (
                    <div className="flex items-center">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="ml-2">Thinking...</span>
                    </div>
                  ) : (
                    <div style={{ whiteSpace: 'pre-wrap' }}>{message.content}</div>
                  )}
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>
      </CardContent>
      <CardFooter className="border-t p-4">
        <form onSubmit={handleSubmit} className="flex w-full space-x-2">
          <Input
            ref={inputRef}
            placeholder="Type your message..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isLoading}
            className="flex-grow"
          />
          <Button type="submit" size="icon" disabled={isLoading || !input.trim()}>
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </form>
      </CardFooter>
    </Card>
  )
}