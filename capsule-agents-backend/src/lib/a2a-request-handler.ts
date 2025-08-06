import type {
  AgentCard,
  AgentSkill,
  Task,
  Message,
  MessageSendParams,
  TaskQueryParams,
  TaskIdParams,
  TaskPushNotificationConfig,
  TaskStatusUpdateEvent,
  TaskArtifactUpdateEvent,
  TextPart,
} from '@a2a-js/sdk';
import type { A2ARequestHandler } from '@a2a-js/sdk/server';
import process from 'node:process';
import * as Vercel from 'ai';
import { openai } from '@ai-sdk/openai';
import { fileAccessTool, fileAccessSkill } from '../tools/file-access.ts';
import { braveSearchTool, braveSearchSkill } from '../tools/brave-search.ts';
import { memoryTool, memorySkill } from '../tools/memory.ts';
import { saveChat, loadChat, createChatWithId } from './storage.ts';
import { AgentConfigService } from './agent-config.ts';
import { z } from 'zod';

// Simple in-memory storage for this example
class InMemoryStorage {
  private tasks = new Map<string, Task>();
  private taskCounter = 0;
  private messageCounter = 0;
  private contextCounter = 0;

  createTaskId(): string {
    return `task-${++this.taskCounter}`;
  }

  createMessageId(): string {
    return `msg-${++this.messageCounter}`;
  }

  setTask(id: string, task: Task): void {
    this.tasks.set(id, task);
  }

  getTask(id: string): Task | undefined {
    return this.tasks.get(id);
  }
}

export class CapsuleAgentA2ARequestHandler implements A2ARequestHandler {
  private storage = new InMemoryStorage();
  private agentConfigService: AgentConfigService;

  constructor() {
    console.log('Initializing CapsuleAgentA2ARequestHandler...');
    try {
      this.agentConfigService = new AgentConfigService();
      console.log('AgentConfigService initialized successfully');
    } catch (error) {
      console.error('Failed to initialize AgentConfigService:', error);
      throw error;
    }
  }

  private getAvailableTools(): Record<string, Vercel.Tool> {
    const tools: Record<string, Vercel.Tool> = {};

    try {
      console.log('Getting agent info for tools...');
      const agentInfo = this.agentConfigService.getAgentInfo();
      console.log('Agent info retrieved:', { name: agentInfo.name, toolCount: agentInfo.tools.length });

      for (const tool of agentInfo.tools) {
        if (tool.type === 'prebuilt') {
          const toolType = tool.tool_schema?.type;
          switch (toolType) {
            case 'file_access':
              tools.fileAccess = fileAccessTool;
              break;
            case 'brave_search':
              tools.braveSearch = braveSearchTool;
              break;
            case 'memory':
              tools.memory = memoryTool;
              break;
          }
        } else if (tool.type === 'a2a_call') {
          // Create A2A tool with configured agent URL
          const agentUrl = tool.tool_schema?.agent_url;
          if (agentUrl) {
            tools[tool.name] = {
              description: `Call agent at ${agentUrl}`,
              inputSchema: z.object({
                message: z.string().describe('Message to send to the agent')
              }),
              execute: ({ message }: { message: string }) => {
                // TODO: Implement A2A call to the configured agent URL
                return `Would call agent at ${agentUrl} with message: ${message}`;
              }
            };
          }
        }
        // TODO: Add support for other tool types like mcp_server
      }

      console.log('Tools loaded from agent config:', Object.keys(tools));
    } catch (error) {
      console.error('Error loading agent configuration, using environment variable fallback:', error);
      // Fallback to environment variables if agent config fails
      if (process.env.FILE_ACCESS_TOOL_ENABLED === 'true') {
        tools.fileAccess = fileAccessTool;
      }
      if (process.env.BRAVE_SEARCH_TOOL_ENABLED === 'true') {
        tools.braveSearch = braveSearchTool;
      }
      if (process.env.MEMORY_TOOL_ENABLED === 'true') {
        tools.memory = memoryTool;
      }
      console.log('Tools loaded from environment:', Object.keys(tools));
    }

    return tools;
  }

