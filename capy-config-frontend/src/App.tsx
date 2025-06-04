import { useState, useEffect } from 'react';
import Header from './components/header';
import AgentEditor from './components/agent-editor';
import ChatInterface from './components/chat-interface';
import { LoginDialog } from './components/login-dialog';
import { authStore, testLogin } from './lib/api';
import './App.css';

function App() {
  const [showLogin, setShowLogin] = useState(false);
  const [loginError, setLoginError] = useState<string>();
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    // Check if already authenticated
    const authenticated = authStore.isAuthenticated();
    setIsAuthenticated(authenticated);
    setShowLogin(!authenticated);
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
        <div className="container mx-auto flex flex-1 flex-col gap-6 p-4 md:flex-row md:p-6 lg:p-8 min-h-0">
          <div className="flex-1 flex flex-col min-h-0">
            <div className="mb-6">
              <h2 className="text-2xl font-semibold tracking-tight text-foreground">Edit</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Configure your agent settings and tools
              </p>
            </div>
            <div className="flex-1 overflow-y-auto space-y-6 pr-2">
              {isAuthenticated && <AgentEditor key={isAuthenticated ? 'auth' : 'unauth'} />}
            </div>
          </div>
          <div className="flex-1 flex flex-col min-h-0">
            {isAuthenticated && <ChatInterface key={isAuthenticated ? 'auth' : 'unauth'} />}
          </div>
        </div>
      </main>
      
      <LoginDialog 
        open={showLogin} 
        onLogin={handleLogin} 
        error={loginError}
      />
    </>
  );
}

export default App;
