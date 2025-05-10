import { useState, useEffect } from "react"
import { checkHealth } from "@/lib/api/agent-api"

export default function Header() {
  const [agentStatus, setAgentStatus] = useState<'online' | 'offline'>('offline')

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const health = await checkHealth()
        setAgentStatus(health.status === 'ok' ? 'online' : 'offline')
      } catch (error) {
        setAgentStatus('offline')
      }
    }

    checkStatus()
    // Poll every 30 seconds
    const intervalId = setInterval(checkStatus, 30000)
    
    return () => clearInterval(intervalId)
  }, [])

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-white">
      <div className="container flex h-14 items-center px-4 sm:px-6 lg:px-8">
        <div className="flex flex-1 items-center gap-3 text-sm">
          <h1 className="text-lg font-semibold">Peewee Agents</h1>
          <div className="flex items-center gap-1">
            <div 
              className={`h-2 w-2 rounded-full ${
                agentStatus === 'online' ? 'bg-green-500' : 'bg-red-500'
              }`}
            />
            <span className="text-xs text-muted-foreground">
              {agentStatus === 'online' ? 'Online' : 'Offline'}
            </span>
          </div>
        </div>
        <nav className="flex items-center gap-3 text-sm">
          <a
            href="https://github.com/yourorg/peewee-agents"
            target="_blank"
            rel="noreferrer"
            className="text-muted-foreground hover:text-foreground"
          >
            GitHub
          </a>
        </nav>
      </div>
    </header>
  )
}