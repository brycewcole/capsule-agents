import Header from './components/header'; // Assuming components are in ./components
import AgentEditor from './components/agent-editor'; // Assuming components are in ./components
import ChatInterface from './components/chat-interface'; // Assuming components are in ./components
import './App.css'; // You might want to update or remove this CSS

function App() {
  return (
    <main className="flex h-screen flex-col bg-slate-50 overflow-hidden">
      <Header />
      <div className="container mx-auto flex flex-1 flex-col gap-6 p-4 md:flex-row md:p-6 lg:p-8 min-h-0">
        <div className="flex-1 space-y-6">
          <AgentEditor />
        </div>
        <div className="flex-1 flex flex-col min-h-0">
          <ChatInterface />
        </div>
      </div>
    </main>
  );
}

export default App;
