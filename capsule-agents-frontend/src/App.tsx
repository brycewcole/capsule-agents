import { useState, useEffect } from 'react';
import Header from './components/header';
import ChatInterface from './components/chat-interface';
import { ChatSidebar } from './components/chat-sidebar';
import AgentEditor from './components/agent-editor';
import { LoginDialog } from './components/login-dialog';
import { Toaster } from './components/ui/toaster';
import { testLogin, getChatById, type ChatWithHistory } from './lib/api';
import { showErrorToast } from './lib/error-utils';
import './App.css';

function App() {
  const [showLogin, setShowLogin] = useState(false);
  const [loginError, setLoginError] = useState<string>();
  const [, setIsAuthenticated] = useState(true); // Temporarily always authenticated
  
  // Chat management state
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [currentChatData, setCurrentChatData] = useState<ChatWithHistory | null>(null);
  const [isLoadingChat, setIsLoadingChat] = useState(false);
  const [chatsRefreshKey, setChatsRefreshKey] = useState(0);

  useEffect(() => {
    // Temporarily skip authentication for new backend
    setIsAuthenticated(true);
    setShowLogin(false);
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
    if (chatId === currentChatId) return; // Already selected
    
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
          <div className="w-1/3 flex flex-col min-h-0">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-foreground">Agent Configuration</h2>
              <p className="text-sm text-muted-foreground">Configure your agent's settings and tools</p>
            </div>
            <div className="flex-1 overflow-y-auto min-h-0">
              <AgentEditor />
            </div>
          </div>
          
          {/* Chat Management - Center */}
          <div className="w-1/4 flex flex-col min-h-0">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-foreground">Conversations</h2>
              <p className="text-sm text-muted-foreground">Manage your chat history</p>
            </div>
          <div className="flex-1 min-h-0">
            <ChatSidebar
              currentChatId={currentChatId}
              onChatSelect={handleChatSelect}
              onNewChat={handleNewChat}
              refreshKey={chatsRefreshKey}
            />
          </div>
          </div>
          
          {/* Chat Interface - Right Side */}
          <div className="w-5/12 flex flex-col min-h-0">
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
                onChatCreated={(newChatId) => {
                  setCurrentChatId(newChatId);
                  // Trigger sidebar to refresh chat list
                  setChatsRefreshKey((k) => k + 1);
                }}
              />
            </div>
          </div>
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
