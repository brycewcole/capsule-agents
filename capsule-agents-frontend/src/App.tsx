import { useEffect, useRef, useState } from "react"
import Header from "./components/header.tsx"
import ChatInterface from "./components/chat-interface.tsx"
// Sidebar is now rendered inside ChatInterface's sheet
import AgentEditor from "./components/agent-editor.tsx"
import ScheduleManager from "./components/schedule-manager.tsx"
import { LoginDialog } from "./components/login-dialog.tsx"
import { Toaster } from "./components/ui/toaster.tsx"
import {
  type ChatWithHistory,
  getAgentInfo,
  getChatById,
  testLogin,
} from "./lib/api.ts"
import { showErrorToast } from "./lib/error-utils.ts"
import "./App.css"

type ViewType = "chat" | "schedules"

function App() {
  const [showLogin, setShowLogin] = useState(false)
  const [loginError, setLoginError] = useState<string>()
  const [, setIsAuthenticated] = useState(true) // Temporarily always authenticated
  const [currentView, setCurrentView] = useState<ViewType>("chat")

  // Chat management state
  const [currentChatId, setCurrentChatId] = useState<string | null>(() => {
    try {
      return localStorage.getItem("chat:lastContextId")
    } catch {
      return null
    }
  })
  const [currentChatData, setCurrentChatData] = useState<
    ChatWithHistory | null
  >(null)
  const [isLoadingChat, setIsLoadingChat] = useState(false)
  const [chatsRefreshKey, setChatsRefreshKey] = useState(0)
  const [isConversationsOpen, setIsConversationsOpen] = useState<boolean>(true)
  const convPrefLockedRef = useRef(false)

  // Initialize conversations panel preference: use saved if present, otherwise responsive default
  useEffect(() => {
    try {
      const saved = localStorage.getItem("chat:conversationsOpen")
      if (saved !== null) {
        setIsConversationsOpen(saved === "true")
        convPrefLockedRef.current = true
      } else {
        const isWide = globalThis.innerWidth >= 1024 // lg breakpoint
        setIsConversationsOpen(isWide)
      }
    } catch {
      // Ignore localStorage errors
    }
  }, [])

  // Persist conversations panel state across reloads
  useEffect(() => {
    try {
      localStorage.setItem(
        "chat:conversationsOpen",
        String(isConversationsOpen),
      )
    } catch {
      // Ignore localStorage errors
    }
  }, [isConversationsOpen])

  // Auto-toggle on resize only if user hasn't set a preference
  useEffect(() => {
    const onResize = () => {
      if (convPrefLockedRef.current) return
      const isWide = globalThis.innerWidth >= 1024
      setIsConversationsOpen(isWide)
    }
    globalThis.addEventListener("resize", onResize)
    return () => globalThis.removeEventListener("resize", onResize)
  }, [])

  useEffect(() => {
    // Temporarily skip authentication for new backend
    setIsAuthenticated(true)
    setShowLogin(false)
  }, [])

  // Update document title with agent name
  useEffect(() => {
    const updateTitle = async () => {
      try {
        const agentInfo = await getAgentInfo()
        if (agentInfo.name) {
          document.title = agentInfo.name
        }
      } catch (error) {
        console.error("Failed to fetch agent name for title:", error)
        // Keep default title on error
      }
    }

    updateTitle()
  }, [])

  // Restore last selected chat on first load
  useEffect(() => {
    try {
      const savedId = localStorage.getItem("chat:lastContextId")
      if (savedId) {
        // Load chat data for saved id
        handleChatSelect(savedId)
      }
    } catch {
      // Ignore localStorage errors
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Persist currently selected chat id
  useEffect(() => {
    try {
      if (currentChatId) {
        localStorage.setItem("chat:lastContextId", currentChatId)
      } else {
        localStorage.removeItem("chat:lastContextId")
      }
    } catch {
      // Ignore localStorage errors
    }
  }, [currentChatId])

  // Keyboard shortcut: Cmd/Ctrl+K to toggle conversations panel
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isToggle = (e.key === "k" || e.key === "K") &&
        (e.metaKey || e.ctrlKey)
      if (isToggle) {
        e.preventDefault()
        convPrefLockedRef.current = true
        setIsConversationsOpen((v) => !v)
      }
    }
    globalThis.addEventListener("keydown", handler)
    return () => globalThis.removeEventListener("keydown", handler)
  }, [])

  const handleLogin = async (password: string) => {
    try {
      setLoginError(undefined)
      await testLogin(password)
      setIsAuthenticated(true)
      setShowLogin(false)
    } catch (error) {
      console.error("Login failed:", error)
      setLoginError("Invalid password")
      throw error // Re-throw to keep the dialog loading state
    }
  }

  const handleChatSelect = async (chatId: string) => {
    if (chatId === currentChatId && currentChatData) return // Already loaded

    try {
      setIsLoadingChat(true)
      setCurrentChatId(chatId)

      const chatData = await getChatById(chatId)
      setCurrentChatData(chatData)
    } catch (error) {
      console.error("Failed to load chat:", error)
      showErrorToast(error, {
        title: "Failed to Load Chat",
      })
      // Reset to no chat selected on error
      setCurrentChatId(null)
      setCurrentChatData(null)
    } finally {
      setIsLoadingChat(false)
    }
  }

  const handleNewChat = () => {
    setCurrentChatId(null)
    setCurrentChatData(null)
  }

  return (
    <>
      <main className="flex h-screen flex-col bg-slate-50 overflow-hidden">
        <Header
          currentView={currentView}
          onViewChange={setCurrentView}
        />

        {currentView === "chat" && (
          <div className="container mx-auto flex flex-1 gap-6 p-4 md:p-6 lg:p-8 min-h-0">
            {/* Agent Editor - Left Side */}
            <div className="basis-1/3 flex flex-col min-h-0">
              <div className="mb-4">
                <h2 className="text-lg font-semibold text-foreground">
                  Agent Configuration
                </h2>
                <p className="text-sm text-muted-foreground">
                  Configure your agent's settings and capabilities
                </p>
              </div>
              <div className="flex-1 overflow-y-auto min-h-0">
                <AgentEditor />
              </div>
            </div>

            {/* Chat Interface - Middle */}
            <div className="flex-1 flex flex-col min-h-0">
              <div className="mb-4">
                <h2 className="text-lg font-semibold text-foreground">
                  Chat Interface
                </h2>
                <p className="text-sm text-muted-foreground">
                  {currentChatId
                    ? `Chatting in: ${currentChatData?.title || "Loading..."}`
                    : "Start a new conversation"}
                </p>
              </div>
              <div className="flex-1 min-h-0">
                <ChatInterface
                  contextId={currentChatId}
                  initialChatData={currentChatData}
                  isLoadingChat={isLoadingChat}
                  isConversationsOpen={isConversationsOpen}
                  onToggleConversations={() => {
                    convPrefLockedRef.current = true
                    setIsConversationsOpen((v) => !v)
                  }}
                  onChatCreated={(newChatId) => {
                    setCurrentChatId(newChatId)
                    setChatsRefreshKey((k) => k + 1)
                  }}
                  onNewChat={handleNewChat}
                  currentChatId={currentChatId}
                  onChatSelect={handleChatSelect}
                  chatsRefreshKey={chatsRefreshKey}
                />
              </div>
            </div>
            {/* Sheet moved inside ChatInterface to keep it visually connected */}
          </div>
        )}

        {currentView === "schedules" && (
          <div className="container mx-auto flex-1 p-4 md:p-6 lg:p-8 overflow-y-auto">
            <div className="mb-6">
              <h2 className="text-2xl font-semibold text-foreground">
                Schedules
              </h2>
              <p className="text-sm text-muted-foreground">
                Automate agent queries with scheduled tasks
              </p>
            </div>
            <ScheduleManager />
          </div>
        )}
      </main>

      <LoginDialog
        open={showLogin}
        onLogin={handleLogin}
        error={loginError}
      />
      <Toaster />
    </>
  )
}

export default App
