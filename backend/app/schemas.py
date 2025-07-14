from typing import Any, Literal, Union, TypeVar, Generic, Annotated
from uuid import uuid4
from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field, ConfigDict, field_serializer

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
    message: Content | None = None
    timestamp: datetime = Field(default_factory=datetime.now)

    @field_serializer("timestamp")
    def serialize_dt(self, dt: datetime, _info: Any) -> str:
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

    name: str | None = None
    description: str | None = None
    parts: list[Part]
    metadata: dict[str, Any] | None = None
    index: int = 0
    append: bool | None = None
    lastChunk: bool | None = None


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
    sessionId: str | None = None
    status: TaskStatus
    artifacts: list[Artifact] | None = None
    history: list[Event] | None = None
    metadata: dict[str, Any] | None = None


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

    schemes: list[str]
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
    acceptedOutputModes: list[str] | None = None
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

A2ARequest = Annotated[
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


## Error types ##


class JSONParseError(JSONRPCError):
    code: int = -32700
    message: str = "Invalid JSON payload"
    data: Any | None = None


class InvalidRequestError(JSONRPCError):
    code: int = -32600
    message: str = "Request payload validation error"
    data: Any | None = None


class MethodNotFoundError(JSONRPCError):
    code: int = -32601
    message: str = "Method not found"
    data: None = None


class InvalidParamsError(JSONRPCError):
    code: int = -32602
    message: str = "Invalid parameters"
    data: Any | None = None


class InternalError(JSONRPCError):
    code: int = -32603
    message: str = "Internal error"
    data: Any | None = None


class TaskNotFoundError(JSONRPCError):
    code: int = -32001
    message: str = "Task not found"
    data: None = None


class TaskNotCancelableError(JSONRPCError):
    code: int = -32002
    message: str = "Task cannot be canceled"
    data: None = None


class PushNotificationNotSupportedError(JSONRPCError):
    code: int = -32003
    message: str = "Push Notification is not supported"
    data: None = None


class UnsupportedOperationError(JSONRPCError):
    code: int = -32004
    message: str = "This operation is not supported"
    data: None = None


class ContentTypeNotSupportedError(JSONRPCError):
    code: int = -32005
    message: str = "Incompatible content types"
    data: None = None


class AuthenticationError(JSONRPCError):
    code: int = -32006
    message: str = "Authentication required"
    data: None = None


class AuthorizationError(JSONRPCError):
    code: int = -32007
    message: str = "Insufficient permissions"
    data: None = None


class RateLimitError(JSONRPCError):
    code: int = -32008
    message: str = "Rate limit exceeded"
    data: None = None


class ServiceUnavailableError(JSONRPCError):
    code: int = -32009
    message: str = "Service temporarily unavailable"
    data: None = None


class InvalidSessionError(JSONRPCError):
    code: int = -32010
    message: str = "Invalid or expired session"
    data: None = None


class ConfigurationError(JSONRPCError):
    code: int = -32011
    message: str = "Configuration error"
    data: None = None


class ResourceNotFoundError(JSONRPCError):
    code: int = -32012
    message: str = "Resource not found"
    data: None = None


class ValidationError(JSONRPCError):
    code: int = -32013
    message: str = "Validation failed"
    data: None = None


class TimeoutError(JSONRPCError):
    code: int = -32014
    message: str = "Request timeout"
    data: None = None


class NetworkError(JSONRPCError):
    code: int = -32015
    message: str = "Network error"
    data: None = None


class MCPServerError(JSONRPCError):
    code: int = -32016
    message: str = "MCP server connection failed"
    data: None = None


class MCPToolError(JSONRPCError):
    code: int = -32017
    message: str = "MCP tool execution failed"
    data: None = None


class MCPConfigurationError(JSONRPCError):
    code: int = -32018
    message: str = "MCP server configuration error"
    data: None = None


class A2AAgentError(JSONRPCError):
    code: int = -32019
    message: str = "A2A agent connection failed"
    data: None = None


class A2AAgentNotFoundError(JSONRPCError):
    code: int = -32020
    message: str = "A2A agent not found"
    data: None = None


# --- Agent Card Models (unchanged) ---


class AgentProvider(BaseModel):
    organization: str
    url: str | None = None


class AgentCapabilities(BaseModel):
    streaming: bool = False
    pushNotifications: bool = False
    stateTransitionHistory: bool = False


class AgentAuthentication(BaseModel):
    schemes: list[str]
    credentials: str | None = None


class AgentSkill(BaseModel):
    id: str
    name: str
    description: str | None = None
    tags: list[str] | None = None
    examples: list[str] | None = None
    inputModes: list[str] | None = None
    outputModes: list[str] | None = None


class AgentCard(BaseModel):
    name: str
    description: str | None = None
    url: str
    provider: AgentProvider | None = None
    version: str
    documentationUrl: str | None = None
    capabilities: AgentCapabilities
    authentication: AgentAuthentication | None = None
    defaultInputModes: list[str] = ["text"]
    defaultOutputModes: list[str] = ["text"]
    skills: list[AgentSkill]
