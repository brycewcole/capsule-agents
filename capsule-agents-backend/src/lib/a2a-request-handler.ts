import type * as A2A from '@a2a-js/sdk';
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
import { VercelService } from './vercel-service.ts';
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
  async getAgentCard(): Promise<A2A.AgentCard> {
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
    const skills: A2A.AgentSkill[] = [];

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
  async sendMessage(params: A2A.MessageSendParams): Promise<A2A.Message | A2A.Task> {
    const contextId = crypto.randomUUID();
    const initialMessage = { ...params.message, contextId };
    const task = this.taskService.createTask(contextId, initialMessage, params.metadata);

    // Process the message asynchronously
    this.processMessageAsync(task, params);

    return task;
  }

  // deno-lint-ignore require-await
  async getTask(params: A2A.TaskQueryParams): Promise<A2A.Task> {
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
  async cancelTask(params: A2A.TaskIdParams): Promise<A2A.Task> {
    const task = this.taskStorage.getTask(params.id);
    if (!task) {
      throw new Error('Task not found');
    }

    this.taskService.cancelTask(task);
    return task;
  }

  // deno-lint-ignore require-await
  async setTaskPushNotificationConfig(_params: A2A.TaskPushNotificationConfig): Promise<A2A.TaskPushNotificationConfig> {
    throw new Error('Push notifications are not supported');
  }

  // deno-lint-ignore require-await
  async getTaskPushNotificationConfig(_params: A2A.TaskIdParams): Promise<A2A.TaskPushNotificationConfig> {
    throw new Error('Push notifications are not supported');
  }

  async* sendMessageStream(
    params: A2A.MessageSendParams
  ): AsyncGenerator<A2A.Task | A2A.Message | A2A.TaskStatusUpdateEvent | A2A.TaskArtifactUpdateEvent, void, undefined> {
    console.log('CapsuleAgentA2ARequestHandler.sendMessageStream() called');
    if (params.message.contextId == null) {
      params.message.contextId = crypto.randomUUID();
    }

    let task: A2A.Task | null = null;
    let hasToolCalls = false;

    try {
      const userText = VercelService.extractText(params.message);
      console.log('Ensuring context exists for contextId:', params.message.contextId);
      this.ensureContextExists(params.message.contextId);
      console.log('Loading chat history...');
      const chatHistory = loadChat(params.message.contextId);
      console.log('Chat history loaded:', { messageCount: chatHistory.length });

      const newMessage: Vercel.UIMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        parts: [{ type: 'text', text: userText }],
      };

      const combinedMessages = [...chatHistory, newMessage];
      const tools = this.getAvailableTools();
      console.log('Tools retrieved:', { toolCount: Object.keys(tools).length });

      const model = this.getConfiguredModel();
      console.log('Model configured, starting streamText...');

      let fullResponse = '';
      let responseMessage: A2A.Message | null = null;

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
          hasToolCalls = (toolCalls && toolCalls.length > 0) || (toolResults && toolResults.length > 0);

          if (hasToolCalls) {
            if (!task) {
              throw new Error('Task should have been created on tool call start');
            }

            responseMessage = this.taskService.addVercelResultToHistory(task, fullResponse, toolCalls, toolResults);

            this.taskService.transitionState(task, 'completed', responseMessage, true);
          } else {
            // Create simple response message
            console.log('No tool calls, creating simple message response...');
            responseMessage = {
              kind: 'message',
              messageId: `msg_${crypto.randomUUID()}`,
              role: 'agent',
              parts: [{ kind: 'text', text: fullResponse }],
              contextId: params.message.contextId!,
            };
          }

          try {
            this.ensureContextExists(params.message.contextId!);
            const assistantMessage = VercelService.createUIMessage(fullResponse, 'assistant');
            saveChat(params.message.contextId!, [...combinedMessages, assistantMessage]);
          } catch (saveError) {
            console.error('⚠️  CHAT SAVE ERROR (non-critical):', saveError);
            console.error('Context ID for failed save:', params.message.contextId);
          }
        },
      });

      console.log('StreamText initialized, consuming stream...');

      // Consume the stream to trigger onFinish (but don't yield the deltas)
      for await (const e of result.fullStream) {
        switch (e.type) {
          case "tool-input-start":
            console.log('Tool input started:', { toolName: e.toolName });
            task = this.taskService.createTask(params.message.contextId!, params.message, params.metadata);
            yield task;
            yield this.taskService.transitionState(task, 'working');
            break;
        }
      }

      // After stream processing, yield the response message if it was created
      if (responseMessage) {
        console.log('Yielding response message after stream completion');
        yield responseMessage;
      }
    } catch (error) {
      // Enhanced error logging
      console.error('🚨 STREAM MESSAGE ERROR:', error);
      console.error('Error stack:', error instanceof Error ? error.stack : 'No stack available');
      console.error('Context ID:', params.message.contextId);

      if (task) {
        // If we have a task, transition it to failed state
        console.error('Task ID:', (task as A2A.Task).id);
        const errorMessage = `Error processing task: ${error instanceof Error ? error.message : String(error)}`;
        const errorStatusUpdate = this.taskService.transitionState(task as A2A.Task, 'failed', errorMessage, true);
        yield errorStatusUpdate;
      } else {
        // If no task was created, let the JSON-RPC error bubble up
        throw error;
      }
    }
  }

  async* resubscribe(params: A2A.TaskIdParams): AsyncGenerator<A2A.Task | A2A.TaskStatusUpdateEvent | A2A.TaskArtifactUpdateEvent, void, undefined> {
    const task = await this.getTask(params);
    yield task;
  }

  private async processMessageAsync(task: A2A.Task, params: A2A.MessageSendParams): Promise<void> {
    try {
      // Update task to working state
      this.taskService.transitionState(task, 'working');

      // Extract text from the message
      const userText = VercelService.extractText(params.message);

      // Use contextId as the session ID for chat continuity
      this.ensureContextExists(task.contextId);
      const chatHistory = loadChat(task.contextId);

      // Convert to UI message format
      const newMessage = VercelService.createUIMessage(userText, 'user');

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

        const assistantMessage = VercelService.createUIMessage(fullResponse, 'assistant');
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