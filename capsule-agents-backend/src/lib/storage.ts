import { getDb } from './db.ts';
import type { UIMessage } from 'ai';
import { v4 as uuidv4 } from 'uuid';
import * as log from "@std/log";

const APP_NAME = 'capsule-agents-backend';

export function createChat(userId: string): string {
  const db = getDb();
  const contextId = uuidv4();
  const now = Date.now() / 1000;

  const stmt = db.prepare(
    'INSERT INTO contexts (app_name, user_id, id, state, create_time, update_time) VALUES (?, ?, ?, ?, ?, ?)'
  );
  stmt.run(APP_NAME, userId, contextId, JSON.stringify({}), now, now);

  return contextId;
}

export function createChatWithId(contextId: string, userId: string): void {
  log.info(`createChatWithId called with contextId: "${contextId}", userId: "${userId}"`);
  
  if (!contextId) {
    log.error('createChatWithId called with empty contextId!');
    return;
  }
  
  const db = getDb();
  const now = Date.now() / 1000;

  const stmt = db.prepare(
    'INSERT OR IGNORE INTO contexts (app_name, user_id, id, state, create_time, update_time) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const result = stmt.run(APP_NAME, userId, contextId, JSON.stringify({}), now, now);
  log.info(`createChatWithId result: ${(result as any).changes} rows affected`);
}

export function loadChat(contextId: string): UIMessage[] {
  const db = getDb();
  const stmt = db.prepare('SELECT id, author, content, timestamp FROM events WHERE context_id = ? ORDER BY timestamp ASC');
  const rows = stmt.all(contextId) as { id: string; author: string; content: string; timestamp: number }[];

  return rows.map(row => {
    const msg = JSON.parse(row.content) as any;
    // Attach DB metadata for frontend timeline features
    if (msg && typeof msg === 'object') {
      if (!msg.id) msg.id = row.id;
      (msg as any).timestamp = row.timestamp;
      if (!msg.role && row.author) (msg as any).role = row.author === 'assistant' ? 'assistant' : row.author;
    }
    return msg as UIMessage;
  });
}

export function saveChat(contextId: string, messages: UIMessage[]): void {
  log.info(`saveChat called with contextId: "${contextId}", messages: ${messages.length}`);
  
  if (!contextId) {
    log.error('saveChat called with empty contextId!');
    return;
  }
  
  const db = getDb();
  
  // Get existing message IDs to avoid duplicates
  const existingIds = new Set(
    (db.prepare('SELECT id FROM events WHERE context_id = ?').all(contextId) as { id: string }[])
      .map(row => row.id)
  );

  // Only insert new messages
  const newMessages = messages.filter(msg => !existingIds.has(msg.id));
  
  if (newMessages.length === 0) {
    // Still update the context timestamp even if no new messages
    const updateStmt = db.prepare('UPDATE contexts SET update_time = ? WHERE id = ?');
    updateStmt.run(Date.now() / 1000, contextId);
    return;
  }

  const stmt = db.prepare(
    'INSERT INTO events (id, app_name, user_id, context_id, author, content, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );

  const insert = db.transaction((msgs: UIMessage[]) => {
    for (const message of msgs) {
      const author = message.role;
      stmt.run(
        message.id,
        APP_NAME,
        'user', // Assuming a single user for now
        contextId,
        author,
        JSON.stringify(message),
        Date.now() / 1000
      );
    }
  });

  insert(newMessages);

  // Also update the context's update_time
  const updateStmt = db.prepare('UPDATE contexts SET update_time = ? WHERE id = ?');
  updateStmt.run(Date.now() / 1000, contextId);
}

// Types for chat management
export interface ChatSummary {
  id: string;
  title: string;
  lastActivity: number;
  messageCount: number;
  preview: string;
  createTime: number;
}

export interface ChatWithHistory {
  contextId: string;
  title: string;
  messages: UIMessage[];
  tasks: any[];
  metadata: Record<string, any>;
  createTime: number;
  updateTime: number;
}

// Extract text from a Vercel UIMessage, handling both legacy {content} and current {parts}
function extractTextFromUIMessage(msg: any): string {
  if (msg == null) return '';
  if (typeof msg.content === 'string' && msg.content.length > 0) return msg.content;
  // Vercel UIMessage: parts: [{ type: 'text', text: string }, ...]
  if (Array.isArray(msg.parts)) {
    return msg.parts
      .map((p: any) => (typeof p?.text === 'string' ? p.text : ''))
      .join('')
      .trim();
  }
  return '';
}

// Extract or generate a title from the first user message
function extractChatTitle(messages: UIMessage[]): string {
  const firstUserMessage = messages.find((m: any) => m.role === 'user');
  const text = extractTextFromUIMessage(firstUserMessage);
  if (text) {
    const title = text.slice(0, 50).trim();
    return title.length < text.length ? title + '...' : title;
  }
  return 'New Chat';
}

// Get a preview of the last message
function getMessagePreview(messages: UIMessage[]): string {
  if (messages.length === 0) return 'No messages';
  const lastMessage: any = messages[messages.length - 1];
  const text = extractTextFromUIMessage(lastMessage);
  if (!text) return 'No content';
  const preview = text.slice(0, 100).trim();
  return preview.length < text.length ? preview + '...' : preview;
}

// Get list of all chats for a user
export function getChatsList(userId: string = 'user'): ChatSummary[] {
  try {
    const db = getDb();
    
    log.info(`Getting chats for userId: ${userId}, app_name: ${APP_NAME}`);
    
    // First, let's see what's actually in the contexts table
    const allContextsStmt = db.prepare(`SELECT id, app_name, user_id, create_time FROM contexts LIMIT 10`);
    const allContexts = allContextsStmt.all();
    log.info('Sample contexts in database:', allContexts);
    
    // Get all contexts for the user
    const contextsStmt = db.prepare(`
      SELECT id, state, create_time, update_time 
      FROM contexts 
      WHERE app_name = ? AND user_id = ? 
      ORDER BY update_time DESC
    `);
    const contexts = contextsStmt.all(APP_NAME, userId) as Array<{
      id: string;
      state: string;
      create_time: number;
      update_time: number;
    }>;

    log.info(`Found ${contexts.length} contexts for user ${userId}:`, contexts.map(c => ({ id: c.id, update_time: c.update_time })));
    
    // Also try with 'anonymous' user_id (might be what was used before)
    const anonymousContextsStmt = db.prepare(`
      SELECT id, state, create_time, update_time 
      FROM contexts 
      WHERE app_name = ? AND user_id = ? 
      ORDER BY update_time DESC
    `);
    const anonymousContexts = anonymousContextsStmt.all(APP_NAME, 'anonymous') as Array<{
      id: string;
      state: string;
      create_time: number;
      update_time: number;
    }>;
    log.info(`Found ${anonymousContexts.length} contexts for user 'anonymous':`, anonymousContexts.map(c => ({ id: c.id, update_time: c.update_time })));
    
    // Also try with 'a2a-agent' user_id (used by A2A requests)
    const a2aContextsStmt = db.prepare(`
      SELECT id, state, create_time, update_time 
      FROM contexts 
      WHERE app_name = ? AND user_id = ? 
      ORDER BY update_time DESC
    `);
    const a2aContexts = a2aContextsStmt.all(APP_NAME, 'a2a-agent') as Array<{
      id: string;
      state: string;
      create_time: number;
      update_time: number;
    }>;
    log.info(`Found ${a2aContexts.length} contexts for user 'a2a-agent':`, a2aContexts.map(c => ({ id: c.id, update_time: c.update_time })));
    
    // Merge and de-duplicate by context id, prefer latest update_time
    const dedupMap = new Map<string, { id: string; state: string; create_time: number; update_time: number }>();
    for (const c of [...contexts, ...anonymousContexts, ...a2aContexts]) {
      const prev = dedupMap.get(c.id);
      if (!prev || c.update_time > prev.update_time) dedupMap.set(c.id, c);
    }
    const allUserContexts = Array.from(dedupMap.values());

    const chatSummaries: ChatSummary[] = [];

    for (const context of allUserContexts) {
      // Get message count and all messages for this context
      const messagesStmt = db.prepare(`
        SELECT content FROM events 
        WHERE context_id = ? 
        ORDER BY timestamp ASC
      `);
      const messageRows = messagesStmt.all(context.id) as { content: string }[];
      const messages = messageRows.map(row => JSON.parse(row.content) as UIMessage);

      if (messages.length > 0) {
        chatSummaries.push({
          id: context.id,
          title: extractChatTitle(messages),
          lastActivity: context.update_time,
          messageCount: messages.length,
          preview: getMessagePreview(messages),
          createTime: context.create_time
        });
      }
    }

    return chatSummaries;
  } catch (error) {
    log.error('Error in getChatsList:', error);
    throw error;
  }
}

// Get full chat with history including messages and tasks
export function getChatWithHistory(contextId: string): ChatWithHistory | null {
  const db = getDb();
  
  // Get context info
  const contextStmt = db.prepare(`
    SELECT state, create_time, update_time 
    FROM contexts 
    WHERE id = ? AND app_name = ?
  `);
  const context = contextStmt.get(contextId, APP_NAME) as {
    state: string;
    create_time: number;
    update_time: number;
  } | undefined;

  if (!context) {
    return null;
  }

  // Get messages
  const messages = loadChat(contextId);

  // Get associated A2A tasks
  const tasksStmt = db.prepare(`
    SELECT id, status, history, metadata, created_at, updated_at
    FROM a2a_tasks 
    WHERE context_id = ?
    ORDER BY created_at ASC
  `);
  const taskRows = tasksStmt.all(contextId) as Array<{
    id: string;
    status: string;
    history: string;
    metadata: string;
    created_at: number;
    updated_at: number;
  }>;

  const tasks = taskRows.map(row => ({
    id: row.id,
    status: JSON.parse(row.status),
    history: JSON.parse(row.history),
    metadata: JSON.parse(row.metadata),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));

  return {
    contextId,
    title: extractChatTitle(messages),
    messages,
    tasks,
    metadata: JSON.parse(context.state),
    createTime: context.create_time,
    updateTime: context.update_time
  };
}

// Delete a chat and all associated data
export function deleteChatById(contextId: string): boolean {
  const db = getDb();
  
  const deleteTransaction = db.transaction(() => {
    // Delete events (messages)
    const deleteEventsStmt = db.prepare('DELETE FROM events WHERE context_id = ?');
    deleteEventsStmt.run(contextId);
    
    // Delete A2A tasks
    const deleteTasksStmt = db.prepare('DELETE FROM a2a_tasks WHERE context_id = ?');
    deleteTasksStmt.run(contextId);
    
    // Delete context
    const deleteContextStmt = db.prepare('DELETE FROM contexts WHERE id = ?');
    const result = deleteContextStmt.run(contextId);
    
    return (result as any).changes > 0;
  });

  try {
    return deleteTransaction();
  } catch (error) {
    console.error('Error deleting chat:', error);
    return false;
  }
}

// Update chat metadata (for features like renaming)
export function updateChatMetadata(contextId: string, metadata: Record<string, any>): boolean {
  const db = getDb();
  
  try {
    const updateStmt = db.prepare(`
      UPDATE contexts 
      SET state = ?, update_time = ? 
      WHERE id = ? AND app_name = ?
    `);
    const result = updateStmt.run(
      JSON.stringify(metadata), 
      Date.now() / 1000, 
      contextId, 
      APP_NAME
    );
    
    return (result as any).changes > 0;
  } catch (error) {
    console.error('Error updating chat metadata:', error);
    return false;
  }
}
