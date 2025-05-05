import sqlite3
from typing import Annotated
from fastapi import Depends
from google.adk.sessions import BaseSessionService
from google.adk.runners import Runner
from google.adk.agents import Agent

from backend.app.services.sqlite_session_service import SQLiteSessionService


def database_url() -> str:
    """
    Returns the database URL to be used for the application.
    """
    return "./sessions.db"


def model() -> str:
    """
    Returns the model to be used for the agent.
    """
    return "gemini-2.0-flash"


def session_service() -> BaseSessionService:
    """
    Returns the session service to be used for the agent.
    """
    return SQLiteSessionService("./sessions.db")


def agent(
    model: Annotated[str, Depends(model)],
    db_url: Annotated[str, Depends(database_url)],
) -> Agent:
    """
    Returns the agent to be used for the application, reading info from the database.
    """
    conn = sqlite3.connect(db_url, detect_types=sqlite3.PARSE_DECLTYPES)
    conn.row_factory = sqlite3.Row
    cursor = conn.execute("SELECT name, description FROM agent_info WHERE key = 1")
    row = cursor.fetchone()
    conn.close()
    if row:
        name, description = row
    else:
        name = "new_capy_agent"
        description = "Default agent"
    return Agent(
        name=name,
        model=model,
        description=description,
    )


def runner(
    session_service: Annotated[BaseSessionService, Depends(session_service)],
    agent: Annotated[Agent, Depends(agent)],
) -> Runner:
    return Runner(
        agent=agent,
        app_name="weather_tutorial_app",
        session_service=session_service,
    )
