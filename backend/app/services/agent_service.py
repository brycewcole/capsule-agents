from datetime import datetime
from backend.app.schemas import (
    AgentCapabilities,
    AgentCard,
    Task,
    TaskIdParams,
    TaskPushNotificationConfig,
    TaskQueryParams,
    TaskSendParams,
    TaskState,
    TaskStatus,
    Message,
    Artifact,
    TextPart,
)


class AgentService:
    def __init__(self, store, push_store):
        self.store = store  # Dict[str, Task]
        self.push_store = push_store  # Dict[str, PushNotificationConfig]

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
            history=[params.message],
            metadata=params.metadata,
        )
        self.store[params.id] = task
        task.artifacts = []
        # Simulate agent invocation (replace with real agent logic)
        # Here, just echo the user message as agent response
        first_part = params.message.parts[0]
        text = first_part.text if isinstance(first_part, TextPart) else "Non-text part"
        agent_response = Message(
            role="agent",
            parts=[TextPart(text="Task received: " + text)],
        )
        task.status = TaskStatus(
            state=TaskState.COMPLETED,
            message=agent_response,
            timestamp=datetime.now(),
        )
        task.artifacts.append(Artifact(parts=agent_response.parts, index=0))
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
        self.push_store[params.id] = params.pushNotificationConfig
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
