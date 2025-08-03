import {
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
  Part,
  TextPart,
} from '@a2a-js/sdk';
import { A2ARequestHandler } from '@a2a-js/sdk/server';
import { streamText, convertToModelMessages, UIMessage, Tool } from 'ai';
import { openai } from '@ai-sdk/openai';
import { fileAccessTool } from '../tools/file-access.js';
import { braveSearchTool } from '../tools/brave-search.js';
import { memoryTool } from '../tools/memory.js';
import { a2aTool } from '../tools/a2a.js';
import { saveChat, loadChat, createChatWithId } from './storage.js';
import { AgentConfigService } from './agent-config.js';
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

  createContextId(): string {
    return `ctx-${++this.contextCounter}`;
  }

  setTask(id: string, task: Task): void {
    this.tasks.set(id, task);
  }

  getTask(id: string): Task | undefined {
    return this.tasks.get(id);
  }
}

// Utility function to convert a Vercel AI tool to an A2A skill
function toolToSkill(toolName: string, tool: Tool, enabled: boolean = true): AgentSkill | null {
  if (!enabled) return null;

  // Extract tags from the tool description and schema
  const tags: string[] = [];
  const description = tool.description || '';

  // Add tags based on tool name and description
  if (toolName.includes('file') || description.toLowerCase().includes('file')) {
    tags.push('filesystem', 'io');
  }
  if (toolName.includes('search') || description.toLowerCase().includes('search')) {
    tags.push('search', 'web', 'information');
  }
  if (toolName.includes('memory') || description.toLowerCase().includes('memory')) {
    tags.push('memory', 'persistence');
  }
  if (toolName.includes('a2a') || description.toLowerCase().includes('agent')) {
    tags.push('communication', 'agents', 'collaboration');
  }

  // Generate examples based on the tool's input schema
  const examples: string[] = [];
  if (toolName === 'fileAccess') {
    examples.push('Read file contents', 'Write data to file', 'List directory contents');
  } else if (toolName === 'braveSearch') {
    examples.push('Search for current news', 'Find technical documentation', 'Research topics');
  } else if (toolName === 'memory') {
    examples.push('Store important information', 'Retrieve past conversations', 'Remember user preferences');
  } else if (toolName === 'a2a') {
    examples.push('Communicate with other agents', 'Delegate tasks to specialized agents', 'Coordinate multi-agent workflows');
  }

  return {
    id: toolName.toLowerCase().replace(/([A-Z])/g, '-$1').toLowerCase().replace(/^-/, ''),
    name: toolName.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()).replace(/^([a-z])/, str => str.toUpperCase()),
    description: description || `Tool for ${toolName}`,
    tags,
    examples: examples.length > 0 ? examples : undefined,
    inputModes: ['text/plain'],
    outputModes: ['text/plain'],
  };
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

  private getAvailableTools(): Record<string, Tool> {
    const tools: Record<string, Tool> = {};

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
              execute: async ({ message }: { message: string }) => {
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
      if (process.env.A2A_TOOL_ENABLED === 'true') {
        tools.a2a = a2aTool;
      }
      console.log('Tools loaded from environment:', Object.keys(tools));
    }

    return tools;
  }

  async getAgentCard(): Promise<AgentCard> {
    console.log('CapsuleAgentA2ARequestHandler.getAgentCard() called');
    const agentUrl = process.env.AGENT_URL || 'http://localhost:80';

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

    // Dynamically generate skills from available tools
    const availableTools = this.getAvailableTools();
    const skills: AgentSkill[] = [];

    for (const [toolName, tool] of Object.entries(availableTools)) {
      const skill = toolToSkill(toolName, tool, true);
      if (skill) {
        skills.push(skill);
      }
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

  async sendMessage(params: MessageSendParams): Promise<Message | Task> {
    const taskId = this.storage.createTaskId();
    const contextId = this.storage.createContextId();

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

  async setTaskPushNotificationConfig(_params: TaskPushNotificationConfig): Promise<TaskPushNotificationConfig> {
    throw new Error('Push notifications are not supported');
  }

  async getTaskPushNotificationConfig(_params: TaskIdParams): Promise<TaskPushNotificationConfig> {
    throw new Error('Push notifications are not supported');
  }

  async* sendMessageStream(params: MessageSendParams): AsyncGenerator<Task | Message | TaskStatusUpdateEvent | TaskArtifactUpdateEvent, void, undefined> {
    console.log('CapsuleAgentA2ARequestHandler.sendMessageStream() called');
    const taskId = this.storage.createTaskId();
    const contextId = this.storage.createContextId();
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

      // Ensure session exists before loading
      console.log('Ensuring session exists...');
      await this.ensureSessionExists(task.id);
      console.log('Loading chat history...');
      const chatHistory = await loadChat(task.id);
      console.log('Chat history loaded:', { messageCount: chatHistory.length });

      const newMessage: UIMessage = {
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

      const result = streamText({
        model,
        messages: convertToModelMessages(combinedMessages),
        tools,
      });

      console.log('StreamText initialized, starting to process stream...');

      let fullResponse = '';

      // Stream the response and yield partial updates
      for await (const textPart of result.textStream) {
        fullResponse += textPart;

        // Create a partial response message
        const partialMessage: Message = {
          kind: 'message',
          messageId: this.storage.createMessageId(),
          role: 'agent',
          parts: [{ kind: 'text', text: fullResponse } as TextPart],
          taskId: task.id,
          contextId: task.contextId,
        };

        yield partialMessage;
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

      // Save the conversation
      try {
        // First, ensure the session exists for this task ID
        await this.ensureSessionExists(task.id);

        const assistantMessage: UIMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          parts: [{ type: 'text', text: fullResponse }]
        };
        await saveChat(task.id, [...combinedMessages, assistantMessage]);
      } catch (saveError) {
        // Log the save error but don't fail the task
        console.error('Failed to save chat:', saveError);
      }

    } catch (error) {
      // Error handling
      task.status.state = 'failed';
      task.status.message = {
        kind: 'message',
        messageId: this.storage.createMessageId(),
        role: 'agent',
        parts: [{ kind: 'text', text: `Error processing task: ${error}` } as TextPart],
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

      // Ensure session exists and load chat history (use taskId as sessionId)
      await this.ensureSessionExists(task.id);
      const chatHistory = await loadChat(task.id);

      // Convert to UI message format
      const newMessage: UIMessage = {
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

      const messages = convertToModelMessages(combinedMessages);


      // Stream the response
      const model = this.getConfiguredModel();
      const result = streamText({
        model: 'gpt-4o',
        system: this.getSystemPrompt(),
        messages,
        tools,
      });

      let fullResponse = '';

      // Process the stream
      for await (const textPart of result.textStream) {
        fullResponse += textPart;
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

      // Save the conversation
      try {
        // First, ensure the session exists for this task ID
        await this.ensureSessionExists(task.id);

        const assistantMessage: UIMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          parts: [
            {
              type: 'text',
              text: fullResponse,
            }
          ]
        };
        await saveChat(task.id, [...combinedMessages, assistantMessage]);
      } catch (saveError) {
        // Log the save error but don't fail the task
        console.error('Failed to save chat:', saveError);
      }

    } catch (error) {
      // Update task to failed state
      task.status.state = 'failed';
      task.status.message = {
        kind: 'message',
        messageId: this.storage.createMessageId(),
        role: 'agent',
        parts: [{ kind: 'text', text: `Error processing task: ${error}` } as TextPart],
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
    try {
      const agentInfo = this.agentConfigService.getAgentInfo();
      return agentInfo.description || "You are a capsule agent that can use various tools to assist users.";
    } catch (error) {
      console.error('Error loading agent description:', error);
      return "You are a capsule agent that can use various tools to assist users.";
    }
  }

  private async ensureSessionExists(sessionId: string): Promise<void> {
    // Always ensure the session exists (INSERT OR IGNORE will handle duplicates)
    await createChatWithId(sessionId, 'a2a-agent');
  }
}
