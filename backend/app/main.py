import json
import logging
from typing import Annotated
from fastapi import Body, Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from dotenv import load_dotenv
import os

from pydantic import ValidationError

from backend.app.routers import configure
from backend.app.schemas import (
    A2ARequest,
    AgentCard,
    CancelTaskRequest,
    CancelTaskResponse,
    GetTaskPushNotificationRequest,
    GetTaskRequest,
    GetTaskResponse,
    JSONRPCError,
    JSONRPCResponse,
    SendTaskRequest,
    SendTaskResponse,
    SendTaskStreamingRequest,
    SetTaskPushNotificationRequest,
    TaskResubscriptionRequest,
)
from backend.app.services.agent_service import AgentService
from fastapi.exceptions import RequestValidationError


app = FastAPI()

# Mount the Next.js static export at the /editor endpoint
# This will serve the index.html from static directory when accessing /editor
# app.mount("/editor", StaticFiles(directory="static", html=True), name="editor")


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    logger.error(f"Validation error: {exc}", exc_info=True)
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors()},
    )


logger = logging.getLogger(__name__)
load_dotenv(dotenv_path="backend/.env")
app.include_router(configure.router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ALLOWED_ORIGINS", "*").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", tags=["Health"])
async def health():
    """
    Health check endpoint to verify if the API is running.

    Returns:
        dict: A status message indicating the API is operational

    Example response:
    ```json
    {
        "status": "ok"
    }
    ```
    """
    return {"status": "ok"}


@app.get("/.well-known/agent.json", response_model=AgentCard, tags=["Agent"])
async def agent_card(service: AgentService = Depends(AgentService)):
    """
    Returns the Agent Card containing metadata and capabilities information.

    The Agent Card defines the agent's identity, capabilities, and available actions
    following Agent-to-Agent (A2A) protocol specifications.

    Returns:
        AgentCard: A structured object containing agent details and capabilities

    Example response:
    ```json
    {
        "name": "weather_agent",
        "description": "This agent handles weather-related queries",
        "capabilities": [...]
    }
    ```
    """
    agent_card = await service.get_agent_card()
    return JSONResponse(content=agent_card.model_dump(exclude_none=True))


@app.post(
    "/",
    tags=["JSON-RPC"],
    summary="Main JSON-RPC endpoint supporting Agent-to-Agent (A2A) protocol operations.",
    description="""
This endpoint handles multiple types of JSON-RPC requests:

- **SendTask**: Create a new task for the agent to process
- **GetTask**: Retrieve the current status and result of a task
- **CancelTask**: Terminate a running task
- **SetTaskPushNotification**: Configure push notification settings for a task
- **GetTaskPushNotification**: Retrieve current push notification settings
- **SendTaskStreaming**: Create a task and receive updates via server-sent events
- **TaskResubscription**: Reconnect to an existing task stream

**Status Codes**:
- 200: Successful operation
- 400: Invalid JSON-RPC request format
- 404: Method not found or task not found
- 500: Internal server error
""",
    response_description="JSON response or streaming response depending on the request type",
)
async def rpc_root(
    request: Request,
    service: Annotated[AgentService, Depends()],
    body: dict = Body(
        ...,
        description="JSON-RPC request payload. The structure depends on the method being called.",
    ),
):
    """
    Main JSON-RPC endpoint supporting Agent-to-Agent (A2A) protocol operations.
    """
    raw = await request.body()
    try:
        rpc_req = A2ARequest.validate_python(json.loads(raw))
    except ValidationError as e:
        # JSON parse or validation error
        err = JSONRPCError(code=-32600, message=str(e))
        return JSONResponse(
            status_code=400, content=JSONRPCResponse(id=None, error=err).model_dump()
        )

    rpc_id = rpc_req.id

    try:
        if isinstance(rpc_req, SendTaskRequest):
            task = await service.send_task(rpc_req.params)
            return JSONResponse(
                content=SendTaskResponse(id=rpc_id, result=task).model_dump()
            )

        if isinstance(rpc_req, GetTaskRequest):
            task = await service.get_task(rpc_req.params)
            return JSONResponse(
                content=GetTaskResponse(id=rpc_id, result=task).model_dump()
            )

        if isinstance(rpc_req, CancelTaskRequest):
            cancelled = await service.cancel_task(rpc_req.params)
            return JSONResponse(
                content=CancelTaskResponse(id=rpc_id, result=cancelled).model_dump()
            )

        if isinstance(rpc_req, SetTaskPushNotificationRequest):
            updated = await service.set_push(rpc_req.params)
            return JSONResponse(
                content=JSONRPCResponse(id=rpc_id, result=updated).model_dump()
            )

        if isinstance(rpc_req, GetTaskPushNotificationRequest):
            current = await service.get_push(rpc_req.params)
            return JSONResponse(
                content=JSONRPCResponse(id=rpc_id, result=current).model_dump()
            )

        if isinstance(rpc_req, SendTaskStreamingRequest):
            params = rpc_req.params

            async def sse():
                async for ev in service.subscribe_stream(params):
                    yield f"data: {JSONRPCResponse(id=rpc_id, result=ev).model_dump_json()}\n\n"

            return StreamingResponse(sse(), media_type="text/event-stream")

        if isinstance(rpc_req, TaskResubscriptionRequest):
            params = rpc_req.params

            async def resume():
                async for ev in await service.resubscribe_stream(params):
                    yield f"data: {JSONRPCResponse(id=rpc_id, result=ev).model_dump_json()}\n\n"

            return StreamingResponse(resume(), media_type="text/event-stream")

        # method not found
        err = JSONRPCError(code=-32601, message=f"Method {rpc_req.method} not found")
        return JSONResponse(
            status_code=404, content=JSONRPCResponse(id=rpc_id, error=err).model_dump()
        )

    except KeyError as ke:
        err = JSONRPCError(code=-32001, message=str(ke))
        return JSONResponse(
            status_code=404,
            content=JSONRPCResponse(id=rpc_id, error=err).model_dump(exclude_none=True),
        )
    except Exception as ex:
        err = JSONRPCError(code=-32603, message=str(ex))
        return JSONResponse(
            status_code=500, content=JSONRPCResponse(id=rpc_id, error=err).model_dump()
        )
