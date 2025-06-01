import json
import sqlite3
import os  # <-- Add this import
from google.adk.models.lite_llm import LiteLlm
from google.adk.agents.llm_agent import LlmAgent
from typing import Annotated
from fastapi import Depends
from google.adk.sessions import BaseSessionService
from google.adk.runners import Runner
from google.adk.agents import Agent
from google.adk.tools.mcp_tool.mcp_toolset import (
    StdioServerParameters,
    MCPToolset,
    MCPTool,
)

from backend.app.configure_schemas import Model
from backend.app.services.a2a_tool import A2ATool
from backend.app.services.sqlite_session_service import SQLiteSessionService


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


async def get_agent(
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
    agent_tools: list = []

    file_tools, file_exit_stack = await MCPToolset.from_server(
        connection_params=StdioServerParameters(
            command="npx",
            args=[
                "-y",
                "@modelcontextprotocol/server-filesystem",
                "/agent-workspace",
            ],
        )
    )

    brave_api_key = os.environ.get("BRAVE_API_KEY")  # <-- Load from env
    if not brave_api_key:
        raise ValueError("BRAVE_API_KEY not found in environment variables.")

    brave_tools, brave_exit_stack = await MCPToolset.from_server(
        connection_params=StdioServerParameters(
            command="npx",
            args=[
                "-y",
                "@modelcontextprotocol/server-brave-search",
            ],
            env={"BRAVE_API_KEY": brave_api_key},
        )
    )

    mcp_tools: list[MCPTool] = file_tools + brave_tools
    print(f"Fetched {len(mcp_tools)} tools from MCP servers.")

    agent_tools.extend(mcp_tools)
    if tools_json:
        try:
            tool_configs = json.loads(tools_json)
            for config in tool_configs:
                if config.get("type") == "a2a_call":
                    tool_schema = config.get("tool_schema", {})
                    agent_url = tool_schema.get("agent_url")
                    if agent_url:
                        tool = A2ATool(agent_card_url=agent_url)
                        await tool.initialize_agent_card()
                        agent_tools.append(tool)
                    else:
                        raise ValueError(
                            f"a2a_call tool '{config.get('name')}' is missing agent_url."
                        )
                # Add logic for other tool types here if needed in the future
        except json.JSONDecodeError:
            # Handle error in parsing tools JSON, e.g., log an error
            print(f"Error: Could not parse tools JSON: {tools_json}")

    return LlmAgent(
        name=name,
        model=LiteLlm(model=model_name),
        description=description,
        tools=agent_tools,
    )


def get_runner(
    session_service: Annotated[BaseSessionService, Depends(session_service)],
    agent: Annotated[Agent, Depends(get_agent)],
) -> Runner:
    return Runner(
        agent=agent,
        app_name="weather_tutorial_app",
        session_service=session_service,
    )
