import { Database } from "better-sqlite3"

// Resolve DB path from environment with sensible defaults for dev + docker
function resolveDbPath() {
  try {
    const envPath = Deno.env.get("DB_PATH") ||
      Deno.env.get("DATABASE_PATH") ||
      Deno.env.get("SESSIONS_DB_PATH")
    return envPath && envPath.trim().length > 0 ? envPath : "./data/sessions.db"
  } catch (_) {
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

    -- A2A Messages: Can exist in a task history or just in context
    CREATE TABLE IF NOT EXISTS messages (
        id          TEXT PRIMARY KEY,
        context_id  TEXT NOT NULL,
        task_id     TEXT,
        role        TEXT NOT NULL CHECK (role IN ('user', 'agent')),
        parts       TEXT NOT NULL DEFAULT '[]',
        metadata    TEXT NOT NULL DEFAULT '{}',
        timestamp   REAL NOT NULL,
        FOREIGN KEY(context_id) REFERENCES contexts(id) ON DELETE CASCADE,
        FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );

    -- Vercel Messages: Stores UI message metadata
    CREATE TABLE IF NOT EXISTS vercel_messages (
        id          TEXT PRIMARY KEY,
        context_id  TEXT NOT NULL,
        task_id     TEXT,
        role        TEXT NOT NULL,
        created_at  REAL NOT NULL,
        FOREIGN KEY(context_id) REFERENCES contexts(id) ON DELETE CASCADE,
        FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE SET NULL
    );

    -- Vercel Message Parts: Flattened storage for message content
    CREATE TABLE IF NOT EXISTS vercel_message_parts (
        id                              TEXT PRIMARY KEY,
        message_id                      TEXT NOT NULL,
        type                            TEXT NOT NULL,
        order_index                     INTEGER NOT NULL,
        created_at                      REAL NOT NULL,

        -- Text parts
        text_text                       TEXT,

        -- Reasoning parts
        reasoning_text                  TEXT,

        -- File parts
        file_mediaType                  TEXT,
        file_filename                   TEXT,
        file_url                        TEXT,

        -- Source URL parts
        source_url_sourceId             TEXT,
        source_url_url                  TEXT,
        source_url_title                TEXT,

        -- Source document parts
        source_document_sourceId        TEXT,
        source_document_mediaType       TEXT,
        source_document_title           TEXT,
        source_document_filename        TEXT,

        -- Tool call shared columns
        tool_toolCallId                 TEXT,
        tool_toolName                   TEXT,
        tool_state                      TEXT,
        tool_errorText                  TEXT,
        tool_input                      TEXT,
        tool_output                     TEXT,

        -- Provider metadata
        provider_metadata               TEXT,

        FOREIGN KEY(message_id) REFERENCES vercel_messages(id) ON DELETE CASCADE
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

    -- Agent Configuration
    CREATE TABLE IF NOT EXISTS agent_info (
        key                 INTEGER PRIMARY KEY CHECK (key = 1),
        name                TEXT NOT NULL DEFAULT 'Capsule Agent',
        description         TEXT NOT NULL DEFAULT 'A configurable agent powered by the A2A protocol',
        model_name          TEXT,
        model_parameters    TEXT NOT NULL DEFAULT '{}',
        tools               TEXT NOT NULL DEFAULT '[]',
        built_in_prompts_enabled INTEGER NOT NULL DEFAULT 1
    );

    -- Schedules: Automated tasks that run on cron schedules
    CREATE TABLE IF NOT EXISTS schedules (
        id                  TEXT PRIMARY KEY,
        name                TEXT NOT NULL,
        prompt              TEXT NOT NULL,
        cron_expression     TEXT NOT NULL,
        enabled             INTEGER NOT NULL DEFAULT 1,
        context_id          TEXT,
        backoff_enabled     INTEGER NOT NULL DEFAULT 0,
        backoff_schedule    TEXT,
        last_run_at         REAL,
        next_run_at         REAL,
        run_count           INTEGER NOT NULL DEFAULT 0,
        failure_count       INTEGER NOT NULL DEFAULT 0,
        created_at          REAL NOT NULL,
        updated_at          REAL NOT NULL,
        FOREIGN KEY(context_id) REFERENCES contexts(id) ON DELETE SET NULL
    );

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_tasks_context_id ON tasks(context_id);
    CREATE INDEX IF NOT EXISTS idx_messages_context_id ON messages(context_id);
    CREATE INDEX IF NOT EXISTS idx_messages_task_id ON messages(task_id);
    CREATE INDEX IF NOT EXISTS idx_vercel_messages_context_id ON vercel_messages(context_id);
    CREATE INDEX IF NOT EXISTS idx_vercel_messages_task_id ON vercel_messages(task_id);
    CREATE INDEX IF NOT EXISTS idx_vercel_message_parts_message_id ON vercel_message_parts(message_id);
    CREATE INDEX IF NOT EXISTS idx_vercel_message_parts_order ON vercel_message_parts(message_id, order_index);
    CREATE INDEX IF NOT EXISTS idx_artifacts_task_id ON artifacts(task_id);
    CREATE INDEX IF NOT EXISTS idx_contexts_updated_at ON contexts(updated_at);
    CREATE INDEX IF NOT EXISTS idx_tasks_updated_at ON tasks(updated_at);
    CREATE INDEX IF NOT EXISTS idx_schedules_enabled ON schedules(enabled);
    CREATE INDEX IF NOT EXISTS idx_schedules_context_id ON schedules(context_id);
  `)

  ensureMessagesMetadataColumn(db)
  ensureAgentInfoBuiltInPromptsColumn(db)

  console.log("Clean database schema created successfully.")
}

function ensureMessagesMetadataColumn(db: Database) {
  const columns = db.prepare("PRAGMA table_info(messages)").all() as {
    name: string
  }[]

  const hasMetadata = columns.some((column) => column.name === "metadata")
  if (!hasMetadata) {
    db.exec(
      "ALTER TABLE messages ADD COLUMN metadata TEXT NOT NULL DEFAULT '{}'",
    )
  }
}

function ensureAgentInfoBuiltInPromptsColumn(db: Database) {
  const columns = db.prepare("PRAGMA table_info(agent_info)").all() as {
    name: string
  }[]

  // Check for old column name and rename if exists
  const hasOldColumn = columns.some((column) =>
    column.name === "default_prompts_enabled"
  )
  const hasNewColumn = columns.some((column) =>
    column.name === "built_in_prompts_enabled"
  )

  if (hasOldColumn && !hasNewColumn) {
    // SQLite doesn't support RENAME COLUMN directly in older versions,
    // so we copy the data
    db.exec(`
      ALTER TABLE agent_info ADD COLUMN built_in_prompts_enabled INTEGER NOT NULL DEFAULT 1;
      UPDATE agent_info SET built_in_prompts_enabled = default_prompts_enabled;
    `)
  } else if (!hasNewColumn) {
    db.exec(
      "ALTER TABLE agent_info ADD COLUMN built_in_prompts_enabled INTEGER NOT NULL DEFAULT 1",
    )
  }
}
