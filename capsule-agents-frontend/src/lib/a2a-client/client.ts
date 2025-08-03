import {
  type A2ARequest,
  type AgentCard,
  type CancelTaskRequest,
  type CancelTaskResponse,
  type GetTaskPushNotificationConfigRequest,
  type GetTaskPushNotificationConfigResponse,
  type GetTaskRequest,
  type GetTaskResponse,
  type JSONRPCResponse,
  type SendMessageRequest,
  type SendMessageResponse,
  type SetTaskPushNotificationConfigRequest,
  type SetTaskPushNotificationConfigResponse,
  type TaskResubscriptionRequest,
} from '@a2a-js/sdk';

/**
 * Defines the interface for an A2A (Agent-to-Agent) client, which allows
 * for interaction with an A2A-compliant agent.
 */
export interface A2AClient {
  /**
   * Retrieves the agent card, which provides metadata about the agent.
   * @returns A promise that resolves to the agent's AgentCard.
   */
  getAgentCard(): Promise<AgentCard>;

  /**
   * Sends a message to the agent.
   * @param request The request object for sending a message.
   * @returns A promise that resolves to the response from the agent.
   */
  sendMessage(request: SendMessageRequest): Promise<SendMessageResponse>;

  /**
   * Retrieves the status of a specific task.
   * @param request The request object for getting a task.
   * @returns A promise that resolves to the task information.
   */
  getTask(request: GetTaskRequest): Promise<GetTaskResponse>;

  /**
   * Cancels a specific task.
   * @param request The request object for canceling a task.
   * @returns A promise that resolves to the cancellation response.
   */
  cancelTask(request: CancelTaskRequest): Promise<CancelTaskResponse>;

  /**
   * Sets the push notification configuration for a task.
   * @param request The request object for setting the push notification config.
   * @returns A promise that resolves to the response.
   */
  setTaskPushNotificationConfig(
    request: SetTaskPushNotificationConfigRequest,
  ): Promise<SetTaskPushNotificationConfigResponse>;

  /**
   * Retrieves the push notification configuration for a task.
   * @param request The request object for getting the push notification config.
   * @returns A promise that resolves to the configuration details.
   */
  getTaskPushNotificationConfig(
    request: GetTaskPushNotificationConfigRequest,
  ): Promise<GetTaskPushNotificationConfigResponse>;

  /**
   * Resubscribes to a task to receive updates.
   * @param request The request object for task resubscription.
   * @returns A promise that resolves when the resubscription is successful.
   */
  resubscribeToTask(request: TaskResubscriptionRequest): Promise<void>;
}

/**
 * Implements the A2AClient interface for HTTP-based communication with an A2A agent.
 */
export class HttpA2AClient implements A2AClient {
  baseUrl: string;
  /**
   * @param baseUrl The base URL of the A2A agent.
   */
  constructor(baseUrl: string) {
    this.baseUrl = baseUrl
  }

  /** @inheritdoc */
  async getAgentCard(): Promise<AgentCard> {
    const response = await fetch(`${this.baseUrl}/.well-known/agent.json`);
    if (!response.ok) {
      throw new Error('Failed to fetch agent card');
    }
    return response.json();
  }

  /** @inheritdoc */
  async sendMessage(request: SendMessageRequest): Promise<SendMessageResponse> {
    return this.sendJsonRpcRequest(request);
  }

  /** @inheritdoc */
  async getTask(request: GetTaskRequest): Promise<GetTaskResponse> {
    return this.sendJsonRpcRequest(request);
  }

  /** @inheritdoc */
  async cancelTask(request: CancelTaskRequest): Promise<CancelTaskResponse> {
    return this.sendJsonRpcRequest(request);
  }

  /** @inheritdoc */
  async setTaskPushNotificationConfig(
    request: SetTaskPushNotificationConfigRequest,
  ): Promise<SetTaskPushNotificationConfigResponse> {
    return this.sendJsonRpcRequest(request);
  }

  /** @inheritdoc */
  async getTaskPushNotificationConfig(
    request: GetTaskPushNotificationConfigRequest,
  ): Promise<GetTaskPushNotificationConfigResponse> {
    return this.sendJsonRpcRequest(request);
  }

  /** @inheritdoc */
  async resubscribeToTask(_request: TaskResubscriptionRequest): Promise<void> {
    // Resubscription is not a standard JSON-RPC request/response,
    // it would typically involve a streaming connection like SSE.
    // This implementation will depend on how the agent handles resubscriptions.
    throw new Error('Resubscription not implemented in this client.');
  }

  private async sendJsonRpcRequest<T extends JSONRPCResponse>(
    request: A2ARequest,
  ): Promise<T> {
    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const rpcResponse = (await response.json()) as T;
    if ('error' in rpcResponse && rpcResponse.error) {
      const error = rpcResponse.error as { message: string; code: number };
      throw new Error(`A2A Error: ${error.message} (Code: ${error.code})`);
    }

    return rpcResponse;
  }
}
