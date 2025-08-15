import { v4 as uuidv4 } from 'uuid';
import { A2AClient } from '@a2a-js/sdk/client';
import type { Task as A2ATask, Message as A2AMessage, TaskStatusUpdateEvent, TaskArtifactUpdateEvent } from '@a2a-js/sdk';

const API_BASE_URL = '';

const a2aClient = new A2AClient(API_BASE_URL || 'http://localhost:8080');

// Auth store for credentials
class AuthStore {
    private credentials: string | null = null;

    setCredentials(username: string, password: string) {
        this.credentials = btoa(`${username}:${password}`);
    }

    clearCredentials() {
        this.credentials = null;
    }

    getAuthHeaders(): Record<string, string> {
        if (!this.credentials) {
            return {};
        }
        return {
            'Authorization': `Basic ${this.credentials}`
        };
    }

    isAuthenticated(): boolean {
        return this.credentials !== null;
    }
}

export const authStore = new AuthStore();

// Function to test login credentials
export async function testLogin(password: string): Promise<boolean> {
    try {
        // Temporarily set credentials
        authStore.setCredentials('admin', password);

        // Test with a simple API call
        await getAgentInfo();

        return true;
    } catch (error) {
        // Clear credentials on failure
        authStore.clearCredentials();
        throw error;
    }
}

// Types from backend
type Content = {
    role: string;
    parts: { text: string }[];
};

type TaskState = 'submitted' | 'working' | 'input-required' | 'completed' | 'canceled' | 'failed' | 'unknown';

type TaskStatus = {
    state: TaskState;
    message?: Content;
    timestamp: string;
};

type Model = {
    model_name: string;
    display_name: string;
}

type Part = {
    text?: string;
    function_call?: {
        id: string;
        name: string;
        args: Record<string, unknown>;
    };
    function_response?: {
        id: string;
        name: string;
        response: unknown;
    };
};

type Artifact = {
    name?: string;
    description?: string;
    parts: Part[];
    metadata?: Record<string, any>;
    index: number;
    append?: boolean;
    lastChunk?: boolean;
};

type Task = {
    id: string;
    sessionId?: string;
    status: TaskStatus;
    artifacts?: Artifact[];
    history?: any[];
    metadata?: Record<string, any>;
};





// Type for tool definition
export type Tool = {
    name: string;
    type: string;
    tool_schema: Record<string, any>;
};

// Type for tool calls
export type ToolCall = {
    name: string;
    args: Record<string, unknown>;
    result?: unknown;
};

// Types for agent configuration
export type AgentInfo = {
    name: string;
    description: string;
    modelName: string;
    modelParameters: Record<string, any>;
    tools?: Tool[];
};



// Function to send a message to the agent using A2A SDK
export async function sendMessage(message: string, contextId?: string | null) {
    const messageId = uuidv4();

    const a2aMessage: A2AMessage = {
        kind: "message",
        messageId,
        parts: [{
            kind: "text",
            text: message
        }],
        role: "user",
        contextId: contextId || uuidv4()
    };

    try {
        const result = await a2aClient.sendMessage({
            message: a2aMessage,
            configuration: {
                acceptedOutputModes: ["text/plain"],
                blocking: true
            }
        });

        return result;
    } catch (error) {
        console.error("Error sending message:", error);
        throw error;
    }
}

// A2A Stream Event Type combining all possible events
type A2AStreamEventType = A2ATask | A2AMessage | TaskStatusUpdateEvent | TaskArtifactUpdateEvent;

// Function to stream messages from the agent using A2A SDK
export async function* streamMessage(message: string, contextId?: string | null): AsyncGenerator<A2AStreamEventType> {
    const messageId = uuidv4();

    const a2aMessage: A2AMessage = {
        kind: "message",
        messageId,
        parts: [{
            kind: "text",
            text: message
        }],
        role: "user",
        contextId: contextId || uuidv4()
    };

    try {
        const stream = a2aClient.sendMessageStream({
            message: a2aMessage,
            configuration: {
                acceptedOutputModes: ["text/plain"],
                blocking: false
            }
        });

        for await (const event of stream) {
            yield event;
        }
    } catch (error) {
        console.error("Error streaming message:", error);
        throw error;
    }
}

