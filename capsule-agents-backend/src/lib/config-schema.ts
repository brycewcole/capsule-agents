import { z } from 'zod';
import type { AgentInfo, Tool } from './agent-config.ts';

export const ModelConfigSchema = z.object({
  name: z.string().min(1, "Model name is required"),
  parameters: z.record(z.unknown()).optional().default({})
});

export const BuiltInToolConfigSchema = z.object({
  enabled: z.boolean().default(false)
}).default({ enabled: false });

export const ToolsConfigSchema = z.object({
  web_search: BuiltInToolConfigSchema.optional().default({ enabled: false }),
  memory: BuiltInToolConfigSchema.optional().default({ enabled: false }),
  file_access: BuiltInToolConfigSchema.optional().default({ enabled: false })
});

export const McpServerConfigSchema = z.object({
  url: z.string().url("Invalid MCP server URL"),
  name: z.string().min(1, "MCP server name is required")
});

export const McpConfigSchema = z.object({
  servers: z.array(McpServerConfigSchema).default([])
});

export const A2AAgentConfigSchema = z.object({
  name: z.string().min(1, "A2A agent name is required"),
  agent_url: z.string().url("Invalid A2A agent URL")
});

export const AgentConfigSchema = z.object({
  name: z.string().min(1, "Agent name is required").default("Capsule Agent"),
  description: z.string().default(""),
  model: ModelConfigSchema.optional().default({ name: "openai/gpt-4o-mini", parameters: {} }),
  tools: ToolsConfigSchema.optional().default({}),
  mcp: McpConfigSchema.optional().default({ servers: [] }),
  a2a: z.array(A2AAgentConfigSchema).optional().default([])
});

export const ConfigFileSchema = z.object({
  agent: AgentConfigSchema.optional().default({
    name: "Capsule Agent",
    description: "",
    model: { name: "openai/gpt-4o-mini", parameters: {} },
    tools: {
      web_search: { enabled: false },
      memory: { enabled: false },
      file_access: { enabled: false }
    },
    mcp: { servers: [] },
    a2a: []
  })
});

// TypeScript types derived from schemas
export type ModelConfig = z.infer<typeof ModelConfigSchema>;
export type BuiltInToolConfig = z.infer<typeof BuiltInToolConfigSchema>;
export type ToolsConfig = z.infer<typeof ToolsConfigSchema>;
export type McpServerConfig = z.infer<typeof McpServerConfigSchema>;
export type McpConfig = z.infer<typeof McpConfigSchema>;
export type A2AAgentConfig = z.infer<typeof A2AAgentConfigSchema>;
export type AgentConfig = z.infer<typeof AgentConfigSchema>;
export type ConfigFile = z.infer<typeof ConfigFileSchema>;

export const BUILTIN_TOOLS = ['web_search', 'memory', 'file_access'] as const;
export type BuiltInToolName = typeof BUILTIN_TOOLS[number];

// Utility function to transform config file format to internal AgentInfo format
export function transformConfigToAgentInfo(config: AgentConfig): AgentInfo {
  const tools: Tool[] = [];

  if (config.tools) {
    for (const toolName of BUILTIN_TOOLS) {
      const toolConfig = config.tools[toolName];
      if (toolConfig?.enabled) {
        tools.push({
          name: toolName,
          type: 'prebuilt',
          tool_schema: { type: toolName }
        });
      }
    }
  }

  if (config.mcp?.servers) {
    for (const server of config.mcp.servers) {
      tools.push({
        name: server.name,
        type: 'mcp_server',
        tool_schema: { url: server.url }
      });
    }
  }

  if (config.a2a) {
    for (const agent of config.a2a) {
      tools.push({
        name: agent.name,
        type: 'a2a_call',
        tool_schema: { agent_url: agent.agent_url }
      });
    }
  }

  return {
    name: config.name,
    description: config.description,
    model_name: config.model.name,
    model_parameters: config.model.parameters,
    tools
  };
}

// Utility function to transform internal AgentInfo format back to config file format
export function transformAgentInfoToConfig(agentInfo: AgentInfo): AgentConfig {
  const tools: ToolsConfig = {
    web_search: { enabled: false },
    memory: { enabled: false },
    file_access: { enabled: false }
  };
  const mcpServers: McpServerConfig[] = [];
  const a2aAgents: A2AAgentConfig[] = [];

  for (const tool of agentInfo.tools) {
    if (tool.type === 'prebuilt' && BUILTIN_TOOLS.includes(tool.name as BuiltInToolName)) {
      tools[tool.name as BuiltInToolName] = { enabled: true };
    } else if (tool.type === 'mcp_server') {
      mcpServers.push({
        name: tool.name,
        url: tool.tool_schema.url as string
      });
    } else if (tool.type === 'a2a_call') {
      a2aAgents.push({
        name: tool.name,
        agent_url: tool.tool_schema.agent_url as string
      });
    }
  }

  return {
    name: agentInfo.name,
    description: agentInfo.description,
    model: {
      name: agentInfo.model_name,
      parameters: agentInfo.model_parameters
    },
    tools,
    mcp: { servers: mcpServers },
    a2a: a2aAgents
  };
}