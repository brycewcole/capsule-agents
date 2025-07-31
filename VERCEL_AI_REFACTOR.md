# Vercel AI SDK v5 Refactor

This document outlines the refactor of the frontend to use Vercel AI SDK v5 with the new Hono backend.

## Changes Made

### 1. Frontend Dependencies
- Added `@ai-sdk/react@^1.1.17` - React hooks for Vercel AI SDK
- Added `ai@^4.3.19` - Core Vercel AI SDK with transport system

### 2. New Architecture Components

#### `/src/lib/chat-api.ts`
- New simplified API layer for chat operations
- `ChatAPI` class with health checks and chat creation
- `ChatStorage` utility for managing chat sessions in localStorage

#### `/src/components/new-chat-interface.tsx`
- Complete rewrite using Vercel AI SDK's `useChat` hook
- Uses `DefaultChatTransport` for streaming communication
- Proper UIMessage format handling for text and tool calls
- Integrated session management with the Hono backend

### 3. Backend Updates

#### `/src/index.ts`
- Added `/api/health` endpoint for frontend connection testing
- Existing `/api/chat` endpoint already compatible with Vercel AI SDK
- Chat persistence with SQLite via `createChat`, `loadChat`, `saveChat`

### 4. Message Format Changes

The new system uses Vercel AI SDK's UIMessage format:
- Messages have `parts` array containing different content types
- Tool calls are represented as `tool-{toolName}` parts
- Text content is in `text` parts
- Streaming happens via Server-Sent Events (SSE)

## Key Benefits

1. **Standardized Protocol**: Uses Vercel AI SDK's standard transport system
2. **Better Streaming**: Built-in SSE support with proper error handling
3. **Type Safety**: Full TypeScript support for messages and tool calls
4. **Simplified Code**: Less custom API layer code to maintain
5. **Better Performance**: Optimized streaming and state management

## Migration Path

1. Update frontend dependencies ✅
2. Replace custom API with Vercel AI transport ✅
3. Update message rendering for UIMessage format ✅
4. Test with new Hono backend ✅

## Usage

### Starting the Backend
```bash
cd capsule-agents-backend
npm run start
```

### Starting the Frontend
```bash
cd capsule-agents-frontend
npm run dev
```

The frontend will connect to the backend at `http://localhost:8000` and use the new streaming chat interface.

## Tool Integration

Tools are now handled through the Vercel AI SDK's tool system:
- Tool calls are streamed as part of the message
- Results are displayed in expandable cards
- Full type safety for tool arguments and results

## Session Management

- Chat sessions are created via `/api/chat/create`
- Session IDs are stored in localStorage
- Chat history is persisted in SQLite database
- New chat button creates fresh sessions