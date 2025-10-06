<div align="center">
  <img src="capsule_agents_alpha.png" alt="Capsule Agents Logo" width="240" height="240">
  <h1>Capsule Agents</h1>
  <p><em>Simple, containerized agents for an A2A world.</em></p>
</div>

![status](https://img.shields.io/badge/status-under_development-yellow)
![not ready](https://img.shields.io/badge/production-ready_❌-red)

> ⚠️ **This project is in an early development stage and is not stable for production use.**

Capsule Agents is a framework designed with the goal of making it as easy as possible to create [Agent-to-Agent (A2A) protocol](https://github.com/google/A2A) compatible agents.

## Features

- **Prebuilt Tools**: Includes a set of built in capabilities that can be enabled in one click
  - File Access: Read and write files within the agent workspace
  - Web Search: Powered by Brave Search API
  - Memory (Work in Progress): Persistent memory storage for conversations
- **A2A Native**: Designed to work seamlessly with the A2A protocol, making it easy to connect and communicate with other agents using A2A like LangGraph, n8n and many more
- **Remote MCP**: Connect any remote MCP server like Github, Zapier or your own custom server
- **Containerized**: Each agent stores state in a local SQLite database for portability
- **No Code Required**: Create agents using a simple web interface or configuration file

## 🚀 Quick Start

1. Ensure [Docker](https://docs.docker.com/get-started/get-docker/) is installed on your system

2. **Set up environment variables**
   Create a `.env` file with

```env
# Required for OpenAI
OPENAI_API_KEY=sk-abc123

# Required for Search
BRAVE_API_KEY=your_brave_search_api_key

# Used to restrict access to the configure page
ADMIN_PASSWORD=admin
```

3. **Run!**
   ```bash
   docker run --env-file .env -e AGENT_URL=http://localhost:8080 -p 8080:80 -it brycewcole/capsule-agents:latest
   ```

4. **Access the agent**
   - Configuration UI: http://localhost:8080/editor
   - Agent endpoint: http://localhost:8080

## Examples

Explore the [examples directory](./examples) for pre-configured agents like a GitHub Manager and a multi-agent setup.

## License

This project includes portions of code from [A2A](https://github.com/google/A2A) licensed under the Apache License 2.0.*

**Made with ❤️ for the A2A ecosystem**
