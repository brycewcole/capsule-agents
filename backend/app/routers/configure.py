import json
from typing import Annotated, List
from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

from backend.app.configure_schemas import AgentInfo, Model, Tool, PrebuiltToolsSettings
from backend.app.dependicies.deps import model_list, session_service
from backend.app.dependicies.auth import get_current_user
from backend.app.services.configure_service import ConfigureService
from backend.app.services.sqlite_session_service import SQLiteSessionService

router = APIRouter(prefix="/api", tags=["api"])


class RequestBodyModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class ResponseModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class PutAgentRequestBody(RequestBodyModel):
    name: str
    description: str
    model_name: str
    tools: List[Tool] = []


class GetAgentResponse(ResponseModel):
    name: str
    description: str
    model_name: str
    model_parameters: dict
    tools: List[Tool] = []


class SessionEvent(ResponseModel):
    id: str
    author: str
    timestamp: float
    content: str
    actions: str
    partial: bool
    turn_complete: bool


class GetSessionHistoryResponse(ResponseModel):
    session_id: str
    events: List[SessionEvent]


class GetPrebuiltToolsSettingsResponse(ResponseModel):
    file_access: bool
    brave_search: bool


class UpdatePrebuiltToolsSettingsRequest(RequestBodyModel):
    file_access: bool
    brave_search: bool


# Agent Info Endpoints
@router.get("/agent", response_model=GetAgentResponse)
def get_agent_info(
    request: Request,
    service: Annotated[ConfigureService, Depends()],
    _: Annotated[str, Depends(get_current_user)]
):
    agent_info = service.get_agent_info()
    return GetAgentResponse(
        name=agent_info.name,
        description=agent_info.description,
        model_name=agent_info.model_name,
        model_parameters=agent_info.model_parameters,
        tools=agent_info.tools,
    )


@router.put("/agent", response_model=AgentInfo)
def update_agent_info(
    request: Request,
    body: PutAgentRequestBody, 
    service: Annotated[ConfigureService, Depends()],
    _: Annotated[str, Depends(get_current_user)]
):
    tools = [Tool(**tool.model_dump()) for tool in body.tools]
    agent_info = AgentInfo(
        name=body.name,
        description=body.description,
        model_name=body.model_name,
        model_parameters={},
        tools=tools,
    )
    return service.upsert_agent_info(agent_info)


@router.get("/models", response_model=list[Model])
def get_model_list(
    request: Request,
    models: Annotated[list[Model], Depends(model_list)],
    _: Annotated[str, Depends(get_current_user)]
):
    return models


@router.get("/sessions/{session_id}/history", response_model=GetSessionHistoryResponse)
def get_session_history(
    request: Request,
    session_id: str, 
    service: Annotated[SQLiteSessionService, Depends(session_service)],
    _: Annotated[str, Depends(get_current_user)]
):
    """Get chat history for a specific session."""
    # Use the same app_name and user_id as the agent service
    events_response = service.list_events(
        app_name="weather_tutorial_app",
        user_id=session_id,  # Agent service uses session_id as user_id
        session_id=session_id
    )
    session_events = [
        SessionEvent(
            id=event.id,
            author=event.author,
            timestamp=event.timestamp,
            content=json.dumps(event.content.model_dump(exclude_none=True)) if event.content else "",
            actions=json.dumps(event.actions.model_dump(exclude_none=True)) if event.actions else "",
            partial=bool(event.partial),
            turn_complete=bool(event.turn_complete)
        )
        for event in events_response.events
    ]
    return GetSessionHistoryResponse(
        session_id=session_id,
        events=session_events
    )


# Prebuilt Tools Settings Endpoints
@router.get("/prebuilt-tools", response_model=GetPrebuiltToolsSettingsResponse)
def get_prebuilt_tools_settings(
    request: Request,
    service: Annotated[ConfigureService, Depends()],
    _: Annotated[str, Depends(get_current_user)]
):
    settings = service.get_prebuilt_tools_settings()
    return GetPrebuiltToolsSettingsResponse(
        file_access=settings.get("file_access", True),
        brave_search=settings.get("brave_search", True)
    )


@router.put("/prebuilt-tools", response_model=GetPrebuiltToolsSettingsResponse)
def update_prebuilt_tools_settings(
    request: Request,
    body: UpdatePrebuiltToolsSettingsRequest, 
    service: Annotated[ConfigureService, Depends()],
    _: Annotated[str, Depends(get_current_user)]
):
    settings = {
        "file_access": body.file_access,
        "brave_search": body.brave_search
    }
    updated_settings = service.update_prebuilt_tools_settings(settings)
    return GetPrebuiltToolsSettingsResponse(
        file_access=updated_settings.get("file_access", True),
        brave_search=updated_settings.get("brave_search", True)
    )


# # Mock Config Endpoints
# @router.get("/mocks", response_model=MockConfig)
# def get_mock_config():
#     return mock_config_db


# @router.put("/mocks", response_model=MockConfig)
# def update_mock_config(config: MockConfig):
#     global mock_config_db
#     mock_config_db = config
#     return mock_config_db
