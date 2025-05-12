from pydantic import BaseModel
from typing import List


class Tool(BaseModel):
    """
    Represents a tool that an agent can use.

    Attributes:
        name: The name of the tool
        type: The type of the tool (e.g., "function")
        schema: JSON schema defining the tool's interface
    """

    name: str
    type: str
    tool_schema: dict


class AgentInfo(BaseModel):
    name: str
    description: str
    model_name: str
    model_parameters: dict
    tools: List[Tool] = []


class MockConfig(BaseModel):
    enabled: bool
    mock_data: dict


class Model(BaseModel):
    model_name: str
    display_name: str
