import sqlite3
from typing import Annotated

from fastapi import Depends

from backend.app.configure_schemas import AgentInfo, Tool
import json

from backend.app.dependicies.deps import database_url


class ConfigureService:
    def __init__(self, db_url: Annotated[str, Depends(database_url)]):
        self.db_url = db_url
        conn = self._get_conn()
        # Check if tools column exists
        cursor = conn.execute("PRAGMA table_info(agent_info)")
        columns = [column[1] for column in cursor.fetchall()]

        # Create the table if it doesn't exist
        conn.execute("""
            CREATE TABLE IF NOT EXISTS agent_info (
                key               INTEGER PRIMARY KEY,
                name              TEXT    NOT NULL,
                description       TEXT    NOT NULL,
                model_name        TEXT    NOT NULL,
                model_parameters  TEXT    NOT NULL
            )
        """)

        # Add tools column if it doesn't exist
        if "tools" not in columns:
            conn.execute("ALTER TABLE agent_info ADD COLUMN tools TEXT DEFAULT '[]'")

        conn.commit()
        # insert mock data if it doesn't exist yet
        row = conn.execute("SELECT 1 FROM agent_info WHERE key = 1").fetchone()
        if not row:
            mock = AgentInfo(
                name="capy_agent",
                description="You are a Capybara agent. You are a friendly and helpful assistant.",
                model_name="gemini/gemini-2.5-flash-preview-04-17",
                model_parameters={},
                tools=[],
            )
            conn.execute(
                "INSERT INTO agent_info(key, name, description, model_name, model_parameters, tools) VALUES(1, ?, ?, ?, ?, ?)",
                (
                    mock.name,
                    mock.description,
                    mock.model_name,
                    json.dumps(mock.model_parameters),
                    json.dumps([t.model_dump() for t in mock.tools]),
                ),
            )
        conn.commit()
        conn.close()

    def _get_conn(self):
        conn = sqlite3.connect(self.db_url, detect_types=sqlite3.PARSE_DECLTYPES)
        conn.row_factory = sqlite3.Row
        return conn

    def get_agent_info(self) -> AgentInfo:
        conn = self._get_conn()
        row = conn.execute(
            "SELECT name, description, model_name, model_parameters, tools FROM agent_info WHERE key = 1"
        ).fetchone()
        conn.close()
        if not row:
            raise ValueError("Agent info not found")

        # Handle case where tools column might not exist in older database versions
        tools_json = row["tools"] if "tools" in row.keys() else "[]"
        tools_data = json.loads(tools_json)
        tools = [Tool(**tool_data) for tool_data in tools_data]

        return AgentInfo(
            name=row["name"],
            description=row["description"],
            model_name=row["model_name"],
            model_parameters=json.loads(row["model_parameters"]),
            tools=tools,
        )

    def upsert_agent_info(self, info: AgentInfo) -> AgentInfo:
        conn = self._get_conn()
        conn.execute(
            "INSERT OR REPLACE INTO agent_info(key, name, description, model_name, model_parameters, tools) VALUES(1, ?, ?, ?, ?, ?)",
            (
                info.name,
                info.description,
                info.model_name,
                json.dumps(info.model_parameters),
                json.dumps([t.model_dump() for t in info.tools]),
            ),
        )
        conn.commit()
        conn.close()
        return info
