from typing import Annotated
from fastapi import Depends
from google.adk.sessions import BaseSessionService
from google.adk.runners import Runner
from google.adk.agents import Agent

from backend.app.services.sqlite_session_service import SQLiteSessionService


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


def agent(model: Annotated[str, Depends(model)]) -> Agent:
    """
    Returns the agent to be used for the application.
    """
    return Agent(
        name="weather_agent",
        model=model,
        description="This agent handles weather-related queries.",
    )


def database_url() -> str:
    """
    Returns the database URL to be used for the application.
    """
    return "./sessions.db"


def runner(
    session_service: Annotated[BaseSessionService, Depends(session_service)],
    agent: Annotated[Agent, Depends(agent)],
) -> Runner:
    return Runner(
        agent=agent,
        app_name="weather_tutorial_app",
        session_service=session_service,
    )
