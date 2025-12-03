"use client"

import { Button } from "./ui/button.tsx"
import { Badge } from "./ui/badge.tsx"
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover.tsx"
import { Loader2, MessageSquare, MoreVertical, Trash2 } from "lucide-react"
import { cn } from "../lib/utils.ts"
import type { ChatSummary } from "../lib/api.ts"

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
  formatTimestamp,
}: ChatListItemProps) {
  return (
    <div
      className={cn(
        "group relative rounded-lg p-3 cursor-pointer transition-all duration-200 border",
        isActive
          ? "bg-primary/10 border-primary/20 shadow-sm"
          : "bg-background border-transparent hover:bg-muted/50 hover:border-border/50",
      )}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0 pr-8">
          <div className="flex items-center gap-2 mb-1">
            <MessageSquare
              className={cn(
                "h-4 w-4 flex-shrink-0",
                isActive ? "text-primary" : "text-muted-foreground",
              )}
            />
            <h3
              className={cn(
                "font-medium text-sm truncate",
                isActive ? "text-primary" : "text-foreground",
              )}
            >
              {chat.title}
            </h3>
          </div>

          <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
            {chat.preview}
          </p>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs">
                {chat.messageCount} msg{chat.messageCount !== 1 ? "s" : ""}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {formatTimestamp(chat.lastActivity)}
              </span>
            </div>
          </div>
        </div>

        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "h-8 w-8 p-0 text-muted-foreground hover:text-foreground",
                isDeleting && "text-destructive",
              )}
              onClick={(event) => event.stopPropagation()}
            >
              <MoreVertical className="h-4 w-4" />
              <span className="sr-only">Open context actions</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            className="w-44 p-1"
            onClick={(event) => event.stopPropagation()}
          >
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2 text-destructive hover:text-destructive"
              onClick={onDelete}
              disabled={isDeleting}
            >
              {isDeleting
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Trash2 className="h-4 w-4" />}
              Delete context
            </Button>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  )
}
