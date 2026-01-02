"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { HooksConfig } from "./hooks-config.tsx"
import { getAgentInfo, type HookConfig, updateAgentInfo } from "../lib/api.ts"

export function HooksManager() {
  const [hooks, setHooks] = useState<HookConfig[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const fetchHooks = async () => {
      try {
        const agentInfo = await getAgentInfo()
        setHooks(agentInfo.hooks ?? [])
      } catch (error) {
        console.error("Failed to fetch hooks:", error)
        toast.error("Error loading hooks", {
          description: "Could not load hooks configuration.",
        })
      } finally {
        setIsLoading(false)
      }
    }

    fetchHooks()
  }, [])

  const handleHooksChange = async (newHooks: HookConfig[]) => {
    try {
      setHooks(newHooks)

      // Fetch current agent info to preserve other settings
      const currentAgentInfo = await getAgentInfo()

      // Update with new hooks
      await updateAgentInfo({
        ...currentAgentInfo,
        hooks: newHooks,
      })

      toast.success("Hooks updated")
    } catch (error) {
      console.error("Error saving hooks:", error)
      toast.error("Error saving hooks", {
        description: "Failed to save hooks configuration.",
      })
    }
  }

  if (isLoading) {
    return null
  }

  return <HooksConfig hooks={hooks} onChange={handleHooksChange} />
}
