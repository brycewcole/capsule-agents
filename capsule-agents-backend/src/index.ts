import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { cors } from 'hono/cors';
import { streamSSE } from 'hono/streaming';
import { createChat } from './lib/storage.js';
import { getDb } from './lib/db.js';
import { CapsuleAgentA2ARequestHandler } from './lib/a2a-request-handler.js';
import { JsonRpcTransportHandler } from '@a2a-js/sdk/server';

// Type guard to check if result is an AsyncGenerator (streaming response)
function isAsyncGenerator(value: any): value is AsyncGenerator<any, void, undefined> {
  return value && typeof value === 'object' && Symbol.asyncIterator in value;
}

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

  try {
    const result = await jsonRpcHandler.handle(body);

    if (isAsyncGenerator(result)) {
      return streamSSE(c, async (stream) => {
        try {
          let eventId = 0;
          for await (const event of result) {
            await stream.writeSSE({
              data: JSON.stringify(event),
              id: String(eventId++),
            });
          }
        } catch (error) {
          await stream.writeSSE({
            data: JSON.stringify({
              jsonrpc: '2.0',
              id: body.id,
              error: {
                code: -32603,
                message: 'Streaming error',
                data: error instanceof Error ? error.message : 'Unknown error'
              }
            }),
            id: 'error',
          });
        }
      });
    } else {
      return c.json(result);
    }
  } catch (error) {
    return c.json({
      jsonrpc: '2.0',
      id: body.id,
      error: {
        code: -32603,
        message: 'Internal error',
        data: error instanceof Error ? error.message : 'Unknown error'
      }
    }, 500);
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