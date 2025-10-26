// Base interface for all capabilities
export interface BaseCapability {
  name: string
  enabled: boolean
  type: "prebuilt" | "a2a" | "mcp"
}

// Prebuilt capabilities - these are capabilities that have code inside the app
export interface PrebuiltCapability extends BaseCapability {
  type: "prebuilt"
  subtype: "exec" | "memory"
}

// A2A capabilities - these represent connections to other AI agents via the a2a protocol
export interface A2ACapability extends BaseCapability {
  type: "a2a"
  agentUrl: string
}

// MCP capabilities - these are remote MCP servers (SSE or HTTP)
export interface MCPCapability extends BaseCapability {
  type: "mcp"
  serverUrl: string
  serverType: "http" | "sse"
  headers?: Record<string, string>
}

// Union type for all capability types
export type Capability = PrebuiltCapability | A2ACapability | MCPCapability

// Type guard functions
export function isPrebuiltCapability(
  capability: Capability,
): capability is PrebuiltCapability {
  return capability.type === "prebuilt"
}

export function isA2ACapability(
  capability: Capability,
): capability is A2ACapability {
  return capability.type === "a2a"
}

export function isMCPCapability(
  capability: Capability,
): capability is MCPCapability {
  return capability.type === "mcp"
}
