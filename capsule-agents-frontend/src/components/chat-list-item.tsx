"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Trash2, Loader2, MessageSquare } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ChatSummary } from "@/lib/api"

interface ChatListItemProps {
  chat: ChatSummary
  isActive: boolean
  onClick: () => void
  onDelete: (event: React.MouseEvent) => void
  isDeleting: boolean
  formatTimestamp: (timestamp: number) => string
}

export function ChatListItem({ 
  chat, 
  isActive, 
  onClick, 
  onDelete, 
  isDeleting,
  formatTimestamp 
}: ChatListItemProps) {
  const [isHovered, setIsHovered] = useState(false)

  return (
    <div
      className={cn(
        "group relative rounded-lg p-3 cursor-pointer transition-all duration-200 border",
        isActive 
          ? "bg-primary/10 border-primary/20 shadow-sm" 
          : "bg-background border-transparent hover:bg-muted/50 hover:border-border/50"
      )}
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <MessageSquare className={cn(
              "h-4 w-4 flex-shrink-0",
              isActive ? "text-primary" : "text-muted-foreground"
            )} />
            <h3 className={cn(
              "font-medium text-sm truncate",
              isActive ? "text-primary" : "text-foreground"
            )}>
              {chat.title}
            </h3>
          </div>
          
          <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
            {chat.preview}
          </p>
          
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs">
                {chat.messageCount} msg{chat.messageCount !== 1 ? 's' : ''}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {formatTimestamp(chat.lastActivity)}
              </span>
            </div>
          </div>
        </div>

        {/* Delete button - only show on hover */}
        {(isHovered || isDeleting) && (
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200",
              "hover:bg-destructive/10 hover:text-destructive",
              isDeleting && "opacity-100"
            )}
            onClick={onDelete}
            disabled={isDeleting}
          >
            {isDeleting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
          </Button>
        )}
      </div>
    </div>
  )
}