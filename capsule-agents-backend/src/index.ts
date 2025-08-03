import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { cors } from 'hono/cors';
import { streamText as honoStreamText, stream, streamSSE } from 'hono/streaming';
import { streamText, UIMessage, convertToModelMessages } from 'ai';
import { openai } from '@ai-sdk/openai';
import { fileAccessTool } from './tools/file-access.js';
import { braveSearchTool } from './tools/brave-search.js';
import { memoryTool } from './tools/memory.js';
import { a2aTool } from './tools/a2a.js';
import { createChat, loadChat, saveChat } from './lib/storage.js';
import { getDb } from './lib/db.js'; // Import getDb to ensure tables are created
import { CapsuleAgentA2ARequestHandler } from './lib/a2a-request-handler.js';
import { JsonRpcTransportHandler } from '@a2a-js/sdk/server';

const app = new Hono();

// Initialize A2A request handler
const a2aRequestHandler = new CapsuleAgentA2ARequestHandler();
const jsonRpcHandler = new JsonRpcTransportHandler(a2aRequestHandler);

// Add CORS middleware
app.use('/api/*', cors({
  origin: ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:8080'],
  allowHeaders: ['Content-Type', 'Authorization', 'Cache-Control'],
  allowMethods: ['POST', 'GET', 'OPTIONS'],
  exposeHeaders: ['Content-Type'],
}));

// Add CORS for A2A protocol endpoints (root) - Allow all origins for A2A compatibility
app.use('/', cors({
  origin: '*', // Allow all origins for A2A protocol compatibility
  allowHeaders: ['Content-Type', 'Authorization', 'Cache-Control'],
  allowMethods: ['POST', 'GET', 'OPTIONS'],
  exposeHeaders: ['Content-Type'],
}));

// Initialize database and create tables on startup
getDb();

// A2A Protocol Endpoints

// Agent Card endpoint (A2A spec requirement)
app.get('/.well-known/agent.json', async (c) => {
  try {
    const agentCard = await a2aRequestHandler.getAgentCard();
    return c.json(agentCard);
  } catch (error) {
    return c.json({ error: 'Failed to get agent card' }, 500);
  }
});

// Main A2A JSON-RPC endpoint
app.post('/', async (c) => {
  const body = await c.req.json();
  
  // Check if this is a streaming method
  if (body.method === 'message/stream' || body.method === 'tasks/resubscribe') {
    // Handle streaming methods with SSE
    return streamSSE(c, async (stream) => {
      try {
        if (body.method === 'message/stream') {
          let eventId = 0;
          for await (const event of a2aRequestHandler.sendMessageStream(body.params)) {
            await stream.writeSSE({
              data: JSON.stringify({
                jsonrpc: '2.0',
                id: body.id,
                result: event,
              }),
              id: String(eventId++),
            });
          }
        } else if (body.method === 'tasks/resubscribe') {
          let eventId = 0;
          for await (const event of a2aRequestHandler.resubscribe(body.params)) {
            await stream.writeSSE({
              data: JSON.stringify({
                jsonrpc: '2.0',
                id: body.id,
                result: event,
              }),
              id: String(eventId++),
            });
          }
        }
      } catch (error) {
        await stream.writeSSE({
          data: JSON.stringify({
            jsonrpc: '2.0',
            id: body.id,
            error: {
              code: -32603,
              message: 'Internal error',
              data: error instanceof Error ? error.message : 'Unknown error'
            }
          }),
          id: 'error',
        });
      }
    });
  } else {
    // Handle non-streaming methods with JSON-RPC handler
    const response = await jsonRpcHandler.handle(body);
    return c.json(response);
  }
});

// Regular API endpoints
app.get('/api/health', async (c) => {
  return c.json({ status: 'ok' });
});

app.post('/api/chat/create', async (c) => {
  const { userId } = await c.req.json();
  const chatId = await createChat(userId || 'anonymous');
  return c.json({ chatId });
});

app.post('/api/chat', async (c) => {
  const { messages, chatId }: { messages: UIMessage[], chatId: string } = await c.req.json();

  const chatHistory = await loadChat(chatId);
  const combinedMessages = [...chatHistory, ...messages];

  const tools: any = {};
  if (process.env.FILE_ACCESS_TOOL_ENABLED === 'true') {
    tools.fileAccess = fileAccessTool;
  }
  if (process.env.BRAVE_SEARCH_TOOL_ENABLED === 'true') {
    tools.braveSearch = braveSearchTool;
  }
  if (process.env.MEMORY_TOOL_ENABLED === 'true') {
    tools.memory = memoryTool;
  }
  if (process.env.A2A_TOOL_ENABLED === 'true') {
    tools.a2a = a2aTool;
  }

  const result = streamText({
    model: openai(process.env.OPENAI_API_MODEL || 'gpt-4o'),
    messages: convertToModelMessages(combinedMessages),
    tools,
    onFinish: async ({ text }) => {
      try {
        // Save chat completion - TODO: implement proper message saving
        // Don't log to console as it can corrupt SSE stream
      } catch (error) {
        // Don't log to console as it can corrupt SSE stream
      }
    }
  });

  // Use Hono's streaming helper to properly stream tokens
  return honoStreamText(c, async (stream) => {
    // Iterate over the AI SDK's text stream and write each chunk
    for await (const textPart of result.textStream) {
      await stream.write(textPart);
    }
  });
});

// Serve static files from the frontend build at /editor path
app.use('/editor/*', serveStatic({
  root: './static',
  rewriteRequestPath: (path) => path.replace(/^\/editor/, ''),
}));

// Serve editor at /editor root (for SPA routing)
app.get('/editor', serveStatic({
  root: './static',
  rewriteRequestPath: () => '/index.html',
}));

// Start the server
const port = process.env.PORT ? parseInt(process.env.PORT) : 80;

serve({
  fetch: app.fetch,
  port,
});