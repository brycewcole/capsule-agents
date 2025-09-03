// Base interface for all tools
export interface BaseTool {
  name: string
  enabled: boolean
  type: "prebuilt" | "a2a" | "mcp"
}

// Prebuilt tools - these are tools that have code inside the app
export interface PrebuiltTool extends BaseTool {
  type: "prebuilt"
  subtype: "file_access" | "brave_search" | "memory"
}

// A2A tools - these represent connections to other AI agents via the a2a protocol
export interface A2ATool extends BaseTool {
  type: "a2a"
  agentUrl: string
}

// MCP tools - these are remote MCP servers (SSE or Streamable only)
export interface MCPTool extends BaseTool {
  type: "mcp"
  serverUrl: string
}

// Union type for all tool types
export type Tool = PrebuiltTool | A2ATool | MCPTool

// Type guard functions
export function isPrebuiltTool(tool: Tool): tool is PrebuiltTool {
  return tool.type === "prebuilt"
}

export function isA2ATool(tool: Tool): tool is A2ATool {
  return tool.type === "a2a"
}

export function isMCPTool(tool: Tool): tool is MCPTool {
  return tool.type === "mcp"
}

