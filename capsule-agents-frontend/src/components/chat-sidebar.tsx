"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Plus, Search, MessageSquare, Loader2 } from "lucide-react"
import { getChatsList, deleteChatById, type ChatSummary } from "@/lib/api"
import { showErrorToast } from "@/lib/error-utils"
import { ChatListItem } from "@/components/chat-list-item"

interface ChatSidebarProps {
  currentChatId?: string | null
  onChatSelect: (chatId: string) => void
  onNewChat: () => void
  className?: string
}

export function ChatSidebar({ 
  currentChatId, 
  onChatSelect, 
  onNewChat,
  className = "" 
}: ChatSidebarProps) {
  const [chats, setChats] = useState<ChatSummary[]>([])
  const [filteredChats, setFilteredChats] = useState<ChatSummary[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [isDeleting, setIsDeleting] = useState<string | null>(null)

  // Load chats on component mount
  useEffect(() => {
    loadChats()
  }, [])

  // Filter chats based on search query
  useEffect(() => {
    if (searchQuery.trim() === "") {
      setFilteredChats(chats)
    } else {
      const query = searchQuery.toLowerCase()
      const filtered = chats.filter(chat => 
        chat.title.toLowerCase().includes(query) || 
        chat.preview.toLowerCase().includes(query)
      )
      setFilteredChats(filtered)
    }
  }, [chats, searchQuery])

  const loadChats = async () => {
    try {
      setIsLoading(true)
      console.log("ChatSidebar: Starting to load chats...")
      const chatsList = await getChatsList()
      console.log("ChatSidebar: Received chats list:", chatsList)
      setChats(chatsList)
      console.log("ChatSidebar: Set chats state with", chatsList.length, "chats")
    } catch (error) {
      console.error("ChatSidebar: Failed to load chats:", error)
      showErrorToast(error, { 
        title: "Failed to Load Chats"
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleDeleteChat = async (chatId: string, event: React.MouseEvent) => {
    event.stopPropagation() // Prevent chat selection
    
    if (!confirm("Are you sure you want to delete this conversation? This action cannot be undone.")) {
      return
    }

    try {
      setIsDeleting(chatId)
      const success = await deleteChatById(chatId)
      
      if (success) {
        // Remove from local state
        setChats(prev => prev.filter(chat => chat.id !== chatId))
        
        // If this was the current chat, trigger new chat
        if (currentChatId === chatId) {
          onNewChat()
        }
      } else {
        throw new Error("Failed to delete chat")
      }
    } catch (error) {
      console.error("Failed to delete chat:", error)
      showErrorToast(error, { 
        title: "Failed to Delete Chat"
      })
    } finally {
      setIsDeleting(null)
    }
  }

  const formatLastActivity = (timestamp: number): string => {
    const date = new Date(timestamp * 1000)
    const now = new Date()
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60)

    if (diffInHours < 24) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    } else if (diffInHours < 24 * 7) {
      return date.toLocaleDateString([], { weekday: 'short' })
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
    }
  }

  return (
    <Card className={`flex flex-col h-full ${className}`}>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <MessageSquare className="h-5 w-5 text-primary" />
            Conversations
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={onNewChat}
            className="flex items-center gap-1"
          >
            <Plus className="h-4 w-4" />
            New
          </Button>
        </div>
        
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </CardHeader>

      <CardContent className="flex-1 overflow-y-auto p-0">
        {isLoading ? (
          <div className="flex items-center justify-center p-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filteredChats.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center">
            <MessageSquare className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              {searchQuery ? "No conversations found" : "No conversations yet"}
            </p>
            {!searchQuery && (
              <p className="text-sm text-muted-foreground mt-2">
                Start a new conversation to get going
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-1 p-2">
            {filteredChats.map((chat) => (
              <ChatListItem
                key={chat.id}
                chat={chat}
                isActive={currentChatId === chat.id}
                onClick={() => onChatSelect(chat.id)}
                onDelete={(e) => handleDeleteChat(chat.id, e)}
                isDeleting={isDeleting === chat.id}
                formatTimestamp={formatLastActivity}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}