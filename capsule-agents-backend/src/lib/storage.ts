import { getDb } from './db.js';
import { UIMessage } from 'ai';
import { v4 as uuidv4 } from 'uuid';

const APP_NAME = 'capsule-agents-backend';

export async function createChat(userId: string): Promise<string> {
  const db = getDb();
  const sessionId = uuidv4();
  const now = Date.now() / 1000;

  const stmt = db.prepare(
    'INSERT INTO sessions (app_name, user_id, id, state, create_time, update_time) VALUES (?, ?, ?, ?, ?, ?)'
  );
  stmt.run(APP_NAME, userId, sessionId, JSON.stringify({}), now, now);

  return sessionId;
}

export async function createChatWithId(sessionId: string, userId: string): Promise<void> {
  const db = getDb();
  const now = Date.now() / 1000;

  const stmt = db.prepare(
    'INSERT OR IGNORE INTO sessions (app_name, user_id, id, state, create_time, update_time) VALUES (?, ?, ?, ?, ?, ?)'
  );
  stmt.run(APP_NAME, userId, sessionId, JSON.stringify({}), now, now);
}

export async function loadChat(sessionId: string): Promise<UIMessage[]> {
  const db = getDb();
  const stmt = db.prepare('SELECT content FROM events WHERE session_id = ? ORDER BY timestamp ASC');
  const rows = stmt.all(sessionId) as { content: string }[];

  return rows.map(row => JSON.parse(row.content));
}

export async function saveChat(sessionId: string, messages: UIMessage[]) {
  const db = getDb();
  const stmt = db.prepare(
    'INSERT INTO events (id, app_name, user_id, session_id, author, content, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );

  const insert = db.transaction((msgs) => {
    for (const message of msgs) {
      const author = message.role;
      // This is a simplified mapping. We can expand this to match your original schema more closely.
      stmt.run(
        message.id,
        APP_NAME,
        'user', // Assuming a single user for now
        sessionId,
        author,
        JSON.stringify(message),
        Date.now() / 1000
      );
    }
  });

  insert(messages);

  // Also update the session's update_time
  const updateStmt = db.prepare('UPDATE sessions SET update_time = ? WHERE id = ?');
  updateStmt.run(Date.now() / 1000, sessionId);
}
