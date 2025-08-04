import { Hono } from 'hono';
// Using Deno's built-in serve - no import needed
import { serveStatic } from 'hono/deno';
import { cors } from 'hono/cors';
import { streamSSE } from 'hono/streaming';
import { createChat } from './lib/storage.ts';
import { getDb } from './lib/db.ts';
import { CapsuleAgentA2ARequestHandler } from './lib/a2a-request-handler.ts';
import { JsonRpcTransportHandler } from '@a2a-js/sdk/server';
import { AgentConfigService } from './lib/agent-config.ts';

// Type guard to check if result is an AsyncGenerator (streaming response)
function isAsyncGenerator(value: unknown): value is AsyncGenerator<unknown, void, undefined> {
  return Boolean(value && typeof value === 'object' && value !== null && Symbol.asyncIterator in value);
}

const app = new Hono();

// Initialize A2A request handler
console.log('Creating A2A request handler...');
const a2aRequestHandler = new CapsuleAgentA2ARequestHandler();
console.log('A2A request handler created successfully');

console.log('Creating JSON-RPC handler...');
const jsonRpcHandler = new JsonRpcTransportHandler(a2aRequestHandler);
console.log('JSON-RPC handler created successfully');

// Initialize agent config service
const agentConfigService = new AgentConfigService();

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
console.log('Initializing database...');
try {
  getDb();
  console.log('Database initialized successfully');
} catch (error) {
  console.error('Failed to initialize database:', error);
  throw error;
}

app.get('/.well-known/agent.json', async (c) => {
  console.log('GET /.well-known/agent.json - Getting agent card');
  try {
    const agentCard = await a2aRequestHandler.getAgentCard();
    console.log('Agent card retrieved successfully:', { name: agentCard.name, skillCount: agentCard.skills.length });
    return c.json(agentCard);
  } catch (error) {
    console.error('Failed to get agent card:', error);
    return c.json({ error: 'Failed to get agent card' }, 500);
  }
});

// Main A2A JSON-RPC endpoint
app.post('/', async (c) => {
  console.log('POST / - A2A JSON-RPC endpoint called');
  
  let body;
  try {
    body = await c.req.json();
    console.log('JSON-RPC request parsed:', { 
      method: body.method, 
      id: body.id, 
      hasParams: !!body.params 
    });
  } catch (error) {
    console.error('Failed to parse JSON-RPC request body:', error);
    return c.json({
      jsonrpc: '2.0',
      id: null,
      error: {
        code: -32700,
        message: 'Parse error',
        data: error instanceof Error ? error.message : 'Invalid JSON'
      }
    }, 400);
  }

  try {
    console.log('Calling JSON-RPC handler...');
    const result = await jsonRpcHandler.handle(body);
    console.log('JSON-RPC handler returned:', { 
      type: typeof result, 
      isAsyncGenerator: isAsyncGenerator(result) 
    });

    if (isAsyncGenerator(result)) {
      console.log('Starting SSE stream for method:', body.method);
      return streamSSE(c, async (stream) => {
        try {
          let eventId = 0;
          for await (const event of result) {
            console.log('Streaming event:', { eventId, eventType: (event && typeof event === 'object' && 'kind' in event) ? event.kind : typeof event });
            await stream.writeSSE({
              data: JSON.stringify(event),
              id: String(eventId++),
            });
          }
          console.log('SSE stream completed successfully');
        } catch (streamError) {
          console.error('SSE streaming error:', streamError);
          await stream.writeSSE({
            data: JSON.stringify({
              jsonrpc: '2.0',
              id: body.id,
              error: {
                code: -32603,
                message: 'Streaming error',
                data: streamError instanceof Error ? streamError.message : 'Unknown streaming error'
              }
            }),
            id: 'error',
          });
        }
      });
    } else {
      console.log('Returning JSON-RPC response');
      return c.json(result);
    }
  } catch (error) {
    console.error('JSON-RPC handler error:', error);
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
app.get('/api/health', (c) => {
  return c.json({ status: 'ok' });
});

app.post('/api/chat/create', async (c) => {
  const { userId } = await c.req.json();
  const chatId = createChat(userId || 'anonymous');
  return c.json({ chatId });
});

// Agent configuration endpoints
app.get('/api/agent', (c) => {
  console.log('GET /api/agent - Getting agent configuration');
  try {
    const agentInfo = agentConfigService.getAgentInfo();
    console.log('Agent info retrieved:', { 
      name: agentInfo.name, 
      modelName: agentInfo.model_name, 
      toolCount: agentInfo.tools.length 
    });
    
    // Transform to match frontend expectations
    const response = {
      name: agentInfo.name,
      description: agentInfo.description,
      modelName: agentInfo.model_name, // Transform model_name to modelName
      modelParameters: agentInfo.model_parameters,
      tools: agentInfo.tools
    };
    
    return c.json(response);
  } catch (error) {
    console.error('Error getting agent info:', error);
    return c.json({ error: 'Failed to get agent configuration' }, 500);
  }
});

app.put('/api/agent', async (c) => {
  console.log('PUT /api/agent - Updating agent configuration');
  try {
    const body = await c.req.json();
    console.log('Update request received:', { 
      name: body.name, 
      modelName: body.modelName, 
      toolCount: body.tools?.length || 0 
    });
    
    // Transform from frontend format to backend format
    const agentInfo = {
      name: body.name,
      description: body.description,
      model_name: body.modelName, // Transform modelName back to model_name
      model_parameters: body.modelParameters || {},
      tools: body.tools || []
    };
    
    console.log('Calling agentConfigService.updateAgentInfo...');
    const updatedInfo = agentConfigService.updateAgentInfo(agentInfo);
    console.log('Agent info updated successfully');
    
    // Transform back to frontend format
    const response = {
      name: updatedInfo.name,
      description: updatedInfo.description,
      modelName: updatedInfo.model_name,
      modelParameters: updatedInfo.model_parameters,
      tools: updatedInfo.tools
    };
    
    return c.json(response);
  } catch (error) {
    console.error('Error updating agent info:', error);
    return c.json({ error: error instanceof Error ? error.message : 'Failed to update agent configuration' }, 400);
  }
});

app.get('/api/models', (c) => {
  try {
    const models = agentConfigService.getAvailableModels();
    return c.json(models);
  } catch (error) {
    console.error('Error getting models:', error);
    return c.json({ error: 'Failed to get available models' }, 500);
  }
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

// Start the server using Deno's built-in serve
const port = parseInt(Deno.env.get('PORT') || '80');

console.log(`Starting server on port ${port}...`);
Deno.serve({ port }, app.fetch);