import sqlite3
from typing import Annotated

from fastapi import Depends
from backend.app.configure_schemas import AgentInfo
from backend.app.dependicies.deps import database_url


class ConfigureService:
    def __init__(self, db_url: Annotated[str, Depends(database_url)]):
        self.db_url = db_url
        conn = self._get_conn()
        # insert mock data if it doesn’t exist yet
        row = conn.execute("SELECT 1 FROM agent_info WHERE key = 1").fetchone()
        if not row:
            mock = AgentInfo(name="Mock Agent", description="This is a mock agent")
            conn.execute(
                "INSERT INTO agent_info(key, name, description) VALUES(1, ?, ?)",
                (mock.name, mock.description),
            )
        conn.execute("""
            CREATE TABLE IF NOT EXISTS agent_info (
                key         INTEGER PRIMARY KEY,
                name        TEXT    NOT NULL,
                description TEXT    NOT NULL
            )
        """)
        conn.commit()
        conn.close()

    def _get_conn(self):
        conn = sqlite3.connect(self.db_url, detect_types=sqlite3.PARSE_DECLTYPES)
        conn.row_factory = sqlite3.Row
        return conn

    def get_agent_info(self) -> AgentInfo:
        conn = self._get_conn()
        row = conn.execute(
            "SELECT name, description FROM agent_info WHERE key = 1"
        ).fetchone()
        conn.close()
        if not row:
            raise ValueError("Agent info not found")
        return AgentInfo(name=row["name"], description=row["description"])

    def upsert_agent_info(self, info: AgentInfo) -> AgentInfo:
        conn = self._get_conn()
        conn.execute(
            "INSERT OR REPLACE INTO agent_info(key, name, description) VALUES(1, ?, ?)",
            (info.name, info.description),
        )
        conn.commit()
        conn.close()
        return info
