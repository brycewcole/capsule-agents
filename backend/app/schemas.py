from typing import Any, List, Optional, Literal, Union, TypeVar, Generic, Annotated
from uuid import uuid4
from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field, TypeAdapter, ConfigDict, field_serializer

from google.genai.types import Part, Content
from google.adk.events.event import Event


# --- Task State Enum ---
class TaskState(str, Enum):
    SUBMITTED = "submitted"
    WORKING = "working"
    INPUT_REQUIRED = "input-required"
    COMPLETED = "completed"
    CANCELED = "canceled"
    FAILED = "failed"
    UNKNOWN = "unknown"


# --- Task Status ---
class TaskStatus(BaseModel):
    state: TaskState
    message: Optional[Content] = None
    timestamp: datetime = Field(default_factory=datetime.now)

    @field_serializer("timestamp")
    def serialize_dt(self, dt: datetime, _info):
        return dt.isoformat()


# --- Artifact ---
class Artifact(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    parts: List[Part]
    metadata: Optional[dict[str, Any]] = None
    index: int = 0
    append: Optional[bool] = None
    lastChunk: Optional[bool] = None


# --- Task ---
class Task(BaseModel):
    id: str
    sessionId: Optional[str] = None
    status: TaskStatus
    artifacts: Optional[List[Artifact]] = None
    history: Optional[List[Event]] = None
    metadata: Optional[dict[str, Any]] = None


class TaskStatusUpdateEvent(BaseModel):
    id: str
    status: TaskStatus
    final: bool = False
    metadata: dict[str, Any] | None = None


class TaskArtifactUpdateEvent(BaseModel):
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
    jsonrpc: Literal["2.0"] = "2.0"
    id: int | str | None = Field(default_factory=lambda: uuid4().hex)


class JSONRPCRequest(JSONRPCMessage, Generic[P, M]):
    method: M
    params: P


class JSONRPCError(BaseModel):
    code: int
    message: str
    data: Any | None = None


class JSONRPCResponse(JSONRPCMessage):
    result: Any | None = None
    error: JSONRPCError | None = None


# --- Concrete Request Types ---


class SendTaskRequest(JSONRPCRequest[TaskSendParams, Literal["tasks/send"]]):
    pass


class SendTaskStreamingRequest(
    JSONRPCRequest[TaskSendParams, Literal["tasks/sendSubscribe"]]
):
    pass


class GetTaskRequest(JSONRPCRequest[TaskQueryParams, Literal["tasks/get"]]):
    pass


class CancelTaskRequest(JSONRPCRequest[TaskIdParams, Literal["tasks/cancel"]]):
    pass


class SetTaskPushNotificationRequest(
    JSONRPCRequest[TaskPushNotificationConfig, Literal["tasks/pushNotification/set"]]
):
    pass


class GetTaskPushNotificationRequest(
    JSONRPCRequest[TaskIdParams, Literal["tasks/pushNotification/get"]]
):
    pass


class TaskResubscriptionRequest(
    JSONRPCRequest[TaskIdParams, Literal["tasks/resubscribe"]]
):
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


class A2AClientError(Exception):
    pass


class A2AClientHTTPError(A2AClientError):
    def __init__(self, status_code: int, message: str):
        self.status_code = status_code
        self.message = message
        super().__init__(f"HTTP Error {status_code}: {message}")


class A2AClientJSONError(A2AClientError):
    def __init__(self, message: str):
        self.message = message
        super().__init__(f"JSON Error: {message}")


class MissingAPIKeyError(Exception):
    """Exception for missing API key."""

    pass
