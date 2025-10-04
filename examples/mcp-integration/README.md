# MCP Integration Example

This example demonstrates how to configure Capsule Agents with MCP (Model Context Protocol) servers using the standard MCP configuration format.

## Configuration

The `agent.config.json` file uses the standard `mcpServers` format with support for:

- **HTTP and SSE server types**
- **Environment variable expansion** using `${VAR}` syntax
- **Optional headers** for authentication

### Environment Variables

Environment variables are expanded using these formats:

- `${VAR}` - Expands to the value of VAR (throws error if not set)
- `${VAR:-default}` - Expands to VAR if set, otherwise uses default value

## MCP Servers

This example includes two MCP servers:

### Context7

- **Type**: HTTP
- **URL**: https://mcp.context7.com/mcp
- **Authentication**: Requires `CONTEXT_7_API_KEY` environment variable
- **Purpose**: Access to Context7 documentation and code examples

### Remote MCP

- **Type**: HTTP
- **URL**: https://mcp.remote-mcp.com
- **Authentication**: None
- **Purpose**: Public MCP server demonstration

## Usage

1. Set your Context7 API key:
   ```bash
   export CONTEXT_7_API_KEY="your-api-key-here"
   ```

2. Start the agent:
   ```bash
   docker-compose up
   ```

3. The agent will be available at http://localhost:8001

## Alternative: Using .env File

Create a `.env` file in this directory:

```env
CONTEXT_7_API_KEY=your-api-key-here
```

Then docker-compose will automatically load these variables.
