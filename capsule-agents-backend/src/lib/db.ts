import { Database } from 'better-sqlite3';

const dbPath = './data/sessions.db';

let db: Database;

export function getDb() {
  if (!db) {
    db = new Database(dbPath);
    db.exec('PRAGMA journal_mode = WAL');
    createTables(db);
  }
  return db;
}

function createTables(db: Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS contexts (
        app_name    TEXT,
        user_id     TEXT,
        id          TEXT PRIMARY KEY,
        state       TEXT,
        create_time REAL,
        update_time REAL
    );

    CREATE TABLE IF NOT EXISTS events (
        id                    TEXT PRIMARY KEY,
        app_name              TEXT,
        user_id               TEXT,
        context_id            TEXT,
        invocation_id         TEXT,
        author                TEXT,
        branch                TEXT,
        timestamp             REAL,
        content               TEXT,
        actions               TEXT,
        long_running_tool_ids TEXT,
        grounding_metadata    TEXT,
        partial               INTEGER,
        turn_complete         INTEGER,
        error_code            TEXT,
        error_message         TEXT,
        interrupted           INTEGER,
        FOREIGN KEY(context_id)
          REFERENCES contexts(id)
          ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS app_states (
        app_name    TEXT PRIMARY KEY,
        state       TEXT,
        update_time REAL
    );

    CREATE TABLE IF NOT EXISTS user_states (
        app_name    TEXT,
        user_id     TEXT,
        state       TEXT,
        update_time REAL,
        PRIMARY KEY(app_name, user_id)
    );

    CREATE TABLE IF NOT EXISTS agent_info (
        key               INTEGER PRIMARY KEY,
        name              TEXT    NOT NULL,
        description       TEXT    NOT NULL,
        model_name        TEXT    NOT NULL,
        model_parameters  TEXT    NOT NULL,
        tools             TEXT    DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS a2a_tasks (
        id                TEXT PRIMARY KEY,
        context_id        TEXT NOT NULL,
        status            TEXT NOT NULL, -- JSON serialized status object
        history           TEXT NOT NULL, -- JSON array of messages
        metadata          TEXT NOT NULL, -- JSON object
        created_at        REAL NOT NULL,
        updated_at        REAL NOT NULL
    );
  `);
  
  // Insert default agent info if it doesn't exist
  try {
    const existingAgent = db.prepare("SELECT 1 FROM agent_info WHERE key = 1").get();
    if (!existingAgent) {
      const mockAgent = {
        name: "capsule_agent", 
        description: "You are a Capsule agent. You are a friendly and helpful assistant.",
        model_name: "openai/gpt-4o",
        model_parameters: {},
        tools: []
      };
      
      const stmt = db.prepare(`
        INSERT INTO agent_info(key, name, description, model_name, model_parameters, tools) 
        VALUES(1, ?, ?, ?, ?, ?)
      `);
      stmt.run(
        mockAgent.name,
        mockAgent.description,
        mockAgent.model_name,
        JSON.stringify(mockAgent.model_parameters),
        JSON.stringify(mockAgent.tools)
      );
      console.log('Default agent info inserted.');
    }
  } catch (error) {
    console.error('Error initializing default agent info:', error);
  }
  
  console.log('Database tables created or already exist.');
}
