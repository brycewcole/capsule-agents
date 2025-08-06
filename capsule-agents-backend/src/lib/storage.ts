import { getDb } from './db.ts';
import type { UIMessage } from 'ai';
import { v4 as uuidv4 } from 'uuid';

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
  const db = getDb();
  const now = Date.now() / 1000;

  const stmt = db.prepare(
    'INSERT OR IGNORE INTO contexts (app_name, user_id, id, state, create_time, update_time) VALUES (?, ?, ?, ?, ?, ?)'
  );
  stmt.run(APP_NAME, userId, contextId, JSON.stringify({}), now, now);
}

export function loadChat(contextId: string): UIMessage[] {
  const db = getDb();
  const stmt = db.prepare('SELECT content FROM events WHERE context_id = ? ORDER BY timestamp ASC');
  const rows = stmt.all(contextId) as { content: string }[];

  return rows.map(row => JSON.parse(row.content));
}

export function saveChat(contextId: string, messages: UIMessage[]): void {
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