  // deno-lint-ignore require-await
  async getAgentCard(): Promise<AgentCard> {
    console.log('CapsuleAgentA2ARequestHandler.getAgentCard() called');
    const agentUrl = process.env.AGENT_URL || 'http://localhost:8080';

    let agentName = 'Capsule Agent';
    let agentDescription = 'A versatile AI agent with configurable tools and capabilities';

    try {
      console.log('Loading agent configuration for card...');
      const agentInfo = this.agentConfigService.getAgentInfo();
      agentName = agentInfo.name;
      agentDescription = agentInfo.description;
      console.log('Agent config loaded for card:', { name: agentName });
    } catch (error) {
      console.error('Error loading agent configuration for card, using defaults:', error);
    }

    // Get enabled skills based on available tools
    const availableTools = this.getAvailableTools();
    const skills: AgentSkill[] = [];

    // Add skills for enabled tools
    if ('fileAccess' in availableTools) {
      skills.push(fileAccessSkill);
    }
    if ('braveSearch' in availableTools) {
      skills.push(braveSearchSkill);
    }
    if ('memory' in availableTools) {
      skills.push(memorySkill);
    }

    // Add a general chat skill if no tools are enabled
    if (skills.length === 0) {
      skills.push({
        id: 'general-chat',
        name: 'General Chat',
        description: 'General purpose conversational AI capabilities',
        tags: ['chat', 'conversation', 'general'],
        examples: ['Answer questions', 'Have conversations', 'Provide assistance'],
        inputModes: ['text/plain'],
        outputModes: ['text/plain'],
      });
    }

    return {
      name: agentName,
      description: agentDescription,
      url: agentUrl,
      // preferredTransport: 'json-rpc',
      version: '1.0.0',
      capabilities: {
        streaming: true,
        pushNotifications: false,
        stateTransitionHistory: true,
      },
      defaultInputModes: ['text/plain'],
      defaultOutputModes: ['text/plain', 'application/json'],
      skills,
    };
  }

  // deno-lint-ignore require-await
  async sendMessage(params: MessageSendParams): Promise<Message | Task> {
    const taskId = this.storage.createTaskId();
    // contextId should always be provided now - it IS the session ID
    const contextId = params.message.contextId!;

    // Create task with initial message
    const task: Task = {
      id: taskId,
      kind: 'task',
      contextId,
      status: {
        state: 'submitted',
        timestamp: new Date().toISOString(),
      },
      history: [params.message],
      metadata: params.metadata || {},
    };

    this.storage.setTask(taskId, task);

    // Process the message asynchronously
    this.processMessageAsync(task, params);

    return task;
  }

  // deno-lint-ignore require-await
  async getTask(params: TaskQueryParams): Promise<Task> {
    const task = this.storage.getTask(params.id);
    if (!task) {
      throw new Error('Task not found');
    }

    // Apply history length limit if specified
    if (params.historyLength && task.history) {
      const limitedTask = { ...task };
      limitedTask.history = task.history.slice(-params.historyLength);
      return limitedTask;
    }

    return task;
  }

  // deno-lint-ignore require-await
  async cancelTask(params: TaskIdParams): Promise<Task> {
    const task = this.storage.getTask(params.id);
    if (!task) {
      throw new Error('Task not found');
    }

    // Only allow cancellation of certain states
    if (task.status.state === 'completed' ||
      task.status.state === 'canceled' ||
      task.status.state === 'failed') {
      throw new Error('Task cannot be canceled');
    }

    task.status.state = 'canceled';
    task.status.timestamp = new Date().toISOString();
    this.storage.setTask(task.id, task);

    return task;
  }

  // deno-lint-ignore require-await
  async setTaskPushNotificationConfig(_params: TaskPushNotificationConfig): Promise<TaskPushNotificationConfig> {
    throw new Error('Push notifications are not supported');
  }

  // deno-lint-ignore require-await
  async getTaskPushNotificationConfig(_params: TaskIdParams): Promise<TaskPushNotificationConfig> {
    throw new Error('Push notifications are not supported');
  }

