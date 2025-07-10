from typing import Any, List, Optional, Literal, Union, TypeVar, Generic, Annotated
from uuid import uuid4
from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field, TypeAdapter, ConfigDict, field_serializer

from google.genai.types import Part, Content
from google.adk.events.event import Event


# --- Task State Enum ---
class TaskState(str, Enum):
    """
    Enumeration of possible states for an agent task.

    Values:
    - SUBMITTED: Task has been submitted but processing hasn't started yet
    - WORKING: Task is currently being processed by the agent
    - INPUT_REQUIRED: Task requires additional input from the user to proceed
    - COMPLETED: Task has been successfully completed
    - CANCELED: Task was manually canceled before completion
    - FAILED: Task encountered an error and could not complete
    - UNKNOWN: Task is in an unrecognized state
    """

    SUBMITTED = "submitted"
    WORKING = "working"
    INPUT_REQUIRED = "input-required"
    COMPLETED = "completed"
    CANCELED = "canceled"
    FAILED = "failed"
    UNKNOWN = "unknown"


# --- Task Status ---
class TaskStatus(BaseModel):
    """
    Represents the current status of a task being processed by an agent.

    Attributes:
        state: The current state of the task (submitted, working, completed, etc.)
        message: Optional message providing additional context about the task status
        timestamp: When this status was last updated
    """

    state: TaskState
    message: Optional[Content] = None
    timestamp: datetime = Field(default_factory=datetime.now)

    @field_serializer("timestamp")
    def serialize_dt(self, dt: datetime, _info):
        return dt.isoformat()


# --- Artifact ---
class Artifact(BaseModel):
    """
    Represents a piece of content produced or processed by an agent.

    Artifacts can be text, images, or other data types that are part of
    the agent's response or intermediate outputs during task processing.

    Attributes:
        name: Optional name of the artifact
        description: Optional description of what this artifact represents
        parts: List of content parts that make up this artifact
        metadata: Additional data associated with this artifact
        index: Position in sequence if this artifact is part of a series
        append: If True, this artifact should be appended to an existing one
        lastChunk: If True, this is the final chunk of a multi-part artifact
    """

    name: Optional[str] = None
    description: Optional[str] = None
    parts: List[Part]
    metadata: Optional[dict[str, Any]] = None
    index: int = 0
    append: Optional[bool] = None
    lastChunk: Optional[bool] = None


# --- Task ---
class Task(BaseModel):
    """
    Represents an agent task with all its associated data.

    A task is a unit of work being performed by the agent, with information about
    its current state, outputs, and history.

    Attributes:
        id: Unique identifier for the task
        sessionId: Optional identifier for the session this task belongs to
        status: Current status information for the task
        artifacts: Optional list of outputs produced by the task
        history: Optional list of events that occurred during task processing
        metadata: Optional additional data associated with this task
    """

    id: str
    sessionId: Optional[str] = None
    status: TaskStatus
    artifacts: Optional[List[Artifact]] = None
    history: Optional[List[Event]] = None
    metadata: Optional[dict[str, Any]] = None


class TaskStatusUpdateEvent(BaseModel):
    """
    Event representing a status update for a task.

    Sent when the task state changes (e.g., from "working" to "completed").

    Attributes:
        id: Unique identifier of the task
        status: Updated status information
        final: Whether this is the final status update for the task
        metadata: Optional additional data about this update
    """

    id: str
    status: TaskStatus
    final: bool = False
    metadata: dict[str, Any] | None = None


class TaskArtifactUpdateEvent(BaseModel):
    """
    Event representing a new or updated artifact for a task.

    Sent when the agent produces or updates output artifacts during task processing.

    Attributes:
        id: Unique identifier of the task
        artifact: The artifact that was created or updated
        metadata: Optional additional data about this update
    """

    id: str
    artifact: Artifact
    metadata: dict[str, Any] | None = None


class AuthenticationInfo(BaseModel):
    model_config = ConfigDict(extra="allow")

    schemes: List[str]
    credentials: str | None = None


class PushNotificationConfig(BaseModel):
    url: str
    token: str | None = None
    authentication: AuthenticationInfo | None = None


class TaskIdParams(BaseModel):
    id: str
    metadata: dict[str, Any] | None = None


class TaskQueryParams(TaskIdParams):
    historyLength: int | None = None


class TaskSendParams(BaseModel):
    id: str
    sessionId: str = Field(default_factory=lambda: uuid4().hex)
    message: Content
    acceptedOutputModes: Optional[List[str]] = None
    pushNotification: PushNotificationConfig | None = None
    historyLength: int | None = None
    metadata: dict[str, Any] | None = None


class TaskPushNotificationConfig(BaseModel):
    id: str
    pushNotificationConfig: PushNotificationConfig


## RPC Messages (Generic approach) ##

P = TypeVar("P")
M = TypeVar("M", bound=str, covariant=True)


class JSONRPCMessage(BaseModel):
    """
    Base class for all JSON-RPC 2.0 messages.

    Attributes:
        jsonrpc: Version of the JSON-RPC protocol, always "2.0"
        id: Unique identifier for the request/response pair
    """

    jsonrpc: Literal["2.0"] = "2.0"
    id: int | str | None = Field(default_factory=lambda: uuid4().hex)


