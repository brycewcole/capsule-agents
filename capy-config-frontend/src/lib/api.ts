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

type TaskSendParams = {
    id: string;
    sessionId: string;
    message: Content;
    acceptedOutputModes?: string[];
    historyLength?: number;
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

type TaskStatusUpdateEvent = {
    id: string;
    status: TaskStatus;
    final: boolean;
    metadata?: Record<string, any>;
};

type TaskArtifactUpdateEvent = {
    id: string;
    artifact: Artifact;
    metadata?: Record<string, any>;
};

type StreamEventType = TaskStatusUpdateEvent | TaskArtifactUpdateEvent;

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

// Function to send a message to the agent
export async function sendMessage(message: string, sessionId?: string): Promise<Task> {
    const taskId = uuidv4();
    // Use the provided sessionId if available, otherwise create a new one
    const currentSessionId = sessionId || uuidv4();

    const payload: JSONRPCRequest<TaskSendParams, "tasks/send"> = {
        jsonrpc: "2.0",
        id: uuidv4(),
        method: "tasks/send",
        params: {
            id: taskId,
            sessionId: currentSessionId,
            message: {
                role: "user",
                parts: [{ text: message }],
            },
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

// Function to stream messages from the agent
export async function* streamMessage(message: string, sessionId?: string): AsyncGenerator<StreamEventType> {
    const taskId = uuidv4();
    // Use the provided sessionId if available, otherwise create a new one
    const currentSessionId = sessionId || uuidv4();

    const payload: JSONRPCRequest<TaskSendParams, "tasks/sendSubscribe"> = {
        jsonrpc: "2.0",
        id: uuidv4(),
        method: "tasks/sendSubscribe",
        params: {
            id: taskId,
            sessionId: currentSessionId,
            message: {
                role: "user",
                parts: [{ text: message }],
            },
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
                        const data = JSON.parse(json) as JSONRPCResponse<StreamEventType>;

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


// Helper function to extract tool calls from task history
export function extractToolCalls(task: Task): ToolCall[] {
    console.log("extractToolCalls called with task:", task)
    const toolCalls: ToolCall[] = []
    
    if (task.history && task.history.length > 0) {
        console.log("Processing task history with", task.history.length, "events")
        
        // Track function calls and their responses
        const functionCalls = new Map<string, { name: string; args: Record<string, unknown> }>()
        
        for (const event of task.history) {
            console.log("Processing event:", event)
            
            if (event.content && event.content.parts) {
                for (const part of event.content.parts) {
                    // Check for function calls
                    if (part.function_call) {
                        console.log("Found function call:", part.function_call)
                        functionCalls.set(part.function_call.id, {
                            name: part.function_call.name,
                            args: part.function_call.args || {}
                        })
                    }
                    
                    // Check for function responses
                    if (part.function_response) {
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
    } else {
        console.log("No task history or empty history")
    }
    
    console.log("Final extracted tool calls:", toolCalls)
    return toolCalls
}

// Helper function to extract text from a task response
export function extractResponseText(task: Task): string {
    // First try to get text from artifacts if they exist
    if (task.artifacts && task.artifacts.length > 0) {
        const textArtifact = task.artifacts.find(artifact =>
            artifact.parts && artifact.parts.some(part => 'text' in part)
        );

        if (textArtifact) {
            return textArtifact.parts.map(part => 'text' in part ? part.text : '').join('');
        }
    }

    // If no artifacts or no text found in artifacts, check status message
    if (task.status && task.status.message && task.status.message.parts) {
        return task.status.message.parts
            .map(part => 'text' in part ? part.text : '')
            .join('');
    }

    return "";
}