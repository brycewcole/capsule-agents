import json
from typing import Annotated, Any, cast
from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

from backend.app.configure_schemas import AgentInfo, Model, Tool
from backend.app.dependicies.deps import model_list, session_service
from backend.app.dependicies.auth import get_current_user
from backend.app.services.configure_service import ConfigureService
from backend.app.services.sqlite_session_service import SQLiteSessionService
from backend.app.schemas import Event


router = APIRouter(prefix="/api", tags=["api"])


class RequestBodyModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class ResponseModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class PutAgentRequestBody(RequestBodyModel):
    name: str
    description: str
    model_name: str
    tools: list[Tool] = []


class GetAgentResponse(ResponseModel):
    name: str
    description: str
    model_name: str
    model_parameters: dict[str, Any]
    tools: list[Tool] = []


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
    events: list[SessionEvent]


# Agent Info Endpoints
@router.get("/agent", response_model=GetAgentResponse)
def get_agent_info(
    service: Annotated[ConfigureService, Depends()],
    _body: Annotated[str, Depends(get_current_user)],
):
    agent_info = service.get_agent_info()
    return GetAgentResponse(
        name=agent_info.name,
        description=agent_info.description,
        model_name=agent_info.model_name,
        model_parameters=cast(dict[str, Any], agent_info.model_parameters),
        tools=agent_info.tools,
    )


@router.put("/agent", response_model=AgentInfo)
def update_agent_info(
    body: PutAgentRequestBody,
    service: Annotated[ConfigureService, Depends()],
    _: Annotated[str, Depends(get_current_user)],
):
    tools = [
        Tool(
            name=tool.name,
            type=tool.type,
            tool_schema=tool.tool_schema,
        )
        for tool in body.tools
    ]
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
    models: Annotated[list[Model], Depends(model_list)],
    _: Annotated[str, Depends(get_current_user)],
):
    return models


@router.get("/sessions/{session_id}/history", response_model=GetSessionHistoryResponse)
async def get_session_history(
    session_id: str,
    service: Annotated[SQLiteSessionService, Depends(session_service)],
    _: Annotated[str, Depends(get_current_user)],
):
    """Get chat history for a specific session."""
    # Use the same app_name and user_id as the agent service
    session = await service.get_session(
        app_name="weather_tutorial_app",
        user_id=session_id,  # Agent service uses session_id as user_id
        session_id=session_id,
    )
    if not session:
        # Return empty history if session doesn't exist yet
        return GetSessionHistoryResponse(session_id=session_id, events=[])

    print(f"DEBUG: Found {len(session.events)} events for session {session_id}")
    for i, event in enumerate(session.events):
        print(f"DEBUG: Event {i}: content={event.content}, actions={event.actions}")
    session_events: list[SessionEvent] = []
    event_item: Event
    for event_item in session.events:
        try:
            session_events.append(
                SessionEvent(
                    id=str(event_item.id),
                    author=str(event_item.author),
                    timestamp=float(event_item.timestamp),
                    content=json.dumps(event_item.content.model_dump(exclude_none=True))
                    if event_item.content is not None
                    else None,
                    actions=json.dumps(event_item.actions.model_dump(exclude_none=True))
                    if event_item.actions is not None
                    else None,
                    partial=bool(event_item.partial),
                    turn_complete=bool(event_item.turn_complete),
                )
            )
        except Exception as e:
            print(f"ERROR: Failed to process event {event_item.id}: {e}")
            print(
                f"Event content type: {type(event_item.content)}, value: {event_item.content}"
            )
            print(
                f"Event actions type: {type(event_item.actions)}, value: {event_item.actions}"
            )
            raise ValueError(f"Failed to serialize event {event_item.id}: {e}")
    return GetSessionHistoryResponse(session_id=session_id, events=session_events)
