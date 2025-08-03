import { v4 as uuidv4 } from 'uuid';

const API_BASE_URL = '';

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


type JSONRPCRequest<P, M extends string> = {
    jsonrpc: "2.0";
    id: string | number;
    method: M;
    params: P;
};

type JSONRPCResponse<T = any> = {
    jsonrpc: "2.0";
    id: string | number;
    result?: T;
    error?: {
        code: number;
        message: string;
        data?: any;
        user_message?: string;
        recovery_action?: string;
    };
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

// A2A Message Types
type A2AMessage = {
    kind: "message";
    messageId: string;
    parts: Array<{
        kind: "text";
        text: string;
    }>;
    role: "user" | "agent";
    taskId?: string;
    contextId?: string;
};

type A2AMessageSendParams = {
    message: A2AMessage;
    configuration?: {
        acceptedOutputModes?: string[];
        blocking?: boolean;
        historyLength?: number;
    };
    metadata?: Record<string, any>;
};

// Function to send a message to the agent using A2A protocol
export async function sendMessage(message: string, _sessionId?: string): Promise<Task> {
    const messageId = uuidv4();

    const a2aMessage: A2AMessage = {
        kind: "message",
        messageId,
        parts: [{
            kind: "text",
            text: message
        }],
        role: "user"
    };

    const payload: JSONRPCRequest<A2AMessageSendParams, "message/send"> = {
        jsonrpc: "2.0",
        id: uuidv4(),
        method: "message/send",
        params: {
            message: a2aMessage,
            configuration: {
                acceptedOutputModes: ["text/plain"],
                blocking: true
            }
        },
    };

    try {
        const response = await fetch(`${API_BASE_URL}/`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
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
                message: `HTTP ${response.status}: ${response.statusText}`,
                data: errorData,
                user_message: `Request failed with status ${response.status}`,
                recovery_action: response.status >= 500 ? "Try again later" : "Check your request and try again",
                isAPIError: true
            };
        }

        const data = await response.json() as JSONRPCResponse<Task>;

        if (data.error) {
            throw {
                ...data.error,
                isAPIError: true
            };
        }

        return data.result as Task;
    } catch (error) {
        console.error("Error sending message:", error);
        throw error;
    }
}

// A2A Streaming Response Types
type A2ATaskStatusUpdateEvent = {
    kind: "status-update";
    taskId: string;
    contextId: string;
    status: TaskStatus;
    final: boolean;
    metadata?: Record<string, any>;
};

type A2ATaskArtifactUpdateEvent = {
    kind: "artifact-update";
    taskId: string;
    contextId: string;
    artifact: Artifact;
    metadata?: Record<string, any>;
};

type A2ATask = {
    id: string;
    kind: "task";
    contextId: string;
    status: TaskStatus;
    history?: A2AMessage[];
    artifacts?: Artifact[];
    metadata?: Record<string, any>;
};

type A2AStreamEventType = A2ATask | A2AMessage | A2ATaskStatusUpdateEvent | A2ATaskArtifactUpdateEvent;

// Function to stream messages from the agent using A2A protocol
export async function* streamMessage(message: string, _sessionId?: string): AsyncGenerator<A2AStreamEventType> {
    const messageId = uuidv4();

    const a2aMessage: A2AMessage = {
        kind: "message",
        messageId,
        parts: [{
            kind: "text",
            text: message
        }],
        role: "user"
    };

    const payload: JSONRPCRequest<A2AMessageSendParams, "message/stream"> = {
        jsonrpc: "2.0",
        id: uuidv4(),
        method: "message/stream",
        params: {
            message: a2aMessage,
            configuration: {
                acceptedOutputModes: ["text/plain"],
                blocking: false
            }
        },
    };

    try {
        const response = await fetch(`${API_BASE_URL}/`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
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
                message: `HTTP ${response.status}: ${response.statusText}`,
                data: errorData,
                user_message: `Streaming request failed with status ${response.status}`,
                recovery_action: response.status >= 500 ? "Try again later" : "Check your request and try again",
                isAPIError: true
            };
        }

        const reader = response.body!.getReader();
        const decoder = new TextDecoder();

        let buffer = '';

        while (true) {
            const { value, done } = await reader.read();

            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            const lines = buffer.split('\n\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const json = line.slice(6).trim();
                    if (json) {
                        const data = JSON.parse(json) as JSONRPCResponse<A2AStreamEventType>;

                        if (data.error) {
                            throw {
                                ...data.error,
                                isAPIError: true
                            };
                        }

                        if (data.result) {
                            yield data.result;
                        }
                    }
                }
            }
        }
    } catch (error) {
        console.error("Error streaming message:", error);
        throw error;
    }
}

// Function to get agent health status
export async function checkHealth(): Promise<{ status: string }> {
    try {
        const response = await fetch(`${API_BASE_URL}/health`);

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

// Function to get agent metadata
export async function getAgentCard() {
    try {
        const response = await fetch(`${API_BASE_URL}/.well-known/agent.json`);

        if (!response.ok) {
            throw {
                code: response.status,
                message: `Failed to fetch agent metadata: ${response.status}`,
                user_message: "Could not load agent information",
                recovery_action: "Try again later",
                isAPIError: true
            };
        }

        return await response.json();
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
    console.log("extractToolCalls called with:", taskOrEvent)
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
        const statusEvent = taskOrEvent as A2ATaskStatusUpdateEvent;
        if (statusEvent.status.message) {
            // Handle legacy Content type in status message
            const statusMessage = statusEvent.status.message as any;
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

// Export A2A types for use in components
export type { A2AMessage, A2ATask, A2AStreamEventType, A2ATaskStatusUpdateEvent, A2ATaskArtifactUpdateEvent };