// Function to get agent health status
export async function checkHealth(): Promise<{ status: string }> {
    try {
        const response = await fetch(`${API_BASE_URL}/api/health`);

        if (!response.ok) {
            throw {
                code: response.status,
                message: `Health check failed: ${response.status}`,
                user_message: "Cannot connect to the backend service",
                recovery_action: "Check if the service is running and try again",
                isAPIError: true
            };
        }

        return await response.json();
    } catch (error) {
        console.error("Health check failed:", error);
        throw error;
    }
}

// Types for session history
type SessionEvent = {
    id: string;
    author: string;
    timestamp: number;
    content: string | null;
    actions: string | null;
    partial: boolean;
    turnComplete: boolean;
};

type SessionHistoryResponse = {
    sessionId: string;
    events: SessionEvent[];
};

// Function to get session chat history
export async function getSessionHistory(sessionId: string): Promise<SessionHistoryResponse> {
    try {
        const response = await fetch(`${API_BASE_URL}/api/sessions/${sessionId}/history`, {
            headers: {
                ...authStore.getAuthHeaders()
            }
        });

        if (!response.ok) {
            throw {
                code: response.status,
                message: `Failed to fetch session history: ${response.status}`,
                user_message: response.status === 401 ? "Please log in to view session history" : "Could not load session history",
                recovery_action: response.status === 401 ? "Log in and try again" : "Try again later",
                isAPIError: true
            };
        }

        return await response.json();
    } catch (error) {
        console.error("Failed to fetch session history:", error);
        throw error;
    }
}

// Function to get agent metadata using A2A SDK
export async function getAgentCard() {
    try {
        return await a2aClient.getAgentCard();
    } catch (error) {
        console.error("Failed to fetch agent card:", error);
        throw error;
    }
}

// Function to get agent configuration
export async function getAgentInfo(): Promise<AgentInfo> {
    try {
        const response = await fetch(`${API_BASE_URL}/api/agent`, {
            headers: {
                ...authStore.getAuthHeaders()
            }
        });

        if (!response.ok) {
            throw {
                code: response.status,
                message: `Failed to fetch agent config: ${response.status}`,
                user_message: response.status === 401 ? "Please log in to view agent configuration" : "Could not load agent configuration",
                recovery_action: response.status === 401 ? "Log in and try again" : "Try again later",
                isAPIError: true
            };
        }

        return await response.json();
    } catch (error) {
        console.error("Failed to fetch agent info:", error);
        throw error;
    }
}

