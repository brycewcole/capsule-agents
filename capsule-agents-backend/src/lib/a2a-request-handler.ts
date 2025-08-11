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
import { TaskStorage } from './task-storage.ts';
import { TaskService } from './task-service.ts';
import { z } from 'zod';


export class CapsuleAgentA2ARequestHandler implements A2ARequestHandler {
  private taskStorage = new TaskStorage();
  private taskService = new TaskService(this.taskStorage);
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
                message: z.string().describe('Message to send to the agent'),
              }),
              execute: ({ message }: { message: string }) => {
                // TODO: Implement A2A call to the configured agent URL
                return `Would call agent at ${agentUrl} with message: ${message}`;
              },
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
    const contextId = crypto.randomUUID();
    const initialMessage = { ...params.message, contextId };
    const task = this.taskService.createTask(contextId, initialMessage, params.metadata);

    // Process the message asynchronously
    this.processMessageAsync(task, params);

    return task;
  }

  // deno-lint-ignore require-await
  async getTask(params: TaskQueryParams): Promise<Task> {
    const task = this.taskStorage.getTask(params.id);
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
    const task = this.taskStorage.getTask(params.id);
    if (!task) {
      throw new Error('Task not found');
    }

    this.taskService.cancelTask(task);
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

  async* sendMessageStream(
    params: MessageSendParams
  ): AsyncGenerator<Task | Message | TaskStatusUpdateEvent | TaskArtifactUpdateEvent, void, undefined> {
    console.log('CapsuleAgentA2ARequestHandler.sendMessageStream() called');
    if (params.message.contextId == null) {
      params.message.contextId = crypto.randomUUID();
    }

    const task = this.taskService.createTask(params.message.contextId, params.message, params.metadata);
    console.log('Task created and stored');

    // Yield initial task
    yield task;

    // Update to working state and yield update
    const workingStatusUpdate = this.taskService.transitionState(task, 'working');
    yield workingStatusUpdate;

    try {
      const userText = this.taskService.extractTextFromMessage(params.message);
      // Use contextId as the session ID for chat continuity
      console.log('Ensuring context exists for contextId:', task.contextId);
      this.ensureContextExists(task.contextId);
      console.log('Loading chat history...');
      const chatHistory = loadChat(task.contextId);
      console.log('Chat history loaded:', { messageCount: chatHistory.length });

      const newMessage: Vercel.UIMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        parts: [{ type: 'text', text: userText }],
      };

      const combinedMessages = [...chatHistory, newMessage];
      console.log('Getting available tools...');
      const tools = this.getAvailableTools();
      console.log('Tools retrieved:', { toolCount: Object.keys(tools).length });

      console.log('Getting configured model...');
      const model = this.getConfiguredModel();
      console.log('Model configured, starting streamText...');

      let fullResponse = '';

      const result = Vercel.streamText({
        system: this.getSystemPrompt(),
        model,
        messages: Vercel.convertToModelMessages(combinedMessages),
        tools,
        onFinish: ({ text, toolCalls, toolResults, finishReason, usage }) => {
          console.log('Stream finished:', {
            textLength: text.length,
            toolCallsCount: toolCalls?.length || 0,
            finishReason,
            usage,
          });

          fullResponse = text;

          // Add tool calls and results to task history
          if (toolCalls && toolCalls.length > 0) {
            this.taskService.addToolCallsToHistory(task, toolCalls);
          }

          if (toolResults && toolResults.length > 0) {
            this.taskService.addToolResultsToHistory(task, toolResults);
          }

          // Create and add response message to history
          const responseMessage = this.taskService.createResponseMessage(task, fullResponse);
          this.taskService.addMessageToHistory(task, responseMessage);

          // Update task to completed state
          this.taskService.transitionState(task, 'completed', responseMessage, true);

          this.taskStorage.setTask(task.id, task);

          // Save the conversation using contextId as session ID
          try {
            this.ensureContextExists(task.contextId);
            const assistantMessage: Vercel.UIMessage = {
              id: crypto.randomUUID(),
              role: 'assistant',
              parts: [{ type: 'text', text: fullResponse }],
            };
            saveChat(task.contextId, [...combinedMessages, assistantMessage]);
          } catch (saveError) {
            console.error('⚠️  CHAT SAVE ERROR (non-critical):', saveError);
            console.error('Context ID for failed save:', task.contextId);
          }
        },
      });

      console.log('StreamText initialized, starting to process text stream...');

      // Stream *deltas only* to the client; still build fullResponse server-side
      for await (const delta of result.textStream) {
        fullResponse += delta;
        yield this.taskService.createTextDeltaMessage(task, delta);
      }

      console.log('Text streaming complete, waiting for onFinish...');
      // Ensure onFinish work (tool events, finalization, persistence) completed
      await result.text;

      // Final status update (already generated by transitionState)
      const finalStatusUpdate = this.taskService.transitionState(task, task.status.state, undefined, true);
      yield finalStatusUpdate;
    } catch (error) {
      // Enhanced error logging
      console.error('🚨 STREAM MESSAGE ERROR:', error);
      console.error('Error stack:', error instanceof Error ? error.stack : 'No stack available');
      console.error('Task ID:', task.id);
      console.error('Context ID:', task.contextId);

      // Error handling
      const errorMessage = `Error processing task: ${error instanceof Error ? error.message : String(error)
        }\n\nError type: ${error instanceof Error ? error.constructor.name : typeof error}`;
      
      const errorStatusUpdate = this.taskService.transitionState(task, 'failed', errorMessage, true);
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
      this.taskService.transitionState(task, 'working');

      // Extract text from the message
      const userText = this.taskService.extractTextFromMessage(params.message);

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
          },
        ],
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
              input: chunk.input,
            });
            break;
          }
          case 'tool-result': {
            console.log('Tool result in async processing:', {
              toolName: chunk.toolName,
              output: chunk.output,
            });
            break;
          }
        }
      }

      // Create response message and update task to completed state
      const responseMessage = this.taskService.createResponseMessage(task, fullResponse);
      this.taskService.addMessageToHistory(task, responseMessage);
      this.taskService.transitionState(task, 'completed', responseMessage, true);

      // Save the conversation using contextId as session ID
      try {
        this.ensureContextExists(task.contextId);

        const assistantMessage: Vercel.UIMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          parts: [
            {
              type: 'text',
              text: fullResponse,
            },
          ],
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
      const errorMessage = `Error processing task: ${error instanceof Error ? error.message : String(error)
        }\n\nError type: ${error instanceof Error ? error.constructor.name : typeof error}`;
      
      this.taskService.transitionState(task, 'failed', errorMessage, true);
    }
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