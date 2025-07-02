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
    text: string;
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
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json() as JSONRPCResponse<Task>;

        if (data.error) {
            throw new Error(`API error: ${data.error.message}`);
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
            throw new Error(`HTTP error! status: ${response.status}`);
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
                            throw new Error(`Stream error: ${data.error.message}`);
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
            throw new Error(`HTTP error! status: ${response.status}`);
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
    content: string;
    actions: string;
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
            throw new Error(`HTTP error! status: ${response.status}`);
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
            throw new Error(`HTTP error! status: ${response.status}`);
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
            throw new Error(`HTTP error! status: ${response.status}`);
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
        throw new Error("Failed to update agent info");
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
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        return await response.json() as Model[];
    } catch (error) {
        console.error("Failed to fetch available models:", error);
        throw error;
    }
}


// Helper function to extract tool calls from task history
export function extractToolCalls(task: Task): ToolCall[] {
    const toolCalls: ToolCall[] = []
    
    if (task.history && task.history.length > 0) {
        for (const event of task.history) {
            if (event.actions) {
                try {
                    // Parse actions if it's a string, otherwise use directly
                    const actions = typeof event.actions === 'string' 
                        ? JSON.parse(event.actions) 
                        : event.actions
                    
                    if (Array.isArray(actions)) {
                        const eventToolCalls = actions.map((action: unknown) => {
                            const actionObj = action as { name?: string; args?: Record<string, unknown>; result?: unknown }
                            return {
                                name: actionObj.name || 'unknown',
                                args: actionObj.args || {},
                                result: actionObj.result
                            }
                        })
                        toolCalls.push(...eventToolCalls)
                    }
                } catch (e) {
                    console.error("Error parsing tool calls from task history:", e)
                }
            }
        }
    }
    
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