// Function to update agent configuration
export async function updateAgentInfo(info: AgentInfo): Promise<AgentInfo> {
    const body: any = { ...info };
    const response = await fetch(`${API_BASE_URL}/api/agent`, {
        method: "PUT",
        headers: {
            "Content-Type": "application/json",
            ...authStore.getAuthHeaders()
        },
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const errorText = await response.text();
        let errorData;

        try {
            errorData = JSON.parse(errorText);
        } catch {
            errorData = { message: errorText };
        }

        throw {
            code: response.status,
            message: `Failed to update agent config: ${response.status}`,
            data: errorData,
            user_message: response.status === 401 ? "Please log in to update agent configuration" : "Could not save agent configuration",
            recovery_action: response.status === 401 ? "Log in and try again" : "Check your changes and try again",
            isAPIError: true
        };
    }

    return response.json();
}

// Function to get the list of available models
export async function getAvailableModels(): Promise<Model[]> {
    try {
        const response = await fetch(`${API_BASE_URL}/api/models`, {
            headers: {
                ...authStore.getAuthHeaders()
            }
        });

        if (!response.ok) {
            throw {
                code: response.status,
                message: `Failed to fetch models: ${response.status}`,
                user_message: response.status === 401 ? "Please log in to view available models" : "Could not load available models",
                recovery_action: response.status === 401 ? "Log in and try again" : "Try again later",
                isAPIError: true
            };
        }

        return await response.json() as Model[];
    } catch (error) {
        console.error("Failed to fetch available models:", error);
        throw error;
    }
}


// Helper function to extract tool calls from A2A task or message
export function extractToolCalls(taskOrEvent: A2ATask | A2AMessage | any): ToolCall[] {
    const toolCalls: ToolCall[] = []

    // Handle A2A Task type
    if (taskOrEvent.kind === "task" && taskOrEvent.history) {
        console.log("Processing A2A task history with", taskOrEvent.history.length, "messages")

        // Track function calls and their responses
        const functionCalls = new Map<string, { name: string; args: Record<string, unknown> }>()

        for (const message of taskOrEvent.history) {
            if (message.parts) {
                for (const part of message.parts) {
                    // Check for function calls
                    if ('function_call' in part && part.function_call) {
                        console.log("Found function call:", part.function_call)
                        functionCalls.set(part.function_call.id, {
                            name: part.function_call.name,
                            args: part.function_call.args || {}
                        })
                    }

                    // Check for function responses
                    if ('function_response' in part && part.function_response) {
                        console.log("Found function response:", part.function_response)
                        const callId = part.function_response.id
                        const call = functionCalls.get(callId)

                        if (call) {
                            toolCalls.push({
                                name: call.name,
                                args: call.args,
                                result: part.function_response.response
                            })
                            console.log("Created tool call:", { name: call.name, args: call.args, result: part.function_response.response })
                        }
                    }
                }
            }
        }
    }
    // Handle legacy Task type for backward compatibility
    else if (taskOrEvent.history && taskOrEvent.history.length > 0) {
        console.log("Processing legacy task history")
        // Keep the old logic for backward compatibility
        const functionCalls = new Map<string, { name: string; args: Record<string, unknown> }>()

        for (const event of taskOrEvent.history) {
            if (event.content && event.content.parts) {
                for (const part of event.content.parts) {
                    if (part.function_call) {
                        functionCalls.set(part.function_call.id, {
                            name: part.function_call.name,
                            args: part.function_call.args || {}
                        })
                    }

                    if (part.function_response) {
                        const callId = part.function_response.id
                        const call = functionCalls.get(callId)

                        if (call) {
                            toolCalls.push({
                                name: call.name,
                                args: call.args,
                                result: part.function_response.response
                            })
                        }
                    }
                }
            }
        }
    }

    console.log("Final extracted tool calls:", toolCalls)
    return toolCalls
}

// Helper function to extract text from A2A response
export function extractResponseText(taskOrEvent: A2ATask | A2AMessage | Task | A2AStreamEventType): string {
    // Handle A2A Message
    if ('kind' in taskOrEvent && taskOrEvent.kind === "message") {
        return taskOrEvent.parts
            .filter(part => part.kind === "text")
            .map(part => part.text)
            .join('');
    }

    // Handle A2A Task
    if ('kind' in taskOrEvent && taskOrEvent.kind === "task") {
        const a2aTask = taskOrEvent as A2ATask;

        // First try to get text from artifacts if they exist
        if (a2aTask.artifacts && a2aTask.artifacts.length > 0) {
            const textArtifact = a2aTask.artifacts.find(artifact =>
                artifact.parts && artifact.parts.some(part => 'text' in part)
            );

            if (textArtifact) {
                return textArtifact.parts.map(part => 'text' in part ? part.text : '').join('');
            }
        }

        // Check status message
        if (a2aTask.status && a2aTask.status.message) {
            // Handle legacy Content type in status message
            const statusMessage = a2aTask.status.message as any;
            if (statusMessage.parts) {
                return statusMessage.parts
                    .map((part: any) => part.text || '')
                    .join('');
            }
        }

        // Check latest message in history
        if (a2aTask.history && a2aTask.history.length > 0) {
            const lastMessage = a2aTask.history[a2aTask.history.length - 1];
            if (lastMessage.role === "agent") {
                return lastMessage.parts
                    .filter(part => part.kind === "text")
                    .map(part => part.text)
                    .join('');
            }
        }
    }

    // Handle status update events
    if ('kind' in taskOrEvent && taskOrEvent.kind === "status-update") {
        const statusEvent = taskOrEvent as TaskStatusUpdateEvent;
        if (statusEvent.status.message) {
            const statusMessage = statusEvent.status.message as any;
            // Handle A2A message format with kind and parts
            if (statusMessage.kind === "message" && statusMessage.parts) {
                return statusMessage.parts
                    .filter((part: any) => part.kind === "text")
                    .map((part: any) => part.text || '')
                    .join('');
            }
            // Handle legacy Content type in status message
            if (statusMessage.parts) {
                return statusMessage.parts
                    .map((part: any) => part.text || '')
                    .join('');
            }
        }
    }

    // Handle legacy Task type for backward compatibility
    const legacyTask = taskOrEvent as Task;
    if (legacyTask.artifacts && legacyTask.artifacts.length > 0) {
        const textArtifact = legacyTask.artifacts.find(artifact =>
            artifact.parts && artifact.parts.some(part => 'text' in part)
        );

        if (textArtifact) {
            return textArtifact.parts.map(part => 'text' in part ? part.text : '').join('');
        }
    }

    if (legacyTask.status && legacyTask.status.message && legacyTask.status.message.parts) {
        return legacyTask.status.message.parts
            .map(part => 'text' in part ? part.text : '')
            .join('');
    }

    return "";
}

// Types for chat management
export interface ChatSummary {
  id: string;
  title: string;
  lastActivity: number;
  messageCount: number;
  preview: string;
  createTime: number;
}

export interface ChatWithHistory {
  contextId: string;
  title: string;
  messages: any[];
  tasks: any[];
  metadata: Record<string, any>;
  createTime: number;
  updateTime: number;
}

// Chat management API functions
export async function getChatsList(): Promise<ChatSummary[]> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/chats`, {
      headers: {
        ...authStore.getAuthHeaders()
      }
    });

    if (!response.ok) {
      throw {
        code: response.status,
        message: `Failed to fetch chats: ${response.status}`,
        user_message: response.status === 401 ? "Please log in to view chats" : "Could not load chat list",
        recovery_action: response.status === 401 ? "Log in and try again" : "Try again later",
        isAPIError: true
      };
    }

    const data = await response.json();
    return data.chats || [];
  } catch (error) {
    console.error("Failed to fetch chats list:", error);
    throw error;
  }
}

export async function getChatById(contextId: string): Promise<ChatWithHistory> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/chats/${contextId}`, {
      headers: {
        ...authStore.getAuthHeaders()
      }
    });

    if (!response.ok) {
      throw {
        code: response.status,
        message: `Failed to fetch chat: ${response.status}`,
        user_message: response.status === 404 ? "Chat not found" : response.status === 401 ? "Please log in to view this chat" : "Could not load chat",
        recovery_action: response.status === 401 ? "Log in and try again" : "Try again later",
        isAPIError: true
      };
    }

    return await response.json();
  } catch (error) {
    console.error("Failed to fetch chat by ID:", error);
    throw error;
  }
}

