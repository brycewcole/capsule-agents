import Header from './components/header'; // Assuming components are in ./components
import AgentEditor from './components/agent-editor'; // Assuming components are in ./components
import ChatInterface from './components/chat-interface'; // Assuming components are in ./components
import PrebuiltToolsSettings from './components/prebuilt-tools-settings'; // Assuming components are in ./components
import './App.css'; // You might want to update or remove this CSS

function App() {
  return (
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
            <AgentEditor />
            <PrebuiltToolsSettings />
          </div>
        </div>
        <div className="flex-1 flex flex-col min-h-0">
          <ChatInterface />
        </div>
      </div>
    </main>
  );
}

export default App;