  async* sendMessageStream(params: MessageSendParams): AsyncGenerator<Task | Message | TaskStatusUpdateEvent | TaskArtifactUpdateEvent, void, undefined> {
    console.log('CapsuleAgentA2ARequestHandler.sendMessageStream() called');
    const taskId = this.storage.createTaskId();
    // contextId should always be provided now - it IS the session ID
    const contextId = params.message.contextId!;
    console.log('Created task and context IDs:', { taskId, contextId });

    // Create task with initial message
    const task: Task = {
      id: taskId,
      kind: 'task',
      contextId,
      status: {
        state: 'submitted',
        timestamp: new Date().toISOString(),
      },
      history: [params.message],
      metadata: params.metadata || {},
    };

    this.storage.setTask(taskId, task);
    console.log('Task created and stored');

    // Yield initial task
    console.log('Yielding initial task');
    yield task;

    // Update to working state and yield update
    task.status.state = 'working';
    task.status.timestamp = new Date().toISOString();
    this.storage.setTask(taskId, task);

    const statusUpdate: TaskStatusUpdateEvent = {
      kind: 'status-update',
      taskId: task.id,
      contextId: task.contextId,
      status: task.status,
      final: false,
    };
    yield statusUpdate;

    try {
      // Process the message with streaming
      console.log('Processing message with streaming...');
      const userText = this.extractTextFromMessage(params.message);
      console.log('Extracted user text:', { length: userText.length });

      // Use contextId as the session ID for chat continuity
      console.log('Ensuring context exists for contextId:', task.contextId);
      this.ensureContextExists(task.contextId);
      console.log('Loading chat history...');
      const chatHistory = loadChat(task.contextId);
      console.log('Chat history loaded:', { messageCount: chatHistory.length });

      const newMessage: Vercel.UIMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        parts: [{ type: 'text', text: userText }]
      };

      const combinedMessages = [...chatHistory, newMessage];
      console.log('Getting available tools...');
      const tools = this.getAvailableTools();
      console.log('Tools retrieved:', { toolCount: Object.keys(tools).length });

      console.log('Getting configured model...');
      const model = this.getConfiguredModel();
      console.log('Model configured, starting streamText...');

      const result = Vercel.streamText({
        system: this.getSystemPrompt(),
        model,
        messages: Vercel.convertToModelMessages(combinedMessages),
        tools,
      });

      console.log('StreamText initialized, starting to process fullStream...');

      let fullResponse = '';
      const toolCalls: Array<{
        id: string;
        name: string;
        args: unknown;
        result?: unknown;
        hasError?: boolean
      }> = [];

      // Process the full stream including text and tool calls
      for await (const chunk of result.fullStream) {
        console.log('Processing stream chunk:', { type: chunk.type });

        switch (chunk.type) {
          case 'text-delta': {
            // Handle streaming text
            fullResponse += chunk.text;
            console.log('Text delta received, total length:', fullResponse.length);

            // Create a partial response message with current text
            const partialMessage: Message = {
              kind: 'message',
              messageId: this.storage.createMessageId(),
              role: 'agent',
              parts: [{ kind: 'text', text: fullResponse } as TextPart],
              taskId: task.id,
              contextId: task.contextId,
            };

            yield partialMessage;
            break;
          }

          case 'tool-call': {
            // Handle tool call initiation
            console.log('Tool call initiated:', {
              toolCallId: chunk.toolCallId,
              toolName: chunk.toolName,
              input: chunk.input
            });

            toolCalls.push({
              id: chunk.toolCallId,
              name: chunk.toolName,
              args: chunk.input,
            });

            // Add tool call to task history
            const toolCallMessage: Message = {
              kind: 'message',
              messageId: this.storage.createMessageId(),
              role: 'agent',
              parts: [{
                kind: 'function_call',
                function_call: {
                  id: chunk.toolCallId,
                  name: chunk.toolName,
                  args: chunk.input
                }
              }],
              taskId: task.id,
              contextId: task.contextId,
            };

            if (!task.history) task.history = [];
            task.history.push(toolCallMessage);
            this.storage.setTask(task.id, task);
            break;
          }

          case 'tool-result': {
            // Handle tool execution result
            console.log('Tool result received:', {
              toolCallId: chunk.toolCallId,
              toolName: chunk.toolName,
              output: chunk.output
            });

            // Find and update the corresponding tool call
            const toolCall = toolCalls.find(tc => tc.id === chunk.toolCallId);
            if (toolCall) {
              toolCall.result = chunk.output;

              // Check if result contains an error
              const isError = chunk.output &&
                typeof chunk.output === 'object' &&
                'error' in chunk.output;
              toolCall.hasError = isError;

              if (isError) {
                console.log('🚨 Tool execution failed:', {
                  toolName: chunk.toolName,
                  error: (chunk.output as any).error
                });

                // Add error message to response text
                const errorMessage = `\n\n⚠️ **Tool Error**: ${chunk.toolName} failed - ${(chunk.output as any).error}`;
                fullResponse += errorMessage;
              }
            }

            // Add tool result to task history  
            const toolResultMessage: Message = {
              kind: 'message',
              messageId: this.storage.createMessageId(),
              role: 'agent',
              parts: [{
                kind: 'function_response',
                function_response: {
                  id: chunk.toolCallId,
                  name: chunk.toolName,
                  response: chunk.output
                }
              } as any],
              taskId: task.id,
              contextId: task.contextId,
            };

            if (!task.history) task.history = [];
            task.history.push(toolResultMessage);
            this.storage.setTask(task.id, task);
            break;
          }

          case 'finish': {
            console.log('Stream finished, final processing...');
            break;
          }
        }
      }

      // Final completion
      const responseMessage: Message = {
        kind: 'message',
        messageId: this.storage.createMessageId(),
        role: 'agent',
        parts: [{ kind: 'text', text: fullResponse } as TextPart],
        taskId: task.id,
        contextId: task.contextId,
      };

      task.status.state = 'completed';
      task.status.message = responseMessage;
      task.status.timestamp = new Date().toISOString();

      if (!task.history) {
        task.history = [];
      }
      task.history.push(responseMessage);

      this.storage.setTask(task.id, task);

      // Final status update
      const finalStatusUpdate: TaskStatusUpdateEvent = {
        kind: 'status-update',
        taskId: task.id,
        contextId: task.contextId,
        status: task.status,
        final: true,
      };
      yield finalStatusUpdate;

      // Save the conversation using contextId as session ID
      try {
        // First, ensure the session exists for this contextId
        this.ensureContextExists(task.contextId);

        const assistantMessage: Vercel.UIMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          parts: [{ type: 'text', text: fullResponse }]
        };
        saveChat(task.contextId, [...combinedMessages, assistantMessage]);
      } catch (saveError) {
        // Enhanced logging for save errors
        console.error('⚠️  CHAT SAVE ERROR (non-critical):', saveError);
        console.error('Save error stack:', saveError instanceof Error ? saveError.stack : 'No stack available');
        console.error('Context ID for failed save:', task.contextId);
      }

    } catch (error) {
      // Enhanced error logging
      console.error('🚨 STREAM MESSAGE ERROR:', error);
      console.error('Error stack:', error instanceof Error ? error.stack : 'No stack available');
      console.error('Task ID:', task.id);
      console.error('Context ID:', task.contextId);

      // Error handling
      task.status.state = 'failed';
      task.status.message = {
        kind: 'message',
        messageId: this.storage.createMessageId(),
        role: 'agent',
        parts: [{
          kind: 'text',
          text: `Error processing task: ${error instanceof Error ? error.message : error}\n\nError type: ${error instanceof Error ? error.constructor.name : typeof error}`
        } as TextPart],
        taskId: task.id,
        contextId: task.contextId,
      };
      task.status.timestamp = new Date().toISOString();

      this.storage.setTask(task.id, task);

      const errorStatusUpdate: TaskStatusUpdateEvent = {
        kind: 'status-update',
        taskId: task.id,
        contextId: task.contextId,
        status: task.status,
        final: true,
      };
      yield errorStatusUpdate;
    }
  }

  async* resubscribe(params: TaskIdParams): AsyncGenerator<Task | TaskStatusUpdateEvent | TaskArtifactUpdateEvent, void, undefined> {
    const task = await this.getTask(params);
    yield task;
  }

  private async processMessageAsync(task: Task, params: MessageSendParams): Promise<void> {
    try {
      // Update task to working state
      task.status.state = 'working';
      task.status.timestamp = new Date().toISOString();
      this.storage.setTask(task.id, task);

      // Extract text from the message
      const userText = this.extractTextFromMessage(params.message);

      // Use contextId as the session ID for chat continuity
      this.ensureContextExists(task.contextId);
      const chatHistory = loadChat(task.contextId);

      // Convert to UI message format
      const newMessage: Vercel.UIMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        parts: [
          {
            type: 'text',
            text: userText,
          }
        ]
      };

      const combinedMessages = [...chatHistory, newMessage];

      // Set up tools
      const tools = this.getAvailableTools();

      const messages = Vercel.convertToModelMessages(combinedMessages);


      // Stream the response
      this.getConfiguredModel(); // Get configured model but use hardcoded for now
      const result = Vercel.streamText({
        model: 'gpt-4o',
        system: this.getSystemPrompt(),
        messages,
        tools,
      });

      let fullResponse = '';

      // Process the full stream including text and tool calls
      for await (const chunk of result.fullStream) {
        switch (chunk.type) {
          case 'text-delta': {
            fullResponse += chunk.text;
            break;
          }
          case 'tool-call': {
            console.log('Tool call in async processing:', {
              toolName: chunk.toolName,
              input: chunk.input
            });
            break;
          }
          case 'tool-result': {
            console.log('Tool result in async processing:', {
              toolName: chunk.toolName,
              output: chunk.output
            });
            break;
          }
        }
      }

      // Create response message
      const responseMessage: Message = {
        kind: 'message',
        messageId: this.storage.createMessageId(),
        role: 'agent',
        parts: [{ kind: 'text', text: fullResponse } as TextPart],
        taskId: task.id,
        contextId: task.contextId,
      };

      // Update task to completed state
      task.status.state = 'completed';
      task.status.message = responseMessage;
      task.status.timestamp = new Date().toISOString();

      // Add response to history
      if (!task.history) {
        task.history = [];
      }
      task.history.push(responseMessage);

      this.storage.setTask(task.id, task);

      // Save the conversation using contextId as session ID
      try {
        // First, ensure the session exists for this contextId
        this.ensureContextExists(task.contextId);

        const assistantMessage: Vercel.UIMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          parts: [
            {
              type: 'text',
              text: fullResponse,
            }
          ]
        };
        saveChat(task.contextId, [...combinedMessages, assistantMessage]);
      } catch (saveError) {
        // Enhanced logging for save errors
        console.error('⚠️  CHAT SAVE ERROR (non-critical):', saveError);
        console.error('Save error stack:', saveError instanceof Error ? saveError.stack : 'No stack available');
        console.error('Context ID for failed save:', task.contextId);
      }

    } catch (error) {
      // Enhanced error logging for async processing
      console.error('🚨 ASYNC MESSAGE PROCESSING ERROR:', error);
      console.error('Error stack:', error instanceof Error ? error.stack : 'No stack available');
      console.error('Task ID:', task.id);
      console.error('Context ID:', task.contextId);

      // Update task to failed state
      task.status.state = 'failed';
      task.status.message = {
        kind: 'message',
        messageId: this.storage.createMessageId(),
        role: 'agent',
        parts: [{
          kind: 'text',
          text: `Error processing task: ${error instanceof Error ? error.message : error}\n\nError type: ${error instanceof Error ? error.constructor.name : typeof error}`
        } as TextPart],
        taskId: task.id,
        contextId: task.contextId,
      };
      task.status.timestamp = new Date().toISOString();

      this.storage.setTask(task.id, task);
    }
  }

  private extractTextFromMessage(message: Message): string {
    return message.parts
      .filter((part): part is TextPart => part.kind === 'text')
      .map(part => part.text)
      .filter(Boolean)
      .join(' ');
  }

  private getConfiguredModel() {
    try {
      const agentInfo = this.agentConfigService.getAgentInfo();
      const modelName = agentInfo.model_name;

      // Only support OpenAI models for now
      if (modelName.startsWith('openai/')) {
        const model = modelName.replace('openai/', '');
        return openai(model);
      } else {
        console.warn(`Unsupported model ${modelName}, defaulting to gpt-4o`);
        return openai('gpt-4o');
      }
    } catch (error) {
      console.error('Error loading model configuration, using default:', error);
      return openai(process.env.OPENAI_API_MODEL || 'gpt-4o');
    }
  }

  private getSystemPrompt(): string {
    const agentInfo = this.agentConfigService.getAgentInfo();
    return agentInfo.description;
  }

  private ensureContextExists(contextId: string): void {
    // Always ensure the context exists (INSERT OR IGNORE will handle duplicates)
    createChatWithId(contextId, 'a2a-agent');
  }
}