export async function deleteChatById(contextId: string): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/chats/${contextId}`, {
      method: 'DELETE',
      headers: {
        ...authStore.getAuthHeaders()
      }
    });

    if (!response.ok) {
      throw {
        code: response.status,
        message: `Failed to delete chat: ${response.status}`,
        user_message: response.status === 404 ? "Chat not found" : response.status === 401 ? "Please log in to delete this chat" : "Could not delete chat",
        recovery_action: response.status === 401 ? "Log in and try again" : "Try again later",
        isAPIError: true
      };
    }

    const result = await response.json();
    return result.success === true;
  } catch (error) {
    console.error("Failed to delete chat:", error);
    throw error;
  }
}

export async function updateChatMetadata(contextId: string, metadata: Record<string, any>): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/chats/${contextId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...authStore.getAuthHeaders()
      },
      body: JSON.stringify(metadata)
    });

    if (!response.ok) {
      throw {
        code: response.status,
        message: `Failed to update chat: ${response.status}`,
        user_message: response.status === 404 ? "Chat not found" : response.status === 401 ? "Please log in to update this chat" : "Could not update chat",
        recovery_action: response.status === 401 ? "Log in and try again" : "Try again later",
        isAPIError: true
      };
    }

    const result = await response.json();
    return result.success === true;
  } catch (error) {
    console.error("Failed to update chat metadata:", error);
    throw error;
  }
}

// Export A2A types for use in components
export type { A2AMessage, A2ATask, A2AStreamEventType, TaskStatusUpdateEvent, TaskArtifactUpdateEvent };
