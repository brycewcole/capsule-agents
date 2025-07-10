import sqlite3
from typing import Annotated
import logging  # Add logging import

from fastapi import Depends

from backend.app.configure_schemas import AgentInfo, Tool
import json

from backend.app.dependicies.deps import database_url

logger = logging.getLogger(__name__)  # Initialize logger for the module


class ConfigureService:
    def __init__(self, db_url: Annotated[str, Depends(database_url)]):
        self.db_url = db_url
        logger.info(f"Initializing ConfigureService with db_url: {self.db_url}")
        conn = self._get_conn()
        # Check if tools column exists
        logger.info("Checking for 'tools' column in 'agent_info' table.")
        cursor = conn.execute("PRAGMA table_info(agent_info)")
        columns = [column[1] for column in cursor.fetchall()]

        # Create the table if it doesn't exist
        logger.info("Ensuring 'agent_info' table exists.")
        conn.execute("""
            CREATE TABLE IF NOT EXISTS agent_info (
                key               INTEGER PRIMARY KEY,
                name              TEXT    NOT NULL,
                description       TEXT    NOT NULL,
                model_name        TEXT    NOT NULL,
                model_parameters  TEXT    NOT NULL
            )
        """
)

        # Add tools column if it doesn't exist
        if "tools" not in columns:
            logger.info("Adding 'tools' column to 'agent_info' table.")
            try:
                conn.execute("ALTER TABLE agent_info ADD COLUMN tools TEXT DEFAULT '[]'")
                logger.info("'tools' column added successfully.")
            except sqlite3.OperationalError as e:
                if "duplicate column name" in str(e).lower():
                    logger.info("'tools' column already exists (caught duplicate column error).")
                else:
                    logger.error(f"Failed to add 'tools' column: {e}")
                    raise
        else:
            logger.info("'tools' column already exists in 'agent_info' table.")


        conn.commit()
        # insert mock data if it doesn't exist yet
        logger.info("Checking for existing agent_info data with key = 1.")
        row = conn.execute("SELECT 1 FROM agent_info WHERE key = 1").fetchone()
        if not row:
            logger.info(
                "No existing agent_info data found with key = 1, inserting mock data."
            )
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
        logger.info(f"Database connection established to {self.db_url}")
        return conn

    def get_agent_info(self) -> AgentInfo:
        logger.info("Attempting to get agent info.")
        conn = self._get_conn()
        row = conn.execute(
            "SELECT name, description, model_name, model_parameters, tools FROM agent_info WHERE key = 1"
        ).fetchone()
        conn.close()
        if not row:
            logger.error("Agent info not found in the database.")
            raise ValueError("Agent info not found")
        logger.info("Agent info retrieved successfully.")

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
        logger.info(f"Attempting to upsert agent info for agent: {info.name}")
        # Validate tool configurations, especially for a2a_call tools
        for tool_config in info.tools:
            if tool_config.type == "a2a_call":
                logger.info(f"Validating a2a_call tool: {tool_config.name}")
                if not isinstance(tool_config.tool_schema, dict):
                    logger.error(
                        f"Validation failed for tool '{tool_config.name}': tool_schema is not a dict."
                    )
                    raise ValueError(
                        f"Tool '{tool_config.name}' of type 'a2a_call' has an invalid tool_schema (expected a dictionary)."
                    )
                if "agent_url" not in tool_config.tool_schema:
                    logger.error(
                        f"Validation failed for tool '{tool_config.name}': 'agent_url' missing in tool_schema."
                    )
                    raise ValueError(
                        f"Tool '{tool_config.name}' of type 'a2a_call' is missing 'agent_url' in its tool_schema."
                    )
                logger.info(f"Tool '{tool_config.name}' validated successfully.")

        conn = self._get_conn()
        logger.info(
            f"Executing INSERT OR REPLACE for agent_info with key = 1, name = {info.name}"
        )
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
        logger.info(f"Agent info for '{info.name}' upserted successfully.")
        return info
