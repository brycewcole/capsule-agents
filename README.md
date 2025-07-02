<div align="center">
  <img src="new-logo.png" alt="Capy Agents Logo" width="120" height="120">
  <h1>Capy Agents</h1>
  <p><em>Open Source, simple agents for an A2A world.</em></p>
</div>

Capy Agents is a framework designed with the goal of making it as easy as possible to create [Agent-to-Agent (A2A) protocol](https://github.com/google/A2A) compatible agents. A Capy Agent can be created in a few seconds using either the built-in GUI or a configuration file. The resulting agent is a single Docker image that can be run anywhere, including on your local machine, in the cloud, or even a Raspberry Pi.

## ✨ Features

- **🛠️ Prebuilt Tools**: Includes a set of prebuilt MCP (Model Context Protocol) servers that can be enabled in one click
  - File Access: Read and write files within the agent workspace
  - Web Search: Powered by Brave Search API
  - Memory: Persistent memory storage for conversations
- **🤝 A2A Native**: Designed to work seamlessly with the A2A protocol, making it easy to connect and communicate with other agents
- **🔒 Secure**: The configuration panel can be password protected for added security
- **📦 Containerized**: Each agent stores state in a local SQLite database for portability
- **No Code Required**: Create agents using a simple web interface or configuration file

## 🚀 Quick Start

### Prerequisites
- Docker and Docker Compose
1. **Clone the repository**
   ```bash
   git clone https://github.com/your-username/peewee-agents.git
   cd peewee-agents
   ```

2. **Set up environment variables**

3. **Build and run**
   ```bash
   docker pull brycewcole/capy-agents:latest
   docker run -e AGENT_URL=http://host.docker.internal:8080 -p 8080:80 -it brycewcole/capy-agents:latest
   ```

4. **Access the agent**
   - Configuration UI: http://localhost:8080/editor
   - Agent endpoint: http://localhost:8080
   - Agent card: http://localhost:8080/.well-known/agent.json

## 🔧 Configuration

### Environment Variables

# TODO
Create a `backend/.env` file with:

```env
# Required
GOOGLE_API_KEY=your_google_api_key_here

# Optional
BRAVE_API_KEY=your_brave_search_api_key  # For web search
```

### Agent Configuration

Configure your agent through the web UI at `/editor` or by directly modifying the SQLite database. Configure:

- **Agent name and description**
- **LLM model** (supports any model via LiteLLM)
- **Tools and capabilities**
  - Prebuilt tools (file access, web search, memory)
  - Custom A2A agent connections
  - MCP server integrations (coming soon)

## 🔗 Agent-to-Agent Communication

Connect agents together by adding A2A tools in the configuration panel:

1. **Add A2A Tool**: In the tools section, click "Add Custom Tool"
2. **Tool Type**: Select "a2a_call" 
3. **Agent URL**: Enter the target agent's URL (e.g., `http://other-agent:8000`)
4. **Save**: The tool will be available to your agent

Your agent can now communicate with other A2A-compatible agents!

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## 📜 License

This project includes portions of code from [A2A](https://github.com/google/A2A) licensed under the Apache License 2.0.*

## 🙏 Acknowledgments

- [Google A2A Protocol](https://github.com/google/A2A) for the agent communication standard
- [Model Context Protocol](https://modelcontextprotocol.io/) for the tool ecosystem
- [Google ADK](https://github.com/google-ai-edge/adk) for the agent development kit
- [LiteLLM](https://github.com/BerriAI/litellm) for multi-model LLM support

**Made with ❤️ for the A2A ecosystem**