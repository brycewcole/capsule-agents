import { useEffect, useState } from "react"
import { Navigate, Route, Routes } from "react-router-dom"
import Header from "./components/header.tsx"
import ChatInterface from "./components/chat-interface.tsx"
// Sidebar is now rendered inside ChatInterface's sheet
import AgentEditor from "./components/agent-editor.tsx"
import ScheduleManager from "./components/schedule-manager.tsx"
import WorkspaceManager from "./components/workspace-manager.tsx"
import { LoginDialog } from "./components/login-dialog.tsx"
import { Toaster } from "./components/ui/toaster.tsx"
import {
  type ChatWithHistory,
  getAgentInfo,
  getChatById,
  getChatsList,
  testLogin,
} from "./lib/api.ts"
import { showErrorToast } from "./lib/error-utils.ts"
import "./App.css"

function App() {
  const [showLogin, setShowLogin] = useState(false)
  const [loginError, setLoginError] = useState<string>()
  const [, setIsAuthenticated] = useState(true) // Temporarily always authenticated

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

  // Restore last selected chat on first load or fall back to most recent chat
  useEffect(() => {
    let isActive = true

    const restoreLastOrLatest = async () => {
      try {
        const savedId = localStorage.getItem("chat:lastContextId")
        if (savedId) {
          const restored = await handleChatSelect(savedId)
          if (restored) return
        }
      } catch {
        // Ignore localStorage errors when reading saved chat
      }

      try {
        const chats = await getChatsList()
        if (!isActive || chats.length === 0) return

        const [latestChat] = [...chats].sort((a, b) => {
          if (b.lastActivity !== a.lastActivity) {
            return b.lastActivity - a.lastActivity
          }
          return b.createTime - a.createTime
        })

        if (!latestChat || !isActive) return

        await handleChatSelect(latestChat.id)
      } catch (error) {
        if (isActive) {
          console.error("Failed to auto-select latest chat:", error)
        }
      }
    }

    restoreLastOrLatest()

    return () => {
      isActive = false
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

  const handleChatSelect = async (chatId: string): Promise<boolean> => {
    if (chatId === currentChatId && currentChatData) return true // Already loaded

    setIsLoadingChat(true)

    try {
      setCurrentChatId(chatId)

      const chatData = await getChatById(chatId)
      setCurrentChatData(chatData)
      return true
    } catch (error) {
      console.error("Failed to load chat:", error)
      showErrorToast(error, {
        title: "Failed to Load Chat",
      })
      // Reset to no chat selected on error
      setCurrentChatId(null)
      setCurrentChatData(null)
      return false
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
        <Header />

        <Routes>
          <Route
            path="chat"
            element={
              <div className="container mx-auto flex flex-1 flex-col p-4 md:p-6 lg:p-8 min-h-0">
                <div className="flex h-full min-h-0 flex-col">
                  <div className="flex-1 min-h-0">
                    <ChatInterface
                      contextId={currentChatId}
                      initialChatData={currentChatData}
                      isLoadingChat={isLoadingChat}
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
              </div>
            }
          />
          <Route
            index
            element={
              <div className="flex-1 overflow-y-auto min-h-0">
                <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 p-4 md:p-6 lg:p-8">
                  <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
                    <AgentEditor />
                    <div className="flex flex-col gap-6">
                      <WorkspaceManager />
                      <ScheduleManager />
                    </div>
                  </div>
                </div>
              </div>
            }
          />
          <Route path="*" element={<Navigate to="chat" replace />} />
        </Routes>
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
