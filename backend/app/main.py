import json
import logging
from typing import Annotated
from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from google.adk.agents import Agent
from dotenv import load_dotenv
import os

from pydantic import ValidationError

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


MODEL_GEMINI_2_0_FLASH = "gemini-2.0-flash"
MODEL_GPT_4O = "openai/gpt-4o"
MODEL_CLAUDE_SONNET = "anthropic/claude-3-sonnet-20240229"

app = FastAPI()
logger = logging.getLogger(__name__)
load_dotenv(dotenv_path="backend/.env")

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
    Health check: quick up/down probe
    """
    return {"status": "ok"}


def get_agent() -> Agent:
    return Agent(
        name="weather_agent",
        model=MODEL_GEMINI_2_0_FLASH,
        description="This agent handles weather-related queries.",
    )


@app.get("/.well-known/agent.json", response_model=AgentCard, tags=["Agent"])
async def agent_card(service: AgentService = Depends(AgentService)):
    """
    Agent Card: metadata & capabilities
    """
    agent_card = await service.get_agent_card()
    return JSONResponse(content=agent_card.model_dump(exclude_none=True))


@app.post("/", tags=["JSON-RPC"])
async def rpc_root(request: Request, service: Annotated[AgentService, Depends()]):
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


# @app.get("/")
# async def root(query: str):
#     # Optionally retrieve the API key from the environment
#     GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
#     if not GOOGLE_API_KEY:
#         print("GOOGLE_API_KEY not set in environment.")
#     else:
#         print("GOOGLE_API_KEY loaded successfully.")

#     session_service = InMemorySessionService()

#     APP_NAME = "weather_tutorial_app"
#     USER_ID = "user_1"
#     SESSION_ID = "session_001"

#     # Create the specific session where the conversation will happen
#     session = session_service.create_session(
#         app_name=APP_NAME, user_id=USER_ID, session_id=SESSION_ID
#     )
#     print(
#         f"Session created: App='{APP_NAME}', User='{USER_ID}', Session='{SESSION_ID}'"
#     )

#     weather_agent = get_agent()
#     runner = Runner(
#         agent=weather_agent,
#         app_name=APP_NAME,
#         session_service=session_service,
#     )
#     print(f"Runner created for agent '{runner.agent.name}'.")
#     print(f"\n>>> User Query: {query}")

#     # Prepare the user's message in ADK format
#     content = types.Content(role="user", parts=[types.Part(text=query)])

#     final_response_text = "Agent did not produce a final response."  # Default

#     # Key Concept: run_async executes the agent logic and yields Events.
#     # We iterate through events to find the final answer.
#     async for event in runner.run_async(
#         user_id=USER_ID, session_id=SESSION_ID, new_message=content
#     ):
#         # You can uncomment the line below to see all events during execution:
#         # print(f"  [Event] Author: {event.author}, Type: {type(event).__name__}, Final: {event.is_final_response()}, Content: {event.content}")

#         # Key Concept: is_final_response() marks the concluding message for the turn.
#         if event.is_final_response():
#             if event.content and event.content.parts:
#                 # Assuming text response in the first part
#                 final_response_text = event.content.parts[0].text
#             elif (
#                 event.actions and event.actions.escalate
#             ):  # Handle potential errors/escalations
#                 final_response_text = (
#                     f"Agent escalated: {event.error_message or 'No specific message.'}"
#                 )
#             break  # Stop processing events once the final response is found

#     print(f"<<< Agent Response: {final_response_text}")
#     return final_response_text