class JSONRPCRequest(JSONRPCMessage, Generic[P, M]):
    """
    Base class for all JSON-RPC requests.

    Generic parameters:
        P: Type of the request parameters
        M: Type of the method name (typically a Literal string)

    Attributes:
        method: The name of the RPC method to invoke
        params: Parameters for the method
    """

    method: M
    params: P


class JSONRPCError(BaseModel):
    """
    Represents an error in a JSON-RPC response.

    Attributes:
        code: Numeric error code
        message: Human-readable error message
        data: Optional additional error information
    """

    code: int
    message: str
    data: Any | None = None


class JSONRPCResponse(JSONRPCMessage):
    """
    Base class for all JSON-RPC responses.

    Attributes:
        result: The result of the method call if successful
        error: Error information if the call failed
    """

    result: Any | None = None
    error: JSONRPCError | None = None


# --- Concrete Request Types ---


class SendTaskRequest(JSONRPCRequest[TaskSendParams, Literal["tasks/send"]]):
    """
    JSON-RPC request for sending a new task to the agent.

    Method: "tasks/send"
    Params: TaskSendParams
    """

    pass


class SendTaskStreamingRequest(
    JSONRPCRequest[TaskSendParams, Literal["tasks/sendSubscribe"]]
):
    """
    JSON-RPC request for sending a task and subscribing to streaming updates.

    Method: "tasks/sendSubscribe"
    Params: TaskSendParams
    Returns: Server-sent events (SSE) stream of updates
    """

    pass


class GetTaskRequest(JSONRPCRequest[TaskQueryParams, Literal["tasks/get"]]):
    """
    JSON-RPC request for retrieving the current state of a task.

    Method: "tasks/get"
    Params: TaskQueryParams (contains task ID and optional history length)
    """

    pass


class CancelTaskRequest(JSONRPCRequest[TaskIdParams, Literal["tasks/cancel"]]):
    """
    JSON-RPC request for canceling an in-progress task.

    Method: "tasks/cancel"
    Params: TaskIdParams (contains task ID)
    """

    pass


class SetTaskPushNotificationRequest(
    JSONRPCRequest[TaskPushNotificationConfig, Literal["tasks/pushNotification/set"]]
):
    """
    JSON-RPC request for setting up push notifications for a task.

    Method: "tasks/pushNotification/set"
    Params: TaskPushNotificationConfig (contains task ID and push notification settings)
    """

    pass


class GetTaskPushNotificationRequest(
    JSONRPCRequest[TaskIdParams, Literal["tasks/pushNotification/get"]]
):
    """
    JSON-RPC request for retrieving the push notification configuration for a task.

    Method: "tasks/pushNotification/get"
    Params: TaskIdParams (contains task ID)
    """

    pass


class TaskResubscriptionRequest(
    JSONRPCRequest[TaskIdParams, Literal["tasks/resubscribe"]]
):
    """
    JSON-RPC request for resubscribing to a task's streaming updates.

    This is useful for reconnecting after a connection drop.

    Method: "tasks/resubscribe"
    Params: TaskIdParams (contains task ID)
    Returns: Server-sent events (SSE) stream of updates
    """

    pass


# --- Concrete Response Types ---


class SendTaskResponse(JSONRPCResponse):
    result: Task | None = None


class SendTaskStreamingResponse(JSONRPCResponse):
    result: TaskStatusUpdateEvent | TaskArtifactUpdateEvent | None = None


class GetTaskResponse(JSONRPCResponse):
    result: Task | None = None


class CancelTaskResponse(JSONRPCResponse):
    result: Task | None = None


class SetTaskPushNotificationResponse(JSONRPCResponse):
    result: TaskPushNotificationConfig | None = None


class GetTaskPushNotificationResponse(JSONRPCResponse):
    result: TaskPushNotificationConfig | None = None


# --- TypeAdapter Union for Discriminator Parsing ---

A2ARequest = TypeAdapter(
    Annotated[
        Union[
            SendTaskRequest,
            SendTaskStreamingRequest,
            GetTaskRequest,
            CancelTaskRequest,
            SetTaskPushNotificationRequest,
            GetTaskPushNotificationRequest,
            TaskResubscriptionRequest,
        ],
        Field(discriminator="method"),
    ]
)

# --- Agent Card Models (unchanged) ---


class AgentProvider(BaseModel):
    organization: str
    url: str | None = None


class AgentCapabilities(BaseModel):
    streaming: bool = False
    pushNotifications: bool = False
    stateTransitionHistory: bool = False


class AgentAuthentication(BaseModel):
    schemes: List[str]
    credentials: str | None = None


class AgentSkill(BaseModel):
    id: str
    name: str
    description: str | None = None
    tags: List[str] | None = None
    examples: List[str] | None = None
    inputModes: List[str] | None = None
    outputModes: List[str] | None = None


class AgentCard(BaseModel):
    name: str
    description: str | None = None
    url: str
    provider: AgentProvider | None = None
    version: str
    documentationUrl: str | None = None
    capabilities: AgentCapabilities
    authentication: AgentAuthentication | None = None
    defaultInputModes: List[str] = ["text"]
    defaultOutputModes: List[str] = ["text"]
    skills: List[AgentSkill]