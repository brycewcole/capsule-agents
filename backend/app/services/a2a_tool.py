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

    async def initialize_agent_card(self):
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(self.agent_url)
                resp.raise_for_status()
                agent_card_json = resp.json()
            agent_card = AgentCard(**agent_card_json)
            self.logger.info(f"Downloaded agent card: {agent_card.name}")
            self.name = agent_card.name
            self.url = agent_card.url
            self.description = (
                agent_card.description or f"Send a message to {agent_card.name}"
            )
            self.initialized = True
        except Exception as e:
            self.logger.error(
                f"Failed to download or parse agent card: {e}", exc_info=True
            )
            raise e

    def _get_declaration(self) -> types.FunctionDeclaration:
        if not self.initialized:
            raise ValueError(
                "Trying to get declaration before agent card is initialized."
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
