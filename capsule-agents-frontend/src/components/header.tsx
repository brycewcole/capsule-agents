import logoSrc from "@/assets/logo.png"
import { Clock, FolderOpen, MessageSquare } from "lucide-react"

interface HeaderProps {
  currentView?: "chat" | "schedules" | "workspace"
  onViewChange?: (view: "chat" | "schedules" | "workspace") => void
}

export default function Header(
  { currentView = "chat", onViewChange }: HeaderProps,
) {
  return (
    <header className="border-b bg-white shadow-sm">
      <div className="container mx-auto flex h-16 items-center px-4 md:px-6 lg:px-8">
        <img src={logoSrc} alt="Logo" className="h-9 w-auto" />
        <h1 className="ml-2 text-2xl font-bold tracking-tight">
          Capsule Agents
        </h1>
        <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
          Alpha
        </span>
        <nav className="ml-auto flex items-center gap-4">
          <button
            type="button"
            onClick={() => onViewChange?.("chat")}
            className={`text-sm font-medium flex items-center gap-1.5 transition-colors ${
              currentView === "chat"
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <MessageSquare className="h-4 w-4" />
            Chat
          </button>
          <button
            type="button"
            onClick={() => onViewChange?.("schedules")}
            className={`text-sm font-medium flex items-center gap-1.5 transition-colors ${
              currentView === "schedules"
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Clock className="h-4 w-4" />
            Schedules
          </button>
          <button
            type="button"
            onClick={() => onViewChange?.("workspace")}
            className={`text-sm font-medium flex items-center gap-1.5 transition-colors ${
              currentView === "workspace"
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <FolderOpen className="h-4 w-4" />
            Workspace
          </button>
          <span className="text-sm font-medium text-muted-foreground opacity-50 cursor-not-allowed">
            Docs
          </span>
          <span className="text-sm font-medium text-muted-foreground opacity-50 cursor-not-allowed">
            Examples
          </span>
          <a
            href="https://github.com/TrackSpike/capsule-agents"
            className="text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            GitHub
          </a>
        </nav>
      </div>
    </header>
  )
}
