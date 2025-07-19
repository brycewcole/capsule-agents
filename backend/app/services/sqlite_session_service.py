import sqlite3
import json
import uuid
import time
from typing import Any, Tuple, Dict

from google.adk.events.event import Event
from google.adk.sessions.base_session_service import (
    BaseSessionService,
    GetSessionConfig,
    ListSessionsResponse,
)
from google.adk.sessions.session import Session
from google.adk.sessions.state import State
from typing_extensions import override


def _extract_state_delta(
    state: dict[str, Any],
) -> Tuple[Dict[str, Any], Dict[str, Any], Dict[str, Any]]:
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


def _merge_state(
    app_state: Dict[str, Any], user_state: Dict[str, Any], session_state: Dict[str, Any]
) -> Dict[str, Any]:
    merged = dict(session_state)
    for k, v in app_state.items():
        merged[State.APP_PREFIX + k] = v
    for k, v in user_state.items():
        merged[State.USER_PREFIX + k] = v
    return merged


class SQLiteSessionService(BaseSessionService):
    db_path: str

    def __init__(self, db_path: str):
        self.db_path = db_path
        # create or migrate schema
        conn = self._get_conn()
        self._create_tables(conn)
        conn.commit()
        conn.close()

    def _get_conn(self) -> sqlite3.Connection:
        conn = sqlite3.connect(
            self.db_path,
            detect_types=sqlite3.PARSE_DECLTYPES,
            check_same_thread=False,
        )
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        return conn

    def _create_tables(self, conn: sqlite3.Connection) -> None:
        c = conn.cursor()
        # sessions with single‑column PK
        c.execute("""
        CREATE TABLE IF NOT EXISTS sessions (
            app_name    TEXT,
            user_id     TEXT,
            id          TEXT PRIMARY KEY,
            state       TEXT,
            create_time REAL,
            update_time REAL
        )
        """)
        # events referencing sessions(id)
        c.execute("""
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
        )
        """)
        # app_states
        c.execute("""
        CREATE TABLE IF NOT EXISTS app_states (
            app_name    TEXT PRIMARY KEY,
            state       TEXT,
            update_time REAL
        )
        """)
        # user_states
        c.execute("""
        CREATE TABLE IF NOT EXISTS user_states (
            app_name    TEXT,
            user_id     TEXT,
            state       TEXT,
            update_time REAL,
            PRIMARY KEY(app_name, user_id)
        )
        """)

    @override
    async def create_session(
        self,
        *,
        app_name: str,
        user_id: str,
        state: dict[str, Any] | None = None,
        session_id: str | None = None,
    ) -> Session:
        sid = session_id or str(uuid.uuid4())
        now = time.time()
        conn = self._get_conn()
        c = conn.cursor()

        # load or init app_state
        c.execute("SELECT state FROM app_states WHERE app_name = ?", (app_name,))
        row = c.fetchone()
        app_state = json.loads(row["state"]) if row else {}
        if not row:
            c.execute(
                "INSERT INTO app_states(app_name, state, update_time) VALUES (?,?,?)",
                (app_name, json.dumps({}), now),
            )

        # load or init user_state
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

        # extract & apply deltas
        app_delta, user_delta, sess_delta = _extract_state_delta(state or {})
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
            "INSERT INTO sessions(app_name, user_id, id, state, create_time, update_time) "
            "VALUES (?,?,?,?,?,?)",
            (app_name, user_id, sid, json.dumps(session_state), now, now),
        )

        conn.commit()
        conn.close()

        merged = _merge_state(app_state, user_state, session_state)
        return Session(
            app_name=app_name,
            user_id=user_id,
            id=sid,
            state=merged,
            last_update_time=now,
        )

    @override
    async def get_session(
        self,
        *,
        app_name: str,
        user_id: str,
        session_id: str,
        config: GetSessionConfig | None = None,
    ) -> Session | None:
        conn = self._get_conn()
        c = conn.cursor()

        c.execute(
            "SELECT * FROM sessions WHERE app_name = ? AND user_id = ? AND id = ?",
            (app_name, user_id, session_id),
        )
        row = c.fetchone()
        if not row:
            conn.close()
            return None

        # fetch events
        q = """
          SELECT * FROM events
           WHERE session_id = ?
           {after}
           ORDER BY timestamp ASC
           {limit}
        """
        after = (
            f"AND timestamp < {config.after_timestamp}"
            if config and config.after_timestamp
            else ""
        )
        limit = (
            f"LIMIT {config.num_recent_events}"
            if config and config.num_recent_events
            else ""
        )
        c.execute(q.format(after=after, limit=limit), (session_id,))
        ev_rows = c.fetchall()

        # load app & user states
        def _load_state(table: str) -> dict[str, Any]:
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

        app_state = _load_state("app_states")
        user_state = _load_state("user_states")
        session_state = json.loads(row["state"])

        merged = _merge_state(app_state, user_state, session_state)
        session = Session(
            app_name=app_name,
            user_id=user_id,
            id=session_id,
            state=merged,
            last_update_time=row["update_time"],
        )

        # build events list
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

        conn.close()
        return session

    @override
    async def list_sessions(
        self, *, app_name: str, user_id: str
    ) -> ListSessionsResponse:
        conn = self._get_conn()
        c = conn.cursor()
        c.execute(
            "SELECT id, update_time FROM sessions WHERE app_name = ? AND user_id = ?",
            (app_name, user_id),
        )
        resp = ListSessionsResponse(
            sessions=[
                Session(
                    app_name=app_name,
                    user_id=user_id,
                    id=r["id"],
                    state={},
                    last_update_time=r["update_time"],
                )
                for r in c.fetchall()
            ]
        )
        conn.close()
        return resp

    @override
    async def delete_session(
        self, *, app_name: str, user_id: str, session_id: str
    ) -> None:
        conn = self._get_conn()
        conn.execute(
            "DELETE FROM sessions WHERE app_name = ? AND user_id = ? AND id = ?",
            (app_name, user_id, session_id),
        )
        conn.commit()
        conn.close()

    @override
    async def append_event(self, session: Session, event: Event) -> Event:
        # update in‑memory
        await super().append_event(session, event)

        now = time.time()
        conn = self._get_conn()
        c = conn.cursor()

        # update sessions.state
        c.execute("SELECT state FROM sessions WHERE id = ?", (session.id,))
        row = c.fetchone()
        base_state = json.loads(row["state"]) if row else {}
        if event.actions and event.actions.state_delta:
            _, _, sess_delta = _extract_state_delta(event.actions.state_delta)
            base_state.update(sess_delta)
        c.execute(
            "UPDATE sessions SET state = ?, update_time = ? WHERE id = ?",
            (json.dumps(base_state), now, session.id),
        )

        # ensure content exists
        if not event.content:
            raise ValueError("Event content cannot be empty.")

        # prepare dicts
        content_dict = (
            event.content.model_dump(exclude_none=True)
            if hasattr(event.content, "model_dump")
            else event.content.dict(exclude_none=True)
        )
        actions_dict = (
            event.actions.model_dump(exclude_none=True)
            if event.actions and hasattr(event.actions, "model_dump")
            else (event.actions.dict(exclude_none=True) if event.actions else None)
        )

        # insert event row
        c.execute(
            """
            INSERT INTO events(
                id, app_name, user_id, session_id,
                invocation_id, author, branch, timestamp,
                content, actions, long_running_tool_ids,
                grounding_metadata, partial, turn_complete,
                error_code, error_message, interrupted
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
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
                json.dumps(content_dict),
                json.dumps(actions_dict) if actions_dict is not None else None,
                json.dumps(list(event.long_running_tool_ids or [])),
                json.dumps(event.grounding_metadata)
                if event.grounding_metadata
                else None,
                int(bool(event.partial)),
                int(bool(event.turn_complete)),
                event.error_code,
                event.error_message,
                int(bool(event.interrupted)),
            ),
        )

        conn.commit()
        conn.close()
        return event
