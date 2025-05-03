from datetime import datetime
from google.adk.runners import Runner
from typing import Annotated, Dict
from fastapi import Depends
from google.genai import types
from backend.app.dependicies.deps import runner
from backend.app.schemas import Task, TaskIdParams, TaskPushNotificationConfig
from backend.app.schemas import (
    AgentCapabilities,
    AgentCard,
    TaskQueryParams,
    TaskSendParams,
    TaskState,
    TaskStatus,
)


class AgentService:
    def __init__(self, runner: Annotated[Runner, Depends(runner)]):
        self.store: Dict[str, Task] = {}
        self.push_store: Dict[str, TaskPushNotificationConfig] = {}
        self.runner = runner

    async def send_task(self, params: TaskSendParams) -> Task:
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
        content = types.Content(role="user", parts=[types.Part(text=query)])
        session = self.runner.session_service.get_session(
            app_name=self.runner.app_name,
            user_id=params.sessionId,
            session_id=params.sessionId,
        )
        if session is None:
            session = self.runner.session_service.create_session(
                app_name=self.runner.app_name,
                user_id=params.sessionId,
                state={},
                session_id=params.sessionId,
            )

        # Track state changes and responses
        async for event in self.runner.run_async(
            user_id=params.sessionId, session_id=params.sessionId, new_message=content
        ):
            # Update task history with each event message if present
            if event:
                task.history.append(event)
            # Update task status on final response
            if event.is_final_response():
                if event.content and event.content.parts:
                    task.status.state = TaskState.COMPLETED
                    task.status.message = event.content
                    task.status.timestamp = datetime.now()
                break

        # Store the updated task
        self.store[params.id] = task
        return task

    async def get_task(self, params: TaskQueryParams) -> Task:
        task = self.store.get(params.id)
        if not task:
            raise ValueError(f"Task {params.id} not found")
        return task

    async def cancel_task(self, params: TaskIdParams) -> Task:
        task = self.store.get(params.id)
        if not task:
            raise ValueError(f"Task {params.id} not found")
        task.status.state = TaskState.CANCELED
        return task

    async def set_push(self, params: TaskPushNotificationConfig):
        self.push_store[params.id] = params
        return params

    async def get_push(self, params: TaskIdParams):
        return self.push_store.get(params.id)

    def subscribe_stream(self, params: TaskSendParams):
        # This is a stub for streaming; in real use, yield updates as async generator
        async def stream():
            task = await self.send_task(params)
            yield task

        return stream()

    async def resubscribe_stream(self, params: TaskIdParams):
        # This is a stub for resubscription; in real use, yield updates as async generator
        task = self.store.get(params.id)
        if not task:
            raise ValueError(f"Task {params.id} not found")

        async def stream():
            yield task

        return stream()

    async def get_agent_card(self) -> AgentCard:
        """
        Return agent metadata and capabilities.
        """
        return AgentCard(
            name="your_agent_name",
            description="Describe your agent here.",
            version="1.0.0",
            url="https://your-agent-url.com",
            skills=[],
            capabilities=AgentCapabilities(
                streaming=True,
                pushNotifications=True,
                stateTransitionHistory=True,
            ),
        )
