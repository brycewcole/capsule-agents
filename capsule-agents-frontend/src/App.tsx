import { useState, useEffect } from 'react';
import Header from './components/header';
import ChatInterface from './components/chat-interface';
import AgentEditor from './components/agent-editor';
import { LoginDialog } from './components/login-dialog';
import { Toaster } from './components/ui/toaster';
import { testLogin } from './lib/api';
import './App.css';

function App() {
  const [showLogin, setShowLogin] = useState(false);
  const [loginError, setLoginError] = useState<string>();
  const [isAuthenticated, setIsAuthenticated] = useState(true); // Temporarily always authenticated

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

  return (
    <>
      <main className="flex h-screen flex-col bg-slate-50 overflow-hidden">
        <Header />
        
        <div className="container mx-auto flex flex-1 gap-6 p-4 md:p-6 lg:p-8 min-h-0">
          {/* Agent Editor - Left Side */}
          <div className="w-1/2 flex flex-col min-h-0">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-foreground">Agent Configuration</h2>
              <p className="text-sm text-muted-foreground">Configure your agent's settings and tools</p>
            </div>
            <div className="flex-1 overflow-y-auto min-h-0">
              <AgentEditor />
            </div>
          </div>
          
          {/* Chat Interface - Right Side */}
          <div className="w-1/2 flex flex-col min-h-0">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-foreground">Chat Interface</h2>
              <p className="text-sm text-muted-foreground">Test your agent by chatting with it</p>
            </div>
            <div className="flex-1 min-h-0">
              <ChatInterface key={isAuthenticated ? 'auth' : 'unauth'} />
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
