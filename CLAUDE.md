# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Capsule Agents is a framework for creating Agent-to-Agent (A2A) protocol compatible agents wrapped in Docker containers. The project consists of a Deno-based backend API and a React frontend built with Vite and Deno.

## Architecture

### Backend (`capsule-agents-backend/`)

- **Framework**: Hono web server running on Deno
- **Language**: TypeScript
- **Database**: SQLite with better-sqlite3 (`jsr:@db/sqlite`)
- **Key Dependencies**:
  - A2A SDK (`@a2a-js/sdk`) for agent protocol compatibility
  - AI SDK (`ai`, `@ai-sdk/*`) for LLM integrations (OpenAI, Anthropic, Google)
  - Zod for schema validation

### Frontend (`capsule-agents-frontend/`)

- **Framework**: React with TypeScript
- **Build Tool**: Vite running on Deno
- **UI**: Radix UI components with Tailwind CSS
- **State**: React hooks with local storage persistence
- **Key Features**: Agent editor, chat interface, conversation management

### Core Components

1. **A2A Protocol Handler** (`src/lib/a2a-request-handler.ts`): Implements A2A protocol for agent communication
2. **Agent Configuration** (`src/lib/agent-config.ts`): Manages agent settings, models, and tools
3. **Storage Layer** (`src/lib/storage.ts`): SQLite-based persistence for chats and agent data
4. **Task Service** (`src/lib/task-service.ts`): Handles A2A task execution and streaming
5. **Tool System** (`src/tools/`): Built-in tools for file access and memory

## Docker Development

### Production Build

The project uses a multi-stage Docker build:

```bash
# Build image
docker build -t capsule-agents .

# Run with environment file
docker run --env-file .env -p 8080:80 capsule-agents
```

### Development Setup with Bind Mounts

For development, use bind mounts to enable hot reload and live code changes without rebuilding containers:

#### Docker Compose Development Setup

```yaml
services:
  capsule-agents-dev:
    build: .
    ports:
      - "8080:80"
    env_file:
      - .env
    volumes:
      # Backend source code and config for hot reload
      - ./capsule-agents-backend/src:/app/src
      - ./capsule-agents-backend/deno.json:/app/deno.json
      # Frontend built output (updated by build watch)
      - ./capsule-agents-frontend/dist:/app/static
      # Prevent node_modules conflicts
      - /app/node_modules
    command: [
      "deno",
      "run",
      "--allow-all",
      "--watch",
      "--node-modules-dir",
      "--no-lock",
      "src/index.ts",
    ]
```

Run with:

```bash
docker-compose -f docker-compose.dev.yml up --build
```

#### Development Workflow

1. **Initial Setup**:
   ```bash
   # Build frontend to create dist/ directory
   cd capsule-agents-frontend && deno task build
   ```

2. **Start Development Environment**:
   ```bash
   # Terminal 1: Start containerized backend
   docker-compose -f docker-compose.dev.yml up --build

   # Terminal 2: Start frontend build watch
   cd capsule-agents-frontend && deno task build --watch
   ```

## Environment Configuration

Required environment variables (create `.env` file):

```
OPENAI_API_KEY=sk-your-openai-key
ADMIN_PASSWORD=admin
```

## API Endpoints

### A2A Protocol

- `GET /.well-known/agent.json` - Agent card/capabilities
- `POST /` - JSON-RPC A2A endpoint with SSE streaming support

### Agent Management

- `GET /api/agent` - Get agent configuration
- `PUT /api/agent` - Update agent configuration
- `GET /api/models` - Get available AI models

### Chat Management

- `GET /api/chats` - List user chats
- `GET /api/chats/:contextId` - Get specific chat with history
- `DELETE /api/chats/:contextId` - Delete chat
- `PATCH /api/chats/:contextId` - Update chat metadata

### UI

- `/editor` - Agent configuration interface

## Code Conventions

- **Formatting**: Deno fmt (2 spaces, no semicolons, double quotes)
- **Linting**: Deno lint with recommended rules
- **Imports**: Use JSR imports for Deno packages, npm: for Node packages
- **File Structure**: Organized by feature in `src/lib/` and `src/tools/`
- **Error Handling**: Comprehensive logging with `@std/log`, structured error responses
- **Type Safety**: Zod schemas for runtime validation, strict TypeScript
- DO NOT use `any` type for backend

## Database Schema

SQLite database stored in `/app/data/` (containerized) with tables:

- `chats` - Chat metadata and conversation history
- `tasks` - A2A task execution records
- `agent_config` - Agent configuration persistence

## Tool System

Built-in MCP-compatible tools:

- **File Access**: Read/write files in agent workspace
- **Memory**: Persistent conversation memory
- **A2A**: Communication with other agents

Tools are dynamically loaded and configured via the agent editor interface.
