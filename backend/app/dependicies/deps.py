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
    SseServerParams,
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

    if not row:
        conn.close()
        raise ValueError("Agent info not found in the database.")

    name: str = row["name"]
    description: str = row["description"]
    model_name: str = row["model_name"]
    tools_json: str = row["tools"]  # This is a JSON string
    agent_tools: list = []

    conn.close()

    mcp_tools: list[MCPTool] = []

    # Parse tools from the agent configuration
    if tools_json:
        try:
            tool_configs = json.loads(tools_json)
            for config in tool_configs:
                tool_type = config.get("type")
                tool_schema = config.get("tool_schema", {})

                if tool_type == "a2a_call":
                    # Handle A2A call tools
                    agent_url = tool_schema.get("agent_url")
                    if agent_url:
                        tool = A2ATool(agent_card_url=agent_url)
                        # Use strict mode so connection errors surface to the user
                        await tool.initialize_agent_card(strict_mode=True)
                        agent_tools.append(tool)
                    else:
                        raise ValueError(
                            f"a2a_call tool '{config.get('name')}' is missing agent_url."
                        )

                elif tool_type == "prebuilt":
                    # Handle prebuilt tools based on schema type
                    prebuilt_type = tool_schema.get("type")

                    if prebuilt_type == "file_access":
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
                        mcp_tools.extend(file_tools)

                    elif prebuilt_type == "brave_search":
                        brave_api_key = os.environ.get("BRAVE_API_KEY")
                        if brave_api_key:
                            (
                                brave_tools,
                                brave_exit_stack,
                            ) = await MCPToolset.from_server(
                                connection_params=StdioServerParameters(
                                    command="npx",
                                    args=[
                                        "-y",
                                        "@modelcontextprotocol/server-brave-search",
                                    ],
                                    env={"BRAVE_API_KEY": brave_api_key},
                                )
                            )
                            mcp_tools.extend(brave_tools)
                        else:
                            print(
                                "Warning: BRAVE_API_KEY not found in environment variables. Brave search tools disabled."
                            )

                    elif prebuilt_type == "memory":
                        memory_tools, memory_exit_stack = await MCPToolset.from_server(
                            connection_params=StdioServerParameters(
                                command="npx",
                                args=[
                                    "-y",
                                    "@modelcontextprotocol/server-memory",
                                ],
                            )
                        )
                        mcp_tools.extend(memory_tools)

                elif tool_type == "mcp_server":
                    server_url = tool_schema.get("server_url")

                    if server_url:
                        try:
                            tools, exit_stack = await MCPToolset.from_server(
                                connection_params=SseServerParams(url=server_url)
                            )
                            mcp_tools.extend(tools)
                        except Exception as e:
                            import logging
                            logger = logging.getLogger(__name__)
                            logger.error(f"Failed to connect to MCP server '{config.get('name')}' at {server_url}: {e}", exc_info=True)
                            print(f"Error: Failed to connect to MCP server '{config.get('name')}' at {server_url}: {e}")
                            
                            # For certain critical errors, let them bubble up to be handled properly
                            # This includes configuration issues that should be surfaced to the user
                            error_str = str(e).lower()
                            if any(critical_pattern in error_str for critical_pattern in [
                                'redirect response',
                                'invalid url',
                                'permission denied',
                                'unauthorized'
                            ]):
                                # Re-raise critical configuration errors
                                raise e
                            
                            # For connection/network errors, log but continue (graceful degradation)
                            # This allows the agent to start without the MCP tools
                            continue
                    else:
                        print(
                            f"Warning: MCP server '{config.get('name')}' is missing server_url."
                        )

        except json.JSONDecodeError:
            # Handle error in parsing tools JSON, e.g., log an error
            print(f"Error: Could not parse tools JSON: {tools_json}")

    print(f"Fetched {len(mcp_tools)} tools from MCP servers.")
    agent_tools.extend(mcp_tools)

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


def get_current_user() -> str:
    """
    Placeholder authentication function for MCP routes.
    In a real implementation, this would validate authentication tokens.
    """
    # For now, return a default user
    # TODO: Implement actual authentication
    return "default_user"
