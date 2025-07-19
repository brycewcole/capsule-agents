from pydantic import BaseModel, Field, ConfigDict
from typing import Any, ClassVar


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
    tool_schema: dict[str, Any]


class AgentInfo(BaseModel):
    name: str
    description: str
    model_name: str
    model_parameters: dict[str, Any]
    tools: list[Tool] = []


class MockConfig(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(extra="allow")
    enabled: bool
    mock_data: dict[str, Any] = Field(default_factory=dict)


class Model(BaseModel):
    model_name: str
    display_name: str


class PrebuiltToolsSettings(BaseModel):
    file_access: bool
    brave_search: bool


class PrebuiltToolsSetting(BaseModel):
    tool_name: str
    enabled: bool
