import { z } from "zod"
import type { AgentInfo } from "./agent-config.ts"
import { Capability as AgentCapability } from "../lib/capability-types.ts"

export const ModelConfigSchema = z.object({
  name: z.string().min(1, "Model name is required"),
  parameters: z.record(z.unknown()).optional().default({}),
})

export const BuiltInCapabilityConfigSchema = z.object({
  enabled: z.boolean().default(false),
}).default({ enabled: false })

export const CapabilitiesConfigSchema = z.object({
  memory: BuiltInCapabilityConfigSchema.optional().default({ enabled: false }),
  exec: BuiltInCapabilityConfigSchema.optional().default({
    enabled: true,
  }),
})

export const A2AAgentConfigSchema = z.object({
  name: z.string().min(1, "A2A agent name is required"),
  agent_url: z.string().url("Invalid A2A agent URL"),
  enabled: z.boolean().default(true),
})

export const ScheduleBackoffConfigSchema = z.object({
  enabled: z.boolean().default(false),
  schedule: z.array(z.number().positive()).optional(),
}).default({ enabled: false })

export const ScheduleConfigSchema = z.object({
  name: z.string().min(1, "Schedule name is required"),
  prompt: z.string().min(1, "Prompt is required"),
  cron_expression: z.string().min(1, "Cron expression is required"),
  enabled: z.boolean().default(true),
  context_id: z.string().optional(),
  backoff: ScheduleBackoffConfigSchema.optional().default({ enabled: false }),
})

export const AgentConfigSchema = z.object({
  name: z.string().min(1, "Agent name is required").default("Capsule Agent"),
  description: z.string().default(""),
  model: ModelConfigSchema.optional(),
  tools: CapabilitiesConfigSchema.optional().default({
    memory: { enabled: false },
    exec: { enabled: true },
  }),
  a2a: z.array(A2AAgentConfigSchema).optional().default([]),
})

export const ConfigFileSchema = z.object({
  agent: AgentConfigSchema.optional().default({
    name: "Capsule Agent",
    description: "",
    tools: {
      memory: { enabled: false },
      exec: { enabled: true },
    },
    a2a: [],
  }),
  // Support top-level mcpServers format (standard MCP config format)
  mcpServers: z.record(
    z.object({
      type: z.enum(["http", "sse"], {
        errorMap: () => ({
          message: "MCP server type must be 'http' or 'sse'",
        }),
      }),
      url: z.string().min(1, "MCP server URL is required"),
      headers: z.record(z.string()).optional(),
    }),
  ).optional().default({}),
  schedules: z.array(ScheduleConfigSchema).optional().default([]),
})

// TypeScript types derived from schemas
export type ModelConfig = z.infer<typeof ModelConfigSchema>
export type BuiltInCapabilityConfig = z.infer<
  typeof BuiltInCapabilityConfigSchema
>
export type CapabilitiesConfig = z.infer<typeof CapabilitiesConfigSchema>
export type A2AAgentConfig = z.infer<typeof A2AAgentConfigSchema>
export type ScheduleBackoffConfig = z.infer<typeof ScheduleBackoffConfigSchema>
export type ScheduleConfig = z.infer<typeof ScheduleConfigSchema>
export type AgentConfig = z.infer<typeof AgentConfigSchema>
export type ConfigFile = z.infer<typeof ConfigFileSchema>

export const BUILTIN_CAPABILITIES = [
  "memory",
  "exec",
] as const
export type BuiltInCapabilityName = typeof BUILTIN_CAPABILITIES[number]

// Utility function to transform config file format to internal AgentInfo format
export function transformConfigToAgentInfo(
  config: AgentConfig,
  mcpServers?: Record<
    string,
    { type: "http" | "sse"; url: string; headers?: Record<string, string> }
  >,
): AgentInfo {
  const capabilities: AgentCapability[] = []

  if (config.tools) {
    for (const name of BUILTIN_CAPABILITIES) {
      const capabilityConfig = config.tools[name]
      if (capabilityConfig?.enabled) {
        capabilities.push({
          name: name,
          enabled: true,
          type: "prebuilt",
          subtype: name,
        })
      }
    }
  }

  // Add MCP servers from top-level mcpServers
  if (mcpServers) {
    for (const [name, config] of Object.entries(mcpServers)) {
      capabilities.push({
        name,
        enabled: true,
        type: "mcp",
        serverUrl: config.url,
        serverType: config.type,
        headers: config.headers,
      })
    }
  }

  if (config.a2a) {
    for (const agent of config.a2a) {
      capabilities.push({
        name: agent.name,
        enabled: agent.enabled,
        type: "a2a",
        agentUrl: agent.agent_url,
      })
    }
  }

  return {
    name: config.name,
    description: config.description,
    model_name: config.model?.name,
    model_parameters: config.model?.parameters,
    capabilities: capabilities,
  }
}

// Utility function to transform internal AgentInfo format back to config file format
export function transformAgentInfoToConfig(agentInfo: AgentInfo): {
  agent: AgentConfig
  mcpServers: Record<
    string,
    { type: "http" | "sse"; url: string; headers?: Record<string, string> }
  >
} {
  const tools: CapabilitiesConfig = {
    memory: { enabled: false },
    exec: { enabled: true },
  }
  const mcpServers: Record<
    string,
    { type: "http" | "sse"; url: string; headers?: Record<string, string> }
  > = {}
  const a2aAgents: A2AAgentConfig[] = []

  for (const capability of agentInfo.capabilities) {
    if (
      capability.type === "prebuilt" &&
      BUILTIN_CAPABILITIES.includes(capability.subtype as BuiltInCapabilityName)
    ) {
      tools[capability.subtype as BuiltInCapabilityName] = {
        enabled: capability.enabled,
      }
    } else if (capability.type === "mcp") {
      mcpServers[capability.name] = {
        type: capability.serverType,
        url: capability.serverUrl,
        ...(capability.headers && { headers: capability.headers }),
      }
    } else if (capability.type === "a2a") {
      a2aAgents.push({
        name: capability.name,
        agent_url: capability.agentUrl,
        enabled: capability.enabled,
      })
    }
  }

  const agentConfig: AgentConfig = {
    name: agentInfo.name,
    description: agentInfo.description,
    tools,
    a2a: a2aAgents,
  }

  if (agentInfo.model_name) {
    agentConfig.model = {
      name: agentInfo.model_name,
      parameters: agentInfo.model_parameters || {},
    }
  }

  return {
    agent: agentConfig,
    mcpServers,
  }
}
