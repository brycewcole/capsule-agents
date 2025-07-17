<div align="center">
  <img src="new-logo.png" alt="Capy Agents Logo" width="120" height="120">
  <h1>Capy Agents</h1>
  <p><em>Open Source, simple agents for an A2A world.</em></p>
</div>

![status](https://img.shields.io/badge/status-under_development-yellow)
![not ready](https://img.shields.io/badge/production-ready_❌-red)

> ⚠️ **This project is in an early development stage and is not stable for production use.**

Capy Agents is a framework designed with the goal of making it as easy as possible to create [Agent-to-Agent (A2A) protocol](https://github.com/google/A2A) compatible agents wraped in a single docker container.

## Features

- **Prebuilt Tools**: Includes a set of prebuilt MCP (Model Context Protocol) servers that can be enabled in one click
  - File Access: Read and write files within the agent workspace
  - Web Search: Powered by Brave Search API
  - Memory: Persistent memory storage for conversations
- **A2A Native**: Designed to work seamlessly with the A2A protocol, making it easy to connect and communicate with other agents
- **Containerized**: Each agent stores state in a local SQLite database for portability
- **Remote MCP**: Connect any remote MCP server
- **No Code Required**: Create agents using a simple web interface or soon configuration file

## 🚀 Quick Start

1. Ensure [Docker](https://docs.docker.com/get-started/get-docker/) is installed on your system

2. **Set up environment variables**
  Create a `.env` file with
  
  ```env
  # Required for OpenAI
  OPENAI_API_KEY=sk-abc123
  
  # Required for Search
  BRAVE_API_KEY=your_brave_search_api_key
  
  # Optional but highly recommended, used to restrict access to the configure page
  ADMIN_PASSWORD=admin
  ```

3. **Run!**
   ```bash
   docker run -e AGENT_URL=http://host.docker.internal:8080 -p 8080:80 -it brycewcole/capy-agents:latest
   ```

3. **Access the agent**
   - Configuration UI: http://localhost:8080/editor
   - Agent endpoint: http://localhost:8080


## 🔗 Agent-to-Agent Communication

Connect agents together by adding A2A tools in the configuration panel:

1. **Add A2A Tool**: In the tools section, click "Add Custom Tool"
2. **Tool Type**: Select "a2a" 
3. **Agent URL**: Enter the target agent's URL (e.g., `http://localhost:8001`)
4. **Save**: The tool will be available to your agent

Your agent can now communicate with other A2A-compatible agents!


## License

This project includes portions of code from [A2A](https://github.com/google/A2A) licensed under the Apache License 2.0.*

**Made with ❤️ for the A2A ecosystem**
