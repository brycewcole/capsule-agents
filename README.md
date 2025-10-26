<div align="center">
  <img src="capsule_agents_alpha.png" alt="Capsule Agents Logo" width="240" height="240">
  <h1>Capsule Agents</h1>
  <p><em>containerized agents with simple setup and native A2A interoperability</em></p>
</div>

![status](https://img.shields.io/badge/status-under_development-yellow)
![version](https://img.shields.io/docker/v/brycewcole/capsule-agents)
![Discord](https://img.shields.io/discord/1429513340975190320?style=plastic&logo=discord&logoColor=blueviolet&label=Join%20Us!&labelColor=lightgrey)

> ⚠️ **This project is in an early development stage and is not stable for production use.**

Capsule Agents is designed to make it as easy as possible to create [Agent-to-Agent (A2A) protocol](https://github.com/google/A2A) compatible agents.

**Built for the middle third of agent use cases**: beyond basic chat apps, short of full-scale frameworks.

## Features

- **Prebuilt Tools**: Includes a set of built in capabilities that can be enabled in one click
  - File Access: Read and write files within the agent workspace
  - Memory (Work in Progress): Persistent memory storage for conversations
- **A2A Native**: Designed to work seamlessly with the A2A protocol, making it easy to connect and communicate with other agents using A2A like LangGraph, n8n and many more
- **Remote MCP**: Connect any remote MCP server like Github, Zapier or your own custom server
- **Containerized**: Each agent stores state in a local SQLite database for portability
- **No Code Required**: Create agents using a simple web interface or configuration file

## Quick Start

1. Ensure [Docker](https://docs.docker.com/get-started/get-docker/) is installed on your system

2. **Set up environment variables**
   Create a `.env` file with

```env
# Add one or many (required)
OPENAI_API_KEY=your_key
ANTHROPIC_API_KEY=your_key
GOOGLE_GENERATIVE_AI_API_KEY=your_key

# Optional to restrict access to the configure page
ADMIN_PASSWORD=your_password
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
