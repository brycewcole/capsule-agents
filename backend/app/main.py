import json
import logging
from typing import Annotated
from fastapi import Body, Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from dotenv import load_dotenv
import os
import httpx
import sqlite3

from fastapi.staticfiles import StaticFiles
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
    JSONRPCResponse,
    SendTaskRequest,
    SendTaskResponse,
    SendTaskStreamingRequest,
    SetTaskPushNotificationRequest,
    TaskResubscriptionRequest,
    JSONRPCError,
    JSONParseError,
    InvalidRequestError,
    InvalidParamsError,
    InternalError,
    NetworkError,
    A2AAgentError,
    A2AAgentNotFoundError,
)
from backend.app.utils.exceptions import APIException, JSONRPCException
from backend.app.utils.error_handler import (
    api_exception_handler,
    json_rpc_exception_handler,
)
from backend.app.services.agent_service import AgentService
from fastapi.exceptions import RequestValidationError


app = FastAPI()

# Mount specific static asset directories that won't conflict with API routes
app.mount("/assets", StaticFiles(directory="static/assets"), name="assets")
app.mount("/editor", StaticFiles(directory="static", html=True), name="editor")

# Also serve vite.svg explicitly
app.mount("/vite.svg", StaticFiles(directory="static", html=False), name="vite")


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    logger.error(f"Validation error: {exc}", exc_info=True)
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors()},
    )


@app.exception_handler(APIException)
async def api_exception_handler_wrapper(request: Request, exc: APIException):
    return await api_exception_handler(request, exc)


@app.exception_handler(JSONRPCException)
async def jsonrpc_exception_handler(request: Request, exc: JSONRPCException):
    return await json_rpc_exception_handler(request, exc)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception: {exc}", exc_info=True)

    json_rpc_error: JSONRPCError

    if isinstance(exc, ValidationError):
        json_rpc_error = InvalidRequestError(message=str(exc))
    elif isinstance(exc, ValueError):
        # Default ValueError to InvalidParamsError, or InternalError if more generic
        json_rpc_error = InvalidParamsError(message=str(exc))
    elif isinstance(exc, httpx.ConnectError):
        json_rpc_error = NetworkError(message=f"Connection failed: {exc}")
    elif isinstance(exc, httpx.HTTPStatusError):
        if exc.response.status_code == 404:
            json_rpc_error = A2AAgentNotFoundError(
                message=f"A2A agent not found: {exc.request.url}"
            )
        else:
            json_rpc_error = A2AAgentError(
                message=f"HTTP error from A2A agent: {exc.response.status_code} - {exc.response.text}"
            )
    elif isinstance(exc, sqlite3.OperationalError):
        json_rpc_error = InternalError(message=f"Database operational error: {exc}")
    elif isinstance(exc, json.JSONDecodeError):
        json_rpc_error = JSONParseError(message=f"JSON parsing error: {exc}")
    else:
        json_rpc_error = InternalError(message=f"An unexpected error occurred: {exc}")

    return JSONResponse(
        status_code=200,
        content=JSONRPCResponse(id=None, error=json_rpc_error).model_dump(
            mode="json", exclude_none=True
        ),
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
    logger.info(f"Received JSON-RPC request: {raw}")
    try:
        rpc_req = A2ARequest.validate_python(json.loads(raw))
        logger.info(
            f"Parsed JSON-RPC request: method={getattr(rpc_req, 'method', None)}, id={getattr(rpc_req, 'id', None)}"
        )
    except ValidationError as e:
        raise JSONRPCException(code=-32600, message=str(e))

    rpc_id = rpc_req.id

    if isinstance(rpc_req, SendTaskRequest):
        logger.info(f"Handling SendTaskRequest: id={rpc_id}")
        task = await service.send_task(rpc_req.params)
        logger.info(f"SendTaskRequest result: {task}")
        return JSONResponse(
            content=SendTaskResponse(id=rpc_id, result=task).model_dump(mode="json")
        )

    if isinstance(rpc_req, GetTaskRequest):
        logger.info(f"Handling GetTaskRequest: id={rpc_id}")
        task = await service.get_task(rpc_req.params)
        logger.info(f"GetTaskRequest result: {task}")
        return JSONResponse(
            content=GetTaskResponse(id=rpc_id, result=task).model_dump(mode="json")
        )

    if isinstance(rpc_req, CancelTaskRequest):
        logger.info(f"Handling CancelTaskRequest: id={rpc_id}")
        cancelled = await service.cancel_task(rpc_req.params)
        logger.info(f"CancelTaskRequest result: {cancelled}")
        return JSONResponse(
            content=CancelTaskResponse(id=rpc_id, result=cancelled).model_dump(
                mode="json"
            )
        )

    if isinstance(rpc_req, SetTaskPushNotificationRequest):
        logger.info(f"Handling SetTaskPushNotificationRequest: id={rpc_id}")
        updated = await service.set_push(rpc_req.params)
        logger.info(f"SetTaskPushNotificationRequest result: {updated}")
        return JSONResponse(
            content=JSONRPCResponse(id=rpc_id, result=updated).model_dump(mode="json")
        )

    if isinstance(rpc_req, GetTaskPushNotificationRequest):
        logger.info(f"Handling GetTaskPushNotificationRequest: id={rpc_id}")
        current = await service.get_push(rpc_req.params)
        logger.info(f"GetTaskPushNotificationRequest result: {current}")
        return JSONResponse(
            content=JSONRPCResponse(id=rpc_id, result=current).model_dump(mode="json")
        )

    if isinstance(rpc_req, SendTaskStreamingRequest):
        logger.info(f"Handling SendTaskStreamingRequest: id={rpc_id}")
        params = rpc_req.params

        async def sse():
            async for ev in service.subscribe_stream(params):
                logger.info(f"Streaming event for SendTaskStreamingRequest: {ev}")
                yield f"data: {JSONRPCResponse(id=rpc_id, result=ev).model_dump_json()}\n\n"

        return StreamingResponse(sse(), media_type="text/event-stream")

    if isinstance(rpc_req, TaskResubscriptionRequest):
        logger.info(f"Handling TaskResubscriptionRequest: id={rpc_id}")
        params = rpc_req.params

        async def resume():
            async for ev in await service.resubscribe_stream(params):
                logger.info(f"Streaming event for TaskResubscriptionRequest: {ev}")
                yield f"data: {JSONRPCResponse(id=rpc_id, result=ev).model_dump_json()}\n\n"

        return StreamingResponse(resume(), media_type="text/event-stream")

    raise JSONRPCException(code=-32601, message=f"Method {rpc_req.method} not found")
