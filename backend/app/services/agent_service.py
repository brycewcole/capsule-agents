from datetime import datetime
import logging
import os  # Add logging import
from google.adk.runners import Runner
from typing import Annotated
from google.adk.sessions import Session
from fastapi import Depends
from google.genai import types
from backend.app.dependicies.deps import get_runner
from backend.app.schemas import (
    Task,
    TaskIdParams,
    TaskPushNotificationConfig,
    JSONRPCError,
)
from backend.app.schemas import (
    AgentCapabilities,
    AgentCard,
    TaskQueryParams,
    TaskSendParams,
    TaskState,
    TaskStatus,
)

logger = logging.getLogger(__name__)  # Initialize logger for the module


class AgentService:
    def __init__(self, runner: Annotated[Runner, Depends(get_runner)]):
        self.store: dict[str, Task] = {}
        self.push_store: dict[str, TaskPushNotificationConfig] = {}
        self.runner = runner
        logger.info(
            f"AgentService initialized with runner for app: {self.runner.app_name}"
        )

    async def send_task(self, params: TaskSendParams) -> Task:
        logger.info(
            f"send_task called for task_id: {params.id}, session_id: {params.sessionId}"
        )
        # Create a new task and store it
        task = Task(
            id=params.id,
            sessionId=params.sessionId,
            status=TaskStatus(
                state=TaskState.SUBMITTED,
                message=params.message,
                timestamp=datetime.now(),
            ),
            artifacts=[],
            history=[],
            metadata=params.metadata,
        )
        # Ensure history is initialized as a list
        if task.history is None:
            task.history = []
        self.store[params.id] = task

        # Prepare the user's message in ADK format
        query = params.message.parts[0].text if params.message.parts else ""
        logger.info(f"Task {params.id}: User query: '{query}'")
        content = types.Content(role="user", parts=[types.Part(text=query)])

        logger.info(
            f"Task {params.id}: Getting or creating session for user_id: {params.sessionId}"
        )
        session: Session | None = await self.runner.session_service.get_session(
            app_name=self.runner.app_name,
            user_id=params.sessionId,
            session_id=params.sessionId,
        )
        if session is None:
            logger.info(
                f"Task {params.id}: Creating new session for user_id: {params.sessionId}"
            )
            session = await self.runner.session_service.create_session(
                app_name=self.runner.app_name,
                user_id=params.sessionId,
                state={},
                session_id=params.sessionId,
            )
        else:
            logger.info(
                f"Task {params.id}: Using existing session for user_id: {params.sessionId}"
            )

        # Track state changes and responses
        logger.info(
            f"Task {params.id}: Starting runner.run_async for session_id: {params.sessionId}"
        )
        async for event in self.runner.run_async(
            user_id=params.sessionId, session_id=params.sessionId, new_message=content
        ):
            logger.info(f"Task {params.id}: Received event from runner: {event}")
            # Update task history with each event message if present
            if event:
                task.history.append(event)
            # Update task status on final response
            if event.is_final_response():
                logger.info(f"Task {params.id}: Received final response from runner.")
                if event.content and event.content.parts:
                    task.status.state = TaskState.COMPLETED
                    task.status.message = event.content
                    task.status.timestamp = datetime.now()
                    logger.info(f"Task {params.id}: Status updated to COMPLETED.")
                else:
                    logger.warning(
                        f"Task {params.id}: Final response received but no content/parts found."
                    )
                break

        logger.info(
            f"Task {params.id}: Processing complete. Final status: {task.status.state}"
        )
        # Store the updated task
        self.store[params.id] = task
        return task

    async def get_task(self, params: TaskQueryParams) -> Task:
        logger.info(f"get_task called for task_id: {params.id}")
        task = self.store.get(params.id)
        if not task:
            logger.warning(f"Task {params.id} not found in store.")
            raise ValueError(f"Task {params.id} not found")
        logger.info(f"Task {params.id} retrieved successfully.")
        return task

    async def cancel_task(self, params: TaskIdParams) -> Task:
        logger.info(f"cancel_task called for task_id: {params.id}")
        task = self.store.get(params.id)
        if not task:
            logger.warning(f"Task {params.id} not found for cancellation.")
            raise ValueError(f"Task {params.id} not found")
        task.status.state = TaskState.CANCELED
        logger.info(f"Task {params.id} status set to CANCELED.")
        return task

    async def set_push(self, params: TaskPushNotificationConfig):
        logger.info(f"set_push called for task_id: {params.id}")
        self.push_store[params.id] = params
        return params

    async def get_push(self, params: TaskIdParams):
        logger.info(f"get_push called for task_id: {params.id}")
        config = self.push_store.get(params.id)
        if config:
            logger.info(f"Push config found for task_id: {params.id}")
        else:
            logger.info(f"No push config found for task_id: {params.id}")
        return config

    def subscribe_stream(self, params: TaskSendParams):
        logger.info(
            f"subscribe_stream called for task_id: {params.id}, session_id: {params.sessionId}"
        )

        # This is a stub for streaming; in real use, yield updates as async generator
        async def stream():
            logger.info(f"Stream started for task_id: {params.id}")
            task = await self.send_task(params)
            logger.info(f"Stream yielding task for task_id: {params.id}")
            yield task
            logger.info(f"Stream finished for task_id: {params.id}")

        return stream()

    async def resubscribe_stream(self, params: TaskIdParams):
        logger.info(f"resubscribe_stream called for task_id: {params.id}")
        # This is a stub for resubscription; in real use, yield updates as async generator
        task = self.store.get(params.id)
        if not task:
            logger.warning(f"Task {params.id} not found for resubscription.")
            raise ValueError(f"Task {params.id} not found")

        async def stream():
            logger.info(f"Resubscription stream started for task_id: {params.id}")
            yield task
            logger.info(f"Resubscription stream finished for task_id: {params.id}")

        return stream()

    async def get_agent_card(self) -> AgentCard:
        agent = self.runner.agent
        agent_url = os.getenv("AGENT_URL")
        if not agent_url:
            raise ValueError("AGENT_URL environment variable is not set.")
        logger.info(f"Agent URL: {agent_url}")
        return AgentCard(
            name=agent.name,
            description=agent.description,
            version="0.1",
            url=agent_url,
            skills=[],  # TODO - Add skills if available
            capabilities=AgentCapabilities(
                streaming=True,
                pushNotifications=True,
                stateTransitionHistory=True,
            ),
        )
