import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { cors } from 'hono/cors';
import { streamText, UIMessage, convertToCoreMessages } from 'ai';
import { openai } from '@ai-sdk/openai';
import { fileAccessTool } from './tools/file-access.js';
import { braveSearchTool } from './tools/brave-search.js';
import { memoryTool } from './tools/memory.js';
import { a2aTool } from './tools/a2a.js';
import { createChat, loadChat, saveChat } from './lib/storage.js';
import { getDb } from './lib/db.js'; // Import getDb to ensure tables are created

const app = new Hono();

// Add CORS middleware
app.use('/api/*', cors({
  origin: ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:8080'],
  allowHeaders: ['Content-Type', 'Authorization', 'Cache-Control'],
  allowMethods: ['POST', 'GET', 'OPTIONS'],
  exposeHeaders: ['Content-Type'],
}));

// Initialize database and create tables on startup
getDb();

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
    messages: convertToCoreMessages(combinedMessages),
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

  // Return structured stream using stable API
  return result.toDataStreamResponse();
});

// Serve static files from the frontend build
app.use('/*', serveStatic({ root: './static' }));

// Start the server
const port = process.env.PORT ? parseInt(process.env.PORT) : 80;
console.log(`Server is running on http://localhost:${port}`);

serve({
  fetch: app.fetch,
  port,
});