import json
import sqlite3
from google.adk.models.lite_llm import LiteLlm
from typing import Annotated
from fastapi import Depends
from google.adk.sessions import BaseSessionService
from google.adk.runners import Runner
from google.adk.agents import Agent
import os

from backend.app.configure_schemas import Model
from backend.app.services.sqlite_session_service import SQLiteSessionService
from backend.app.services.a2a_tool import A2ATool


def model_list() -> list[Model]:
    """
    Returns a list of available models.
    """
    return [
        Model(
            model_name="gemini/gemini-2.5-flash-preview-04-17",
            display_name="Gemini 2.5 Flash Preview",
        ),
        Model(
            model_name="openai/gpt-4o",
            display_name="OpenAI GPT-4o",
        ),
    ]


def find_model(model_name: str) -> Model:
    """
    Returns the model object for the given model name.
    """
    models = model_list()
    for model in models:
        if model.model_name == model_name:
            return model
    raise ValueError(f"Model {model_name} not found in the list of available models.")


def database_url() -> str:
    """
    Returns the database URL to be used for the application.
    """
    return "./sessions.db"


def session_service() -> BaseSessionService:
    """
    Returns the session service to be used for the agent.
    """
    return SQLiteSessionService("./sessions.db")


def agent(
    db_url: Annotated[str, Depends(database_url)],
) -> Agent:
    conn = sqlite3.connect(db_url, detect_types=sqlite3.PARSE_DECLTYPES)
    conn.row_factory = sqlite3.Row
    cursor = conn.execute(
        "SELECT name, description, model_name, tools FROM agent_info WHERE key = 1"
    )
    row = cursor.fetchone()
    conn.close()

    if not row:
        raise ValueError("Agent info not found in the database.")

    name: str = row["name"]
    description: str = row["description"]
    model_name: str = row["model_name"]
    tools_json: str = row["tools"]  # This is a JSON string

    agent_tools = []
    if tools_json:
        try:
            tool_configs = json.loads(tools_json)
            for config in tool_configs:
                if config.get("type") == "a2a_call":
                    tool_schema = config.get("tool_schema", {})
                    agent_url = tool_schema.get("agent_url")
                    if agent_url:
                        agent_tools.append(A2ATool(agent_url=agent_url))
                    else:
                        print(
                            f"Warning: a2a_call tool '{config.get('name')}' is missing agent_url."
                        )
                # Add logic for other tool types here if needed in the future
        except json.JSONDecodeError:
            # Handle error in parsing tools JSON, e.g., log an error
            print(f"Error: Could not parse tools JSON: {tools_json}")

    return Agent(
        name=name,
        model=LiteLlm(model=model_name),
        description=description,
        tools=agent_tools,  # Pass the list of configured tools
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


def a2a_agent_tool(
    agent_url: str = os.getenv("A2A_AGENT_URL", "http://localhost:8000/a2a"),
) -> A2ATool:
    """
    Returns a configured A2ATool instance pointing at the remote agent URL.
    """
    return A2ATool(agent_url)
