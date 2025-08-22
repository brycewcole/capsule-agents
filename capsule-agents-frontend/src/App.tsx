import { useState, useEffect, useRef } from 'react';
import Header from "./components/header.tsx";
import ChatInterface from "./components/chat-interface.tsx";
// Sidebar is now rendered inside ChatInterface's sheet
import AgentEditor from "./components/agent-editor.tsx";
import { LoginDialog } from "./components/login-dialog.tsx";
import { Toaster } from "./components/ui/toaster.tsx";
import { testLogin, getChatById, type ChatWithHistory } from "./lib/api.ts";
import { showErrorToast } from "./lib/error-utils.ts";
import './App.css';

function App() {
  const [showLogin, setShowLogin] = useState(false);
  const [loginError, setLoginError] = useState<string>();
  const [, setIsAuthenticated] = useState(true); // Temporarily always authenticated
  
  // Chat management state
  const [currentChatId, setCurrentChatId] = useState<string | null>(() => {
    try {
      return localStorage.getItem('chat:lastContextId');
    } catch {
      return null;
    }
  });
  const [currentChatData, setCurrentChatData] = useState<ChatWithHistory | null>(null);
  const [isLoadingChat, setIsLoadingChat] = useState(false);
  const [chatsRefreshKey, setChatsRefreshKey] = useState(0);
  const [isConversationsOpen, setIsConversationsOpen] = useState<boolean>(true);
  const convPrefLockedRef = useRef(false);

  // Initialize conversations panel preference: use saved if present, otherwise responsive default
  useEffect(() => {
    try {
      const saved = localStorage.getItem('chat:conversationsOpen');
      if (saved !== null) {
        setIsConversationsOpen(saved === 'true');
        convPrefLockedRef.current = true;
      } else {
        const isWide = window.innerWidth >= 1024; // lg breakpoint
        setIsConversationsOpen(isWide);
      }
    } catch {}
  }, []);

  // Persist conversations panel state across reloads
  useEffect(() => {
    try {
      localStorage.setItem('chat:conversationsOpen', String(isConversationsOpen));
    } catch {}
  }, [isConversationsOpen]);

  // Auto-toggle on resize only if user hasn't set a preference
  useEffect(() => {
    const onResize = () => {
      if (convPrefLockedRef.current) return;
      const isWide = window.innerWidth >= 1024;
      setIsConversationsOpen(isWide);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    // Temporarily skip authentication for new backend
    setIsAuthenticated(true);
    setShowLogin(false);
  }, []);

  // Restore last selected chat on first load
  useEffect(() => {
    try {
      const savedId = localStorage.getItem('chat:lastContextId');
      if (savedId) {
        // Load chat data for saved id
        handleChatSelect(savedId);
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist currently selected chat id
  useEffect(() => {
    try {
      if (currentChatId) {
        localStorage.setItem('chat:lastContextId', currentChatId);
      } else {
        localStorage.removeItem('chat:lastContextId');
      }
    } catch {}
  }, [currentChatId]);

  // Keyboard shortcut: Cmd/Ctrl+K to toggle conversations panel
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isToggle = (e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey);
      if (isToggle) {
        e.preventDefault();
        convPrefLockedRef.current = true;
        setIsConversationsOpen(v => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleLogin = async (password: string) => {
    try {
      setLoginError(undefined);
      await testLogin(password);
      setIsAuthenticated(true);
      setShowLogin(false);
    } catch (error) {
      console.error('Login failed:', error);
      setLoginError('Invalid password');
      throw error; // Re-throw to keep the dialog loading state
    }
  };

  const handleChatSelect = async (chatId: string) => {
    if (chatId === currentChatId && currentChatData) return; // Already loaded
    
    try {
      setIsLoadingChat(true);
      setCurrentChatId(chatId);
      
      const chatData = await getChatById(chatId);
      setCurrentChatData(chatData);
    } catch (error) {
      console.error('Failed to load chat:', error);
      showErrorToast(error, {
        title: "Failed to Load Chat"
      });
      // Reset to no chat selected on error
      setCurrentChatId(null);
      setCurrentChatData(null);
    } finally {
      setIsLoadingChat(false);
    }
  };

  const handleNewChat = () => {
    setCurrentChatId(null);
    setCurrentChatData(null);
  };

  return (
    <>
      <main className="flex h-screen flex-col bg-slate-50 overflow-hidden">
        <Header />
        
        <div className="container mx-auto flex flex-1 gap-6 p-4 md:p-6 lg:p-8 min-h-0">
          {/* Agent Editor - Left Side */}
          <div className="basis-1/3 flex flex-col min-h-0">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-foreground">Agent Configuration</h2>
              <p className="text-sm text-muted-foreground">Configure your agent's settings and tools</p>
            </div>
            <div className="flex-1 overflow-y-auto min-h-0">
              <AgentEditor />
            </div>
          </div>
          
          {/* Chat Interface - Middle */}
          <div className="flex-1 flex flex-col min-h-0">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-foreground">Chat Interface</h2>
              <p className="text-sm text-muted-foreground">
                {currentChatId 
                  ? `Chatting in: ${currentChatData?.title || 'Loading...'}`
                  : "Start a new conversation"}
              </p>
            </div>
            <div className="flex-1 min-h-0">
              <ChatInterface 
                contextId={currentChatId}
                initialChatData={currentChatData}
                isLoadingChat={isLoadingChat}
                isConversationsOpen={isConversationsOpen}
                onToggleConversations={() => { convPrefLockedRef.current = true; setIsConversationsOpen(v => !v); }}
                onChatCreated={(newChatId) => {
                  setCurrentChatId(newChatId);
                  setChatsRefreshKey((k) => k + 1);
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
      </main>
      
      <LoginDialog 
        open={showLogin} 
        onLogin={handleLogin} 
        error={loginError}
      />
      <Toaster />
    </>
  );
}

export default App;
