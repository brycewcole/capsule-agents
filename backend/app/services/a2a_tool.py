import logging  # Add logging import
from google.adk.tools import BaseTool
import httpx
from uuid import uuid4
from typing import Any
from google.genai import types
from google.adk.tools.tool_context import ToolContext

from backend.app.schemas import AgentCard


class A2ATool(BaseTool):
    def __init__(self, agent_card_url: str):
        super().__init__(
            name="a2a_call",
            description="Send a single message to remote A2A agent via tasks/send",
        )
        self.agent_url = agent_card_url
        self.initialized = False
        self.logger = logging.getLogger(f"{__name__}.{self.__class__.__name__}")
        self.logger.info(f"Initialized A2ATool with agent_url: {self.agent_url}")

    async def initialize_agent_card(self, strict_mode: bool = False):
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(self.agent_url)
                resp.raise_for_status()
                agent_card_json = resp.json()
            agent_card = AgentCard(**agent_card_json)
            self.logger.info(f"Downloaded agent card: {agent_card.name}")
            # Make sure the name is a valid function name (letters, numbers, underscores only)
            clean_name = agent_card.name.replace('-', '_').replace('.', '_').replace(' ', '_')
            # Remove any other non-alphanumeric characters except underscores
            clean_name = ''.join(c for c in clean_name if c.isalnum() or c == '_')
            # Ensure it starts with a letter or underscore
            if clean_name and not (clean_name[0].isalpha() or clean_name[0] == '_'):
                clean_name = f"agent_{clean_name}"
            self.name = clean_name or "a2a_agent_tool"
            self.url = agent_card.url
            self.description = (
                agent_card.description or f"Send a message to {agent_card.name}"
            )
            self.initialized = True
        except httpx.ConnectError as e:
            error_msg = f"Cannot connect to A2A agent at {self.agent_url}: {e}"
            self.logger.error(error_msg)
            
            if strict_mode:
                # In strict mode, raise the error so it surfaces to the user
                raise e
            
            # Set fallback values so the tool can still be created (graceful degradation)
            # Make sure the name is a valid function name (letters, numbers, underscores only)
            url_part = self.agent_url.split('/')[-1].replace('-', '_').replace('.', '_')
            # Remove any other non-alphanumeric characters except underscores
            url_part = ''.join(c for c in url_part if c.isalnum() or c == '_')
            self.name = f"a2a_agent_{url_part}" if url_part else "a2a_agent_unknown"
            self.url = self.agent_url
            self.description = f"A2A agent at {self.agent_url} (connection failed)"
            self.initialized = False  # Mark as not properly initialized
            # Don't raise - allow the agent to start without this tool working
        except httpx.HTTPStatusError as e:
            error_msg = f"A2A agent returned {e.response.status_code}: {e}"
            self.logger.error(error_msg)
            
            if strict_mode:
                # In strict mode, raise the error so it surfaces to the user
                raise e
            
            # Set fallback values
            # Make sure the name is a valid function name (letters, numbers, underscores only)
            url_part = self.agent_url.split('/')[-1].replace('-', '_').replace('.', '_')
            # Remove any other non-alphanumeric characters except underscores
            url_part = ''.join(c for c in url_part if c.isalnum() or c == '_')
            self.name = f"a2a_agent_{url_part}" if url_part else "a2a_agent_unknown"
            self.url = self.agent_url
            self.description = f"A2A agent at {self.agent_url} (HTTP {e.response.status_code})"
            self.initialized = False
            # Don't raise for 404s and other HTTP errors - graceful degradation
        except Exception as e:
            self.logger.error(f"Failed to download or parse agent card: {e}", exc_info=True)
            
            if strict_mode:
                # In strict mode, raise the error so it surfaces to the user
                raise e
            
            # Set fallback values for any other error
            self.name = "a2a_agent_unknown"
            self.url = self.agent_url
            self.description = f"A2A agent at {self.agent_url} (initialization failed)"
            self.initialized = False
            # Don't raise - allow graceful degradation

    def _get_declaration(self) -> types.FunctionDeclaration:
        if not self.initialized:
            # Return a disabled tool declaration instead of raising
            return types.FunctionDeclaration(
                name=self.name or "a2a_agent_disabled",
                description=f"A2A agent tool (disabled: {self.description})",
                parameters=types.Schema(
                    type=types.Type.OBJECT,
                    properties={
                        "message": types.Schema(
                            type=types.Type.STRING,
                            description="Message to send (tool currently disabled)"
                        )
                    },
                    required=["message"]
                )
            )
        # function takes a single 'message' argument (the A2A Message object)
        return types.FunctionDeclaration(
            name=self.name,
            description=self.description,
            parameters=types.Schema(
                properties={
                    "message": types.Schema(
                        description="A2A Message object to send to the agent",
                    ),
                },
                required=["message"],
            ),
        )

    async def run_async(
        self, *, args: dict[str, Any], tool_context: ToolContext
    ) -> Any:
        self.logger.info(f"Running A2ATool with args: {args}")
        # only 'message' is provided by LLM
        msg = args.get("message")
        if msg is None:
            self.logger.error("A2ATool 'message' argument is missing.")
            raise ValueError("'message' argument is required for A2ATool.")

        request_id = str(uuid4())
        # wrap into TaskSendParams: id and message
        message = types.Content(parts=[types.Part(text=msg)]).model_dump()
        payload = {
            "jsonrpc": "2.0",
            "id": request_id,
            "method": "tasks/send",
            "params": {"id": request_id, "message": message},
        }
        self.logger.info(
            f"Sending A2A request to {self.agent_url} with payload: {payload}"
        )
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(self.url, json=payload)
                self.logger.info(
                    f"Received response from A2A agent: status_code={response.status_code}"
                )
                response.raise_for_status()  # Raise an exception for bad status codes
                result = response.json()
                self.logger.info(f"A2A response JSON: {result}")
            # Return the JSON-RPC result or full response
            if "result" in result:
                return result["result"]
            return result
        except httpx.HTTPStatusError as e:
            self.logger.error(
                f"A2A HTTP error: {e.response.status_code} - {e.response.text}",
                exc_info=True,
            )
            raise
        except httpx.RequestError as e:
            self.logger.error(f"A2A request error: {e}", exc_info=True)
            raise
        except Exception as e:
            self.logger.error(f"Unexpected error in A2ATool: {e}", exc_info=True)
            raise
