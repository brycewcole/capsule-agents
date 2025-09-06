import { z } from "zod"
import type { AgentInfo } from "./agent-config.ts"
import { Capability } from "./capability-types.ts"

export const ModelConfigSchema = z.object({
  name: z.string().min(1, "Model name is required"),
  parameters: z.record(z.unknown()).optional().default({}),
})

export const BuiltInCapabilityConfigSchema = z.object({
  enabled: z.boolean().default(false),
}).default({ enabled: false })

export const CapabilitiesConfigSchema = z.object({
  web_search: BuiltInCapabilityConfigSchema.optional().default({
    enabled: false,
  }),
  memory: BuiltInCapabilityConfigSchema.optional().default({ enabled: false }),
  file_access: BuiltInCapabilityConfigSchema.optional().default({
    enabled: false,
  }),
})

export const McpServerConfigSchema = z.object({
  url: z.string().url("Invalid MCP server URL"),
  name: z.string().min(1, "MCP server name is required"),
})

export const McpConfigSchema = z.object({
  servers: z.array(McpServerConfigSchema).default([]),
})

export const A2AAgentConfigSchema = z.object({
  name: z.string().min(1, "A2A agent name is required"),
  agent_url: z.string().url("Invalid A2A agent URL"),
})

export const AgentConfigSchema = z.object({
  name: z.string().min(1, "Agent name is required").default("Capsule Agent"),
  description: z.string().default(""),
  model: ModelConfigSchema.optional().default({
    name: "openai/gpt-4o-mini",
    parameters: {},
  }),
  capabilities: CapabilitiesConfigSchema.optional().default({}),
  mcp: McpConfigSchema.optional().default({ servers: [] }),
  a2a: z.array(A2AAgentConfigSchema).optional().default([]),
})

export const ConfigFileSchema = z.object({
  agent: AgentConfigSchema.optional().default({
    name: "Capsule Agent",
    description: "",
    model: { name: "openai/gpt-4o-mini", parameters: {} },
    capabilities: {
      web_search: { enabled: false },
      memory: { enabled: false },
      file_access: { enabled: false },
    },
    mcp: { servers: [] },
    a2a: [],
  }),
})

// TypeScript types derived from schemas
export type ModelConfig = z.infer<typeof ModelConfigSchema>
export type BuiltInCapabilityConfig = z.infer<
  typeof BuiltInCapabilityConfigSchema
>
export type CapabilitiesConfig = z.infer<typeof CapabilitiesConfigSchema>
export type McpServerConfig = z.infer<typeof McpServerConfigSchema>
export type McpConfig = z.infer<typeof McpConfigSchema>
export type A2AAgentConfig = z.infer<typeof A2AAgentConfigSchema>
export type AgentConfig = z.infer<typeof AgentConfigSchema>
export type ConfigFile = z.infer<typeof ConfigFileSchema>

export const BUILTIN_CAPABILITIES = [
  "web_search",
  "memory",
  "file_access",
] as const
export type BuiltInCapabilityName = typeof BUILTIN_CAPABILITIES[number]

// Utility function to transform config file format to internal AgentInfo format
export function transformConfigToAgentInfo(config: AgentConfig): AgentInfo {
  const capabilities: Capability[] = []

  if (config.capabilities) {
    for (const name of BUILTIN_CAPABILITIES) {
      const capabilityConfig = config.capabilities[name]
      if (capabilityConfig?.enabled) {
        capabilities.push({
          type: "prebuilt",
          subtype: name,
        })
      }
    }
  }

  if (config.mcp?.servers) {
    for (const server of config.mcp.servers) {
      capabilities.push({
        name: server.name,
        type: "mcp_server",
        capability_schema: { url: server.url },
      })
    }
  }

  if (config.a2a) {
    for (const agent of config.a2a) {
      capabilities.push({
        name: agent.name,
        type: "a2a_call",
        capability_schema: { agent_url: agent.agent_url },
      })
    }
  }

  return {
    name: config.name,
    description: config.description,
    model_name: config.model.name,
    model_parameters: config.model.parameters,
    capabilities: capabilities,
  }
}

// Utility function to transform internal AgentInfo format back to config file format
export function transformAgentInfoToConfig(agentInfo: AgentInfo): AgentConfig {
  const capabilities: CapabilitiesConfig = {
    web_search: { enabled: false },
    memory: { enabled: false },
    file_access: { enabled: false },
  }
  const mcpServers: McpServerConfig[] = []
  const a2aAgents: A2AAgentConfig[] = []

  for (const capability of agentInfo.capabilities) {
    if (
      capability.type === "prebuilt" &&
      BUILTIN_CAPABILITIES.includes(capability.name as BuiltInCapabilityName)
    ) {
      capabilities[capability.name as BuiltInCapabilityName] = { enabled: true }
    } else if (capability.type === "mcp") {
      mcpServers.push({
        name: capability.name,
        url: capability.serverUrl as string,
        enabled: true,
      })
    } else if (capability.type === "a2a_call") {
      a2aAgents.push({
        name: capability.name,
        agent_url: capability.capability_schema.agent_url as string,
      })
    }
  }

  return {
    name: agentInfo.name,
    description: agentInfo.description,
    model: {
      name: agentInfo.model_name,
      parameters: agentInfo.model_parameters,
    },
    capabilities,
    mcp: { servers: mcpServers },
    a2a: a2aAgents,
  }
}
