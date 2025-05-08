from pydantic import BaseModel


class AgentInfo(BaseModel):
    name: str
    description: str
    model_name: str
    model_parameters: dict


class MockConfig(BaseModel):
    enabled: bool
    mock_data: dict


class Model(BaseModel):
    model_name: str
    display_name: str
