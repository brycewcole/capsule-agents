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
import * as log from "https://deno.land/std@0.203.0/log/mod.ts";


export class CapsuleAgentA2ARequestHandler implements A2ARequestHandler {
  private taskStorage = new TaskStorage();
  private taskService = new TaskService(this.taskStorage);
  private agentConfigService: AgentConfigService;

  constructor() {
    log.info('Initializing CapsuleAgentA2ARequestHandler...');
    try {
      this.agentConfigService = new AgentConfigService();
      log.info('AgentConfigService initialized successfully');
    } catch (error) {
      log.error('Failed to initialize AgentConfigService:', error);
      throw error;
    }
  }

  private getAvailableTools(): Record<string, Vercel.Tool> {
    const tools: Record<string, Vercel.Tool> = {};

    const agentInfo = this.agentConfigService.getAgentInfo();
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

    log.info('Tools loaded from agent config:', Object.keys(tools));

    return tools;
  }

  // deno-lint-ignore require-await
  async getAgentCard(): Promise<A2A.AgentCard> {
    const agentUrl = process.env.AGENT_URL || 'http://localhost:8080';

    let agentName = 'Capsule Agent';
    let agentDescription = 'A versatile AI agent with configurable tools and capabilities';

    const agentInfo = this.agentConfigService.getAgentInfo();
    agentName = agentInfo.name;
    agentDescription = agentInfo.description;
    log.info('Agent config loaded for card:', { name: agentName });

    // Get enabled skills based on available tools
    const availableTools = this.getAvailableTools();
    const skills: A2A.AgentSkill[] = [];

    // TODO add A2A and MCP server skills
    if ('fileAccess' in availableTools) {
      skills.push(fileAccessSkill);
    }
    if ('braveSearch' in availableTools) {
      skills.push(braveSearchSkill);
    }
    if ('memory' in availableTools) {
      skills.push(memorySkill);
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

  // TODO update this to not always return a task
  // deno-lint-ignore require-await
  async sendMessage(params: A2A.MessageSendParams): Promise<A2A.Message | A2A.Task> {
    const contextId = params.message.contextId || crypto.randomUUID();
    const initialMessage = { ...params.message, contextId };
    const task = this.taskService.createTask(contextId, initialMessage, params.metadata);

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
    if (params.message.contextId == null) {
      params.message.contextId = crypto.randomUUID();
    }

    let task: A2A.Task | null = null;
    let hasToolCalls = false;

    // Queue for status updates that need to be yielded
    const statusUpdateQueue: A2A.TaskStatusUpdateEvent[] = [];

    try {
      this.ensureContextExists(params.message.contextId);
      const chatHistory = loadChat(params.message.contextId);
      log.info('Chat history loaded:', { messageCount: chatHistory.length });

      const newMessage: Vercel.UIMessage = VercelService.createUIMessage(params.message);

      const combinedMessages = [...chatHistory, newMessage];
      const tools = this.getAvailableTools();
      const model = this.getConfiguredModel();

      let responseMessage: A2A.Message | null = null;

      const result = Vercel.streamText({
        system: this.getSystemPrompt(),
        model,
        messages: Vercel.convertToModelMessages(combinedMessages),
        tools,
        stopWhen: Vercel.stepCountIs(10),
        onStepFinish: ({ text, toolCalls, toolResults, finishReason, usage }) => {
          log.info('Step finished:', { text, toolCalls, toolResults, finishReason, usage });

          hasToolCalls = (toolCalls && toolCalls.length > 0) || (toolResults && toolResults.length > 0);

          if (hasToolCalls) {
            if (!task) {
              throw new Error('Task should have been created on tool call start');
            }

            responseMessage = this.taskService.addVercelResultToHistory(task, text, toolCalls, toolResults);

            // Queue the completion status update to be yielded after the stream
            const completionStatusUpdate = this.taskService.transitionState(task, 'completed', responseMessage, true);
            statusUpdateQueue.push(completionStatusUpdate);
            log.info('Queued completion status update');
          } else {
            // Create simple response message
            responseMessage = {
              kind: 'message',
              messageId: `msg_${crypto.randomUUID()}`,
              role: 'agent',
              parts: [{ kind: 'text', text }],
              contextId: params.message.contextId!,
            };
          }

          this.ensureContextExists(params.message.contextId!);
          const assistantMessage = VercelService.createAssistantUIMessage(text);
          saveChat(params.message.contextId!, [...combinedMessages, assistantMessage]);
        },
        onFinish: ({ text, toolCalls, toolResults, finishReason, usage }) => {
          log.info('stream finished:', { text, toolCalls, toolResults, finishReason, usage });
        },
      });

      log.info('StreamText initialized, consuming stream...');

      for await (const e of result.fullStream) {
        log.debug('Stream event:', e);
        switch (e.type) {
          case "tool-input-start":
            log.info('Tool input started:', { toolName: e.toolName });
            task = this.taskService.createTask(params.message.contextId!, params.message, params.metadata);
            yield task;
            yield this.taskService.transitionState(task, 'working');
            break;
        }
      }

      // Yield any queued status updates
      for (const statusUpdate of statusUpdateQueue) {
        log.info('Yielding queued status update:', statusUpdate.status.state);
        yield statusUpdate;
      }

      // After stream processing, yield the response message if it was created
      if (responseMessage) {
        log.info('Yielding response message after stream completion');
        yield responseMessage;
      }
    } catch (error) {
      log.error('🚨 STREAM MESSAGE ERROR:', error);
      log.error('Error stack:', error instanceof Error ? error.stack : 'No stack available');
      log.error('Context ID:', params.message.contextId);

      if (task) {
        log.error('Task ID:', task.id);
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
      this.taskService.transitionState(task, 'working');

      this.ensureContextExists(task.contextId);
      const chatHistory = loadChat(task.contextId);

      const vercelMessage = VercelService.createUIMessage(params.message);

      const combinedMessages = [...chatHistory, vercelMessage];

      // Set up tools
      const tools = this.getAvailableTools();

      const messages = Vercel.convertToModelMessages(combinedMessages);

      // Stream the response
      this.getConfiguredModel();
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
            log.info('Tool call in async processing:', {
              toolName: chunk.toolName,
              input: chunk.input,
            });
            break;
          }
          case 'tool-result': {
            log.info('Tool result in async processing:', {
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

        const assistantMessage = VercelService.createAssistantUIMessage(fullResponse);
        saveChat(task.contextId, [...combinedMessages, assistantMessage]);
      } catch (saveError) {
        // Enhanced logging for save errors
        log.error('⚠️  CHAT SAVE ERROR (non-critical):', saveError);
        log.error('Save error stack:', saveError instanceof Error ? saveError.stack : 'No stack available');
        log.error('Context ID for failed save:', task.contextId);
      }
    } catch (error) {
      // Enhanced error logging for async processing
      log.error('🚨 ASYNC MESSAGE PROCESSING ERROR:', error);
      log.error('Error stack:', error instanceof Error ? error.stack : 'No stack available');
      log.error('Task ID:', task.id);
      log.error('Context ID:', task.contextId);

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
        log.warn(`Unsupported model ${modelName}, defaulting to gpt-4o`);
        return openai('gpt-4o');
      }
    } catch (error) {
      log.error('Error loading model configuration, using default:', error);
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