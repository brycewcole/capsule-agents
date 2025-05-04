from pydantic import BaseModel


class AgentInfo(BaseModel):
    name: str
    description: str


class ModelConfig(BaseModel):
    model_name: str
    parameters: dict


class MockConfig(BaseModel):
    enabled: bool
    mock_data: dict
