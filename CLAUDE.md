# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Local Development (Single Server - Recommended)
The project is configured to run both backend API and frontend from a single FastAPI server (matching Docker behavior).

#### Option 1: VS Code (Recommended)
1. **Build frontend**: Run VS Code task "Build Frontend" or manually:
   ```bash
   cd capy-config-frontend
   npm install && npm run build
   ```

2. **Start with debugger**: Launch "Python Debugger: FastAPI" or "Run Full-Stack Locally (Single Server)" compound configuration
   - Frontend available at: `http://localhost:8000/editor`
   - API available at: `http://localhost:8000/api/*`

#### Option 2: Command Line
```bash
# Build frontend
cd capy-config-frontend
npm install && npm run build
cd ..

# Start backend (serves both API and frontend)
cd backend
uv sync
STATIC_DIR=capy-config-frontend/dist uv run -m uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8000
```

### Separate Frontend Development (Optional)
For frontend-only development with hot reload:
```bash
cd capy-config-frontend
npm install               # Install dependencies
npm run dev              # Start development server
npm run build            # Build for production
npm run lint             # Run ESLint
```

### Docker
```bash
docker build -t peewee-agents .    # Build container
docker run -p 80:80 peewee-agents  # Run on port 80
```

## Architecture Overview

This is a full-stack Agent-to-Agent (A2A) protocol implementation with two main components:

### Backend Structure
- **FastAPI application** implementing A2A JSON-RPC 2.0 protocol
- **Core endpoints**: Task management (`/`), configuration API (`/api/*`), agent metadata (`/.well-known/agent.json`)
- **Services layer**: Agent processing, configuration persistence, SQLite session management
- **A2A protocol methods**: `tasks/send`, `tasks/sendSubscribe`, `tasks/get`, `tasks/cancel`, push notifications
- **Streaming support**: Server-Sent Events for real-time task updates

### Frontend Structure  
- **React 19 + TypeScript** SPA with Vite build system
- **Tailwind CSS 4.x + Radix UI** component library
- **Type-safe API client** with full schema validation in `src/lib/api.ts`
- **Real-time chat interface** with streaming responses via SSE
- **Agent configuration UI** for models, tools, and settings

### Key Communication Patterns
1. **Configuration**: REST API calls between frontend and backend
2. **Agent tasks**: JSON-RPC 2.0 over HTTP with streaming responses
3. **Real-time updates**: Server-Sent Events for task progress
4. **Agent-to-agent**: A2A protocol for inter-agent communication

### Important Files
- `backend/app/main.py` - FastAPI app with A2A protocol endpoints
- `backend/app/schemas.py` - Comprehensive A2A protocol and JSON-RPC schemas
- `backend/app/services/agent_service.py` - Core agent task processing logic
- `capy-config-frontend/src/lib/api.ts` - Type-safe API client
- `capy-config-frontend/src/components/chat-interface.tsx` - Real-time agent communication

### Dependencies
- **Backend**: Google ADK, Google GenAI, LiteLLM for multi-model support
- **Frontend**: React 19, Vite, Tailwind CSS 4.x, Radix UI components
- **Storage**: SQLite for configuration and session persistence

## Important Implementation Notes

### Tool Call Data Flow
- **ADK Runner** automatically persists events to SQLite session service - do NOT manually append events
- **Tool calls are stored** in separate events: `function_call` in one event, `function_response` in another
- **Session history loading** requires collecting function calls across ALL events, then matching by ID
- **Event serialization** requires `.model_dump()` on Pydantic objects before `json.dumps()` 

### Chat Interface State Management  
- **Live messages**: Extract tool calls from task.history using `extractToolCalls()`
- **Session reload**: Process all events to build complete tool call objects before creating UI messages
- **Tool call display**: Uses shadcn components in `ToolCallDisplay` with expandable cards