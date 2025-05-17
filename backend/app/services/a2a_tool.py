from google.adk.tools import BaseTool
import httpx
from uuid import uuid4
from typing import Any, Dict  # added Dict for typing
from google.genai import types
from google.adk.tools.tool_context import ToolContext


class A2ATool(BaseTool):
    def __init__(self, agent_url: str):
        super().__init__(
            name="a2a_call",
            description="Send a single message to remote A2A agent via tasks/send",
            is_long_running=False,
        )
        self.agent_url = agent_url

    def _get_declaration(self) -> types.FunctionDeclaration:
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
        self, *, args: Dict[str, Any], tool_context: ToolContext
    ) -> Any:
        # only 'message' is provided by LLM
        msg = args["message"]
        request_id = str(uuid4())
        # wrap into TaskSendParams: id and message
        payload = {
            "jsonrpc": "2.0",
            "id": request_id,
            "method": "tasks/send",
            "params": {"id": request_id, "message": msg},
        }
        async with httpx.AsyncClient() as client:
            response = await client.post(self.agent_url, json=payload)
            response.raise_for_status()
            result = response.json()
        # Return the JSON-RPC result or full response
        if "result" in result:
            return result["result"]
        return result
