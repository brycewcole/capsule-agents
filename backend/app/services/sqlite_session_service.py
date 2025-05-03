import sqlite3
import json
import uuid
import time
from typing import Any, Optional
from google.adk.events.event import Event
from google.adk.sessions import BaseSessionService, Session
from google.adk.sessions.state import State
from google.adk.sessions.base_session_service import (
    GetSessionConfig,
    ListSessionsResponse,
    ListEventsResponse,
)


def _extract_state_delta(state: dict[str, Any]):
    app_delta, user_delta, session_delta = {}, {}, {}
    if state:
        for k, v in state.items():
            if k.startswith(State.APP_PREFIX):
                app_delta[k.removeprefix(State.APP_PREFIX)] = v
            elif k.startswith(State.USER_PREFIX):
                user_delta[k.removeprefix(State.USER_PREFIX)] = v
            elif not k.startswith(State.TEMP_PREFIX):
                session_delta[k] = v
    return app_delta, user_delta, session_delta


def _merge_state(app_state, user_state, session_state):
    merged = dict(session_state)
    for k, v in app_state.items():
        merged[State.APP_PREFIX + k] = v
    for k, v in user_state.items():
        merged[State.USER_PREFIX + k] = v
    return merged


class SQLiteSessionService(BaseSessionService):
    def __init__(self, db_path: str):
        self.conn = sqlite3.connect(db_path, detect_types=sqlite3.PARSE_DECLTYPES)
        self.conn.row_factory = sqlite3.Row
        # turn on foreign keys
        self.conn.execute("PRAGMA foreign_keys = ON")
        self._create_tables()

    def _create_tables(self):
        c = self.conn.cursor()

        c.execute("""
        CREATE TABLE IF NOT EXISTS sessions (
            app_name TEXT,
            user_id  TEXT,
            id       TEXT PRIMARY KEY,
            state    TEXT,
            create_time REAL,
            update_time REAL
        )""")

        c.execute("""
        CREATE TABLE IF NOT EXISTS events (
            id                      TEXT PRIMARY KEY,
            app_name                TEXT,
            user_id                 TEXT,
            session_id              TEXT,
            invocation_id           TEXT,
            author                  TEXT,
            branch                  TEXT,
            timestamp               REAL,
            content                 TEXT,
            actions                 TEXT,
            long_running_tool_ids   TEXT,
            grounding_metadata      TEXT,
            partial                 INTEGER,
            turn_complete           INTEGER,
            error_code              TEXT,
            error_message           TEXT,
            interrupted             INTEGER,
            FOREIGN KEY(app_name, user_id, session_id)
              REFERENCES sessions(app_name, user_id, id)
              ON DELETE CASCADE
        )""")

        c.execute("""
        CREATE TABLE IF NOT EXISTS app_states (
            app_name    TEXT PRIMARY KEY,
            state       TEXT,
            update_time REAL
        )""")

        c.execute("""
        CREATE TABLE IF NOT EXISTS user_states (
            app_name    TEXT,
            user_id     TEXT,
            state       TEXT,
            update_time REAL,
            PRIMARY KEY(app_name, user_id)
        )""")

        self.conn.commit()

    def create_session(
        self,
        *,
        app_name: str,
        user_id: str,
        state: Optional[dict[str, Any]] = None,
        session_id: Optional[str] = None,
    ) -> Session:
        sid = session_id or str(uuid.uuid4())
        now = time.time()

        c = self.conn.cursor()
        # load or initialize app & user state
        c.execute("SELECT state FROM app_states WHERE app_name = ?", (app_name,))
        row = c.fetchone()
        app_state = json.loads(row["state"]) if row else {}
        if not row:
            c.execute(
                "INSERT INTO app_states(app_name, state, update_time) VALUES (?,?,?)",
                (app_name, json.dumps({}), now),
            )

        c.execute(
            "SELECT state FROM user_states WHERE app_name = ? AND user_id = ?",
            (app_name, user_id),
        )
        row = c.fetchone()
        user_state = json.loads(row["state"]) if row else {}
        if not row:
            c.execute(
                "INSERT INTO user_states(app_name, user_id, state, update_time) VALUES (?,?,?,?)",
                (app_name, user_id, json.dumps({}), now),
            )

        # extract deltas
        app_delta, user_delta, sess_delta = _extract_state_delta(state or {})

        # apply & persist
        app_state.update(app_delta)
        user_state.update(user_delta)
        c.execute(
            "UPDATE app_states SET state = ?, update_time = ? WHERE app_name = ?",
            (json.dumps(app_state), now, app_name),
        )
        c.execute(
            "UPDATE user_states SET state = ?, update_time = ? WHERE app_name = ? AND user_id = ?",
            (json.dumps(user_state), now, app_name, user_id),
        )

        # insert session
        session_state = sess_delta
        c.execute(
            "INSERT INTO sessions(app_name, user_id, id, state, create_time, update_time) VALUES (?,?,?,?,?,?)",
            (app_name, user_id, sid, json.dumps(session_state), now, now),
        )
        self.conn.commit()

        merged = _merge_state(app_state, user_state, session_state)
        return Session(
            app_name=app_name,
            user_id=user_id,
            id=sid,
            state=merged,
            last_update_time=now,
        )

    def get_session(
        self,
        *,
        app_name: str,
        user_id: str,
        session_id: str,
        config: Optional[GetSessionConfig] = None,
    ) -> Optional[Session]:
        c = self.conn.cursor()
        c.execute(
            "SELECT * FROM sessions WHERE app_name = ? AND user_id = ? AND id = ?",
            (app_name, user_id, session_id),
        )
        row = c.fetchone()
        if not row:
            return None

        # pull events
        q = """
          SELECT * FROM events
           WHERE session_id = ?
           {after}
           ORDER BY timestamp ASC
           {limit}
        """
        after_clause = ""
        if config and config.after_timestamp:
            after_clause = f"AND timestamp < {config.after_timestamp}"
        limit_clause = ""
        if config and config.num_recent_events:
            limit_clause = f"LIMIT {config.num_recent_events}"
        c.execute(
            q.format(after=after_clause, limit=limit_clause),
            (session_id,),
        )
        ev_rows = c.fetchall()

        # load states
        def load_state(table, keys):
            if table == "app_states":
                c.execute(
                    "SELECT state FROM app_states WHERE app_name = ?", (app_name,)
                )
            else:
                c.execute(
                    "SELECT state FROM user_states WHERE app_name = ? AND user_id = ?",
                    (app_name, user_id),
                )
            r = c.fetchone()
            return json.loads(r["state"]) if r else {}

        app_state = load_state("app_states", (app_name,))
        user_state = load_state("user_states", (app_name, user_id))
        session_state = json.loads(row["state"])

        merged = _merge_state(app_state, user_state, session_state)

        session = Session(
            app_name=app_name,
            user_id=user_id,
            id=session_id,
            state=merged,
            last_update_time=row["update_time"],
        )

        # build Event objects
        events = []
        for e in ev_rows:
            events.append(
                Event(
                    id=e["id"],
                    author=e["author"],
                    branch=e["branch"],
                    invocation_id=e["invocation_id"],
                    content=json.loads(e["content"] or "null"),
                    actions=json.loads(e["actions"] or "null"),
                    timestamp=e["timestamp"],
                    long_running_tool_ids=set(
                        json.loads(e["long_running_tool_ids"] or "[]")
                    ),
                    grounding_metadata=json.loads(e["grounding_metadata"] or "null"),
                    partial=bool(e["partial"]),
                    turn_complete=bool(e["turn_complete"]),
                    error_code=e["error_code"],
                    error_message=e["error_message"],
                    interrupted=bool(e["interrupted"]),
                )
            )
        session.events = events
        return session

    def list_sessions(self, *, app_name: str, user_id: str) -> ListSessionsResponse:
        c = self.conn.cursor()
        c.execute(
            "SELECT id, update_time FROM sessions WHERE app_name = ? AND user_id = ?",
            (app_name, user_id),
        )
        sessions = [
            Session(
                app_name=app_name,
                user_id=user_id,
                id=r["id"],
                state={},
                last_update_time=r["update_time"],
            )
            for r in c.fetchall()
        ]
        return ListSessionsResponse(sessions=sessions)

    def delete_session(self, *, app_name: str, user_id: str, session_id: str) -> None:
        self.conn.execute(
            "DELETE FROM sessions WHERE app_name = ? AND user_id = ? AND id = ?",
            (app_name, user_id, session_id),
        )
        self.conn.commit()

    def append_event(self, session: Session, event: Event) -> Event:
        # merge in-memory first
        super().append_event(session, event)

        now = time.time()
        c = self.conn.cursor()

        # update session state
        c.execute(
            "SELECT state FROM sessions WHERE id = ?",
            (session.id,),
        )
        row = c.fetchone()
        base_state = json.loads(row["state"]) if row else {}

        if event.actions and event.actions.state_delta:
            _, _, sess_delta = _extract_state_delta(event.actions.state_delta)
            base_state.update(sess_delta)

        c.execute(
            "UPDATE sessions SET state = ?, update_time = ? WHERE id = ?",
            (json.dumps(base_state), now, session.id),
        )

        # insert event row
        c.execute(
            """
            INSERT INTO events(
                id, app_name, user_id, session_id, invocation_id, author, branch,
                timestamp, content, actions, long_running_tool_ids,
                grounding_metadata, partial, turn_complete,
                error_code, error_message, interrupted
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """,
            (
                event.id,
                session.app_name,
                session.user_id,
                session.id,
                event.invocation_id,
                event.author,
                event.branch,
                event.timestamp,
                json.dumps(event.content) if event.content is not None else None,
                json.dumps(
                    event.actions.dict()
                    if hasattr(event.actions, "dict")
                    else event.actions
                )
                if event.actions is not None
                else None,
                json.dumps(list(event.long_running_tool_ids or [])),
                json.dumps(event.grounding_metadata)
                if event.grounding_metadata is not None
                else None,
                int(bool(event.partial)),
                int(bool(event.turn_complete)),
                event.error_code,
                event.error_message,
                int(bool(event.interrupted)),
            ),
        )
        self.conn.commit()
        return event

    def list_events(
        self,
        *,
        app_name: str,
        user_id: str,
        session_id: str,
    ) -> ListEventsResponse:
        # very similar to get_session’s event fetch, but no session object
        c = self.conn.cursor()
        c.execute(
            "SELECT * FROM events WHERE app_name = ? AND user_id = ? AND session_id = ? ORDER BY timestamp ASC",
            (app_name, user_id, session_id),
        )
        rows = c.fetchall()
        evs = [
            Event(
                id=r["id"],
                author=r["author"],
                branch=r["branch"],
                invocation_id=r["invocation_id"],
                content=json.loads(r["content"] or "null"),
                actions=json.loads(r["actions"] or "null"),
                timestamp=r["timestamp"],
                long_running_tool_ids=set(
                    json.loads(r["long_running_tool_ids"] or "[]")
                ),
                grounding_metadata=json.loads(r["grounding_metadata"] or "null"),
                partial=bool(r["partial"]),
                turn_complete=bool(r["turn_complete"]),
                error_code=r["error_code"],
                error_message=r["error_message"],
                interrupted=bool(r["interrupted"]),
            )
            for r in rows
        ]
        return ListEventsResponse(events=evs)
