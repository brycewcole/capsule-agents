from typing import Annotated
from fastapi import APIRouter, Depends

from backend.app.configure_schemas import AgentInfo
from backend.app.services.configure_service import ConfigureService

router = APIRouter(prefix="/configure", tags=["configure"])


# Agent Info Endpoints
@router.get("/agent", response_model=AgentInfo)
def get_agent_info(service: Annotated[ConfigureService, Depends()]):
    return service.get_agent_info()


@router.put("/agent", response_model=AgentInfo)
def update_agent_info(info: AgentInfo, service: Annotated[ConfigureService, Depends()]):
    return service.upsert_agent_info(info)


# # Model Config Endpoints
# @router.get("/model", response_model=ModelConfig)
# def get_model_config():
#     return model_config_db


# @router.put("/model", response_model=ModelConfig)
# def update_model_config(config: ModelConfig):
#     global model_config_db
#     model_config_db = config
#     return model_config_db


# # Mock Config Endpoints
# @router.get("/mocks", response_model=MockConfig)
# def get_mock_config():
#     return mock_config_db


# @router.put("/mocks", response_model=MockConfig)
# def update_mock_config(config: MockConfig):
#     global mock_config_db
#     mock_config_db = config
#     return mock_config_db
