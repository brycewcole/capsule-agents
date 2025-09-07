import { Database } from "better-sqlite3"

// Resolve DB path from environment with sensible defaults for dev + docker
function resolveDbPath() {
  try {
    const envPath = Deno.env.get("DB_PATH") ||
      Deno.env.get("DATABASE_PATH") ||
      Deno.env.get("SESSIONS_DB_PATH")
    return envPath && envPath.trim().length > 0
      ? envPath
      : "./data/sessions.db"
  } catch (_) {
    // If Deno.env is not accessible for any reason, fallback to default
    return "./data/sessions.db"
  }
}

const dbPath = resolveDbPath()

let db: Database

export function getDb() {
  if (!db) {
    console.log(`Opening SQLite database at: ${dbPath}`)
    db = new Database(dbPath)
    db.exec("PRAGMA journal_mode = WAL")
    db.exec("PRAGMA foreign_keys = ON")
    createTables(db)
  }
  return db
}

function createTables(db: Database) {
  db.exec(`
    -- Contexts: Top-level grouping of tasks and messages
    CREATE TABLE IF NOT EXISTS contexts (
        id          TEXT PRIMARY KEY,
        metadata    TEXT NOT NULL DEFAULT '{}',
        created_at  REAL NOT NULL,
        updated_at  REAL NOT NULL
    );

    -- Tasks: Main unit of work, groups messages in history
    CREATE TABLE IF NOT EXISTS tasks (
        id                  TEXT PRIMARY KEY,
        context_id          TEXT NOT NULL,
        status_state        TEXT NOT NULL CHECK (status_state IN ('submitted', 'working', 'input-required', 'completed', 'canceled', 'failed', 'rejected', 'auth-required', 'unknown')),
        status_timestamp    TEXT NOT NULL,
        status_message_id   TEXT,
        metadata            TEXT NOT NULL DEFAULT '{}',
        created_at          REAL NOT NULL,
        updated_at          REAL NOT NULL,
        FOREIGN KEY(context_id) REFERENCES contexts(id) ON DELETE CASCADE,
        FOREIGN KEY(status_message_id) REFERENCES messages(id) ON DELETE SET NULL
    );

    -- Messages: Can exist in a task history or just in context
    CREATE TABLE IF NOT EXISTS messages (
        id          TEXT PRIMARY KEY,
        context_id  TEXT NOT NULL,
        task_id     TEXT,
        role        TEXT NOT NULL CHECK (role IN ('user', 'agent')),
        parts       TEXT NOT NULL DEFAULT '[]',
        timestamp   REAL NOT NULL,
        FOREIGN KEY(context_id) REFERENCES contexts(id) ON DELETE CASCADE,
        FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );

    -- Artifacts: Output of a task
    CREATE TABLE IF NOT EXISTS artifacts (
        id          TEXT PRIMARY KEY,
        task_id     TEXT NOT NULL,
        name        TEXT,
        description TEXT,
        parts       TEXT NOT NULL DEFAULT '[]',
        created_at  REAL NOT NULL,
        FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );

    -- Agent Configuration: Separate from A2A protocol data
    CREATE TABLE IF NOT EXISTS agent_info (
        key                 INTEGER PRIMARY KEY CHECK (key = 1),
        name                TEXT NOT NULL DEFAULT 'Capsule Agent',
        description         TEXT NOT NULL DEFAULT 'A configurable agent powered by the A2A protocol',
        model_name          TEXT,
        model_parameters    TEXT NOT NULL DEFAULT '{}',
        tools               TEXT NOT NULL DEFAULT '[]'
    );

    -- Create indexes for better performance
    CREATE INDEX IF NOT EXISTS idx_tasks_context_id ON tasks(context_id);
    CREATE INDEX IF NOT EXISTS idx_messages_context_id ON messages(context_id);
    CREATE INDEX IF NOT EXISTS idx_messages_task_id ON messages(task_id);
    CREATE INDEX IF NOT EXISTS idx_artifacts_task_id ON artifacts(task_id);
    CREATE INDEX IF NOT EXISTS idx_contexts_updated_at ON contexts(updated_at);
    CREATE INDEX IF NOT EXISTS idx_tasks_updated_at ON tasks(updated_at);
  `)

  console.log("Clean database schema created successfully.")
}
