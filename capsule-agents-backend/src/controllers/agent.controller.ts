import { Hono } from "hono"
import { AgentConfigService } from "../services/agent-config.ts"
import { getBuiltInPromptUsage } from "../lib/default-prompts.ts"

export function createAgentController(agentConfigService: AgentConfigService) {
  const router = new Hono()

  const toAgentResponse = (agentInfo: ReturnType<
    AgentConfigService["getAgentInfo"]
  >) => {
    const defaultPromptUsage = getBuiltInPromptUsage(agentInfo.model_name)
    return {
      name: agentInfo.name,
      description: agentInfo.description,
      modelName: agentInfo.model_name,
      modelParameters: agentInfo.model_parameters,
      capabilities: agentInfo.capabilities,
      builtInPromptsEnabled: agentInfo.built_in_prompts_enabled,
      builtInPrompts: defaultPromptUsage.map((prompt) => ({
        id: prompt.id,
        title: prompt.title,
        text: prompt.text,
        modelFilter: prompt.modelFilter,
        matchesModel: prompt.matchesModel,
        willApply:
          agentInfo.built_in_prompts_enabled && prompt.matchesModel,
      })),
    }
  }

  router.get("/agent", (c) => {
    console.info("GET /api/agent - Getting agent configuration")
    try {
      const agentInfo = agentConfigService.getAgentInfo()
      return c.json(toAgentResponse(agentInfo))
    } catch (error) {
      console.error("Error getting agent info:", error)
      return c.json({ error: "Failed to get agent configuration" }, 500)
    }
  })

  router.put("/agent", async (c) => {
    console.info("PUT /api/agent - Updating agent configuration")
    try {
      const body = await c.req.json()
      const agentInfo = {
        name: body.name,
        description: body.description,
        model_name: body.modelName,
        model_parameters: body.modelParameters || {},
        capabilities: body.capabilities || [],
        built_in_prompts_enabled:
          body.builtInPromptsEnabled !== undefined
            ? !!body.builtInPromptsEnabled
            : true,
      }
      const updatedInfo = agentConfigService.updateAgentInfo(agentInfo)
      return c.json(toAgentResponse(updatedInfo))
    } catch (error) {
      console.error("Error updating agent info:", error)
      return c.json({
        error: error instanceof Error
          ? error.message
          : "Failed to update agent configuration",
      }, 400)
    }
  })

  router.get("/models", (c) => {
    try {
      const models = agentConfigService.getAvailableModels()
      return c.json(models)
    } catch (error) {
      console.error("Error getting models:", error)
      return c.json({ error: "Failed to get available models" }, 500)
    }
  })

  router.get("/providers", (c) => {
    try {
      const providerInfo = agentConfigService.getProviderInfo()
      return c.json(providerInfo)
    } catch (error) {
      console.error("Error getting provider info:", error)
      return c.json({ error: "Failed to get provider information" }, 500)
    }
  })

  return router
}
