import { useState, useEffect } from 'react';
import Header from './components/header';
import ChatInterface from './components/chat-interface';
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
        <div className="container mx-auto flex flex-1 flex-col gap-6 p-4 md:flex-row md:p-6 lg:p-8 min-h-0">
          <div className="flex-1 flex flex-col min-h-0">
            <ChatInterface key={isAuthenticated ? 'auth' : 'unauth'} />
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
