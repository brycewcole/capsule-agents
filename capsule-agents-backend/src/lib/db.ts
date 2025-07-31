import Database from 'better-sqlite3';

const dbPath = './sessions.db';

let db: Database.Database;

export function getDb() {
  if (!db) {
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    createTables();
  }
  return db;
}

function createTables() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
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
        session_id            TEXT,
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
        FOREIGN KEY(session_id)
          REFERENCES sessions(id)
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
  `);
  console.log('Database tables created or already exist.');
}
