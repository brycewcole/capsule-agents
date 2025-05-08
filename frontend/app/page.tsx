import Header from "@/components/header"
import AgentEditor from "@/components/agent-editor"
import MockResponses from "@/components/mock-responses"
import ChatInterface from "@/components/chat-interface"

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col bg-slate-50">
      <Header />
      <div className="container mx-auto flex flex-1 flex-col gap-6 p-4 md:flex-row md:p-6 lg:p-8">
        <div className="flex-1 space-y-6">
          <AgentEditor />
        </div>
        <div className="flex-1 flex flex-col min-h-0">
          <ChatInterface />
        </div>
      </div>
    </main>
  )
}
