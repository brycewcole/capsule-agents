from typing import Annotated
from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

from backend.app.configure_schemas import AgentInfo, Model
from backend.app.dependicies.deps import model_list
from backend.app.services.configure_service import ConfigureService

router = APIRouter(prefix="/configure", tags=["configure"])


class RequestBodyModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class ResponseModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class PutAgentRequestBody(RequestBodyModel):
    name: str
    description: str
    model_name: str


class GetAgentResponse(ResponseModel):
    name: str
    description: str
    model_name: str
    model_parameters: dict


# Agent Info Endpoints
@router.get("/agent", response_model=GetAgentResponse)
def get_agent_info(service: Annotated[ConfigureService, Depends()]):
    agent_info = service.get_agent_info()
    return GetAgentResponse(
        name=agent_info.name,
        description=agent_info.description,
        model_name=agent_info.model_name,
        model_parameters=agent_info.model_parameters,
    )


@router.put("/agent", response_model=AgentInfo)
def update_agent_info(
    body: PutAgentRequestBody, service: Annotated[ConfigureService, Depends()]
):
    agent_info = AgentInfo(
        name=body.name,
        description=body.description,
        model_name=body.model_name,
        model_parameters={},
    )
    return service.upsert_agent_info(agent_info)


@router.get("/models", response_model=list[Model])
def get_model_list(models: Annotated[list[Model], Depends(model_list)]):
    return models


# # Mock Config Endpoints
# @router.get("/mocks", response_model=MockConfig)
# def get_mock_config():
#     return mock_config_db


# @router.put("/mocks", response_model=MockConfig)
# def update_mock_config(config: MockConfig):
#     global mock_config_db
#     mock_config_db = config
#     return mock_config_db
