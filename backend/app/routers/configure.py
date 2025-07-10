import json
from typing import Annotated, List
from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

from backend.app.configure_schemas import AgentInfo, Model, Tool
from backend.app.dependicies.deps import model_list, session_service
from backend.app.dependicies.auth import get_current_user
from backend.app.services.configure_service import ConfigureService
from backend.app.services.sqlite_session_service import SQLiteSessionService
from backend.app.utils.exceptions import JSONRPCException

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
    content: str | None
    actions: str | None
    partial: bool
    turn_complete: bool


class GetSessionHistoryResponse(ResponseModel):
    session_id: str
    events: List[SessionEvent]




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
    
    print(f"DEBUG: Found {len(events_response.events)} events for session {session_id}")
    for i, event in enumerate(events_response.events):
        print(f"DEBUG: Event {i}: content={event.content}, actions={event.actions}")
    session_events = []
    for event in events_response.events:
        try:
            session_events.append(SessionEvent(
                id=event.id,
                author=event.author,
                timestamp=event.timestamp,
                content=json.dumps(event.content.model_dump(exclude_none=True)) if event.content is not None else None,
                actions=json.dumps(event.actions.model_dump(exclude_none=True)) if event.actions is not None else None,
                partial=bool(event.partial),
                turn_complete=bool(event.turn_complete)
            ))
        except Exception as e:
            print(f"ERROR: Failed to process event {event.id}: {e}")
            print(f"Event content type: {type(event.content)}, value: {event.content}")
            print(f"Event actions type: {type(event.actions)}, value: {event.actions}")
            raise JSONRPCException(code=-32000, message=f"Failed to serialize event {event.id}: {e}") # Using a generic code for now
    return GetSessionHistoryResponse(
        session_id=session_id,
        events=session_events
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