import type {
  Task,
  Message,
  TaskStatusUpdateEvent,
  TextPart,
} from '@a2a-js/sdk';
import { TaskStorage } from './task-storage.ts';

interface ToolCallData {
  type: 'tool_call';
  id: string;
  name: string;
  args: unknown;
  [k: string]: unknown;
}

interface ToolResultData {
  type: 'tool_result';
  id: string;
  name: string;
  result: unknown;
  [k: string]: unknown;
}

type TaskState = 'submitted' | 'working' | 'completed' | 'canceled' | 'failed';

export class TaskService {
  private taskStorage: TaskStorage;

  constructor(taskStorage: TaskStorage) {
    this.taskStorage = taskStorage;
  }

  /**
   * Creates a new task with initial state
   */
  createTask(contextId: string, initialMessage: Message, metadata?: Record<string, unknown>): Task {
    const taskId = this.taskStorage.createTaskId();

    const task: Task = {
      id: taskId,
      kind: 'task',
      contextId,
      status: {
        state: 'submitted',
        timestamp: new Date().toISOString(),
      },
      history: [initialMessage],
      metadata: metadata || {},
    };

    this.taskStorage.setTask(taskId, task);
    return task;
  }

  /**
   * Transitions task to a new state and generates update event
   */
  transitionState(task: Task, newState: TaskState, message?: string | Message, isFinal: boolean = false): TaskStatusUpdateEvent {
    task.status.state = newState;
    task.status.timestamp = new Date().toISOString();

    if (message) {
      if (typeof message === 'string') {
        task.status.message = {
          kind: 'message',
          messageId: this.createMessageId(),
          role: 'agent',
          parts: [{ kind: 'text', text: message } as TextPart],
          taskId: task.id,
          contextId: task.contextId,
        };
      } else {
        task.status.message = message;
      }
    }

    this.taskStorage.setTask(task.id, task);

    return {
      kind: 'status-update',
      taskId: task.id,
      contextId: task.contextId,
      status: task.status,
      final: isFinal,
    };
  }

  /**
   * Cancels a task if it's in a cancelable state
   */
  cancelTask(task: Task): void {
    if (task.status.state === 'completed' ||
      task.status.state === 'canceled' ||
      task.status.state === 'failed') {
      throw new Error('Task cannot be canceled');
    }

    this.transitionState(task, 'canceled', undefined, true);
  }

  /**
   * Adds a message to task history
   */
  addMessageToHistory(task: Task, message: Message): void {
    if (!task.history) {
      task.history = [];
    }
    task.history.push(message);
    this.taskStorage.setTask(task.id, task);
  }

  /**
   * Adds tool calls to task history
   */
  addToolCallsToHistory(task: Task, toolCalls: any[]): void {
    if (!task.history) task.history = [];

    for (const toolCall of toolCalls) {
      const toolCallData: ToolCallData = {
        type: 'tool_call',
        id: toolCall.toolCallId,
        name: toolCall.toolName,
        args: (toolCall as any).input ?? (toolCall as any).args ?? (toolCall as any).arguments ?? {},
      };

      const toolCallMessage: Message = {
        kind: 'message',
        messageId: this.createMessageId(),
        role: 'agent',
        parts: [{ kind: 'data', data: toolCallData }],
        taskId: task.id,
        contextId: task.contextId,
      };

      task.history.push(toolCallMessage);
    }
    this.taskStorage.setTask(task.id, task);
  }

  /**
   * Adds tool results to task history
   */
  addToolResultsToHistory(task: Task, toolResults: any[]): void {
    if (!task.history) task.history = [];

    for (const toolResult of toolResults) {
      const toolResultData: ToolResultData = {
        type: 'tool_result',
        id: toolResult.toolCallId,
        name: toolResult.toolName,
        result: (toolResult as any).output ?? (toolResult as any).result ?? (toolResult as any).value,
      };

      const toolResultMessage: Message = {
        kind: 'message',
        messageId: this.createMessageId(),
        role: 'agent',
        parts: [{ kind: 'data', data: toolResultData }],
        taskId: task.id,
        contextId: task.contextId,
      };

      task.history.push(toolResultMessage);
    }
    this.taskStorage.setTask(task.id, task);
  }

  /**
   * Creates a text delta message for streaming
   */
  createTextDeltaMessage(task: Task, delta: string): Message {
    return {
      kind: 'message',
      messageId: this.createMessageId(),
      role: 'agent',
      parts: [{ kind: 'text', text: delta } as TextPart],
      taskId: task.id,
      contextId: task.contextId,
    };
  }

  /**
   * Creates a response message
   */
  createResponseMessage(task: Task, text: string): Message {
    return {
      kind: 'message',
      messageId: this.createMessageId(),
      role: 'agent',
      parts: [{ kind: 'text', text } as TextPart],
      taskId: task.id,
      contextId: task.contextId,
    };
  }

  /**
   * Extracts text content from a message
   */
  extractTextFromMessage(message: Message): string {
    return message.parts
      .filter((part): part is TextPart => part.kind === 'text')
      .map(part => part.text)
      .filter(Boolean)
      .join(' ');
  }

  private createMessageId(): string {
    return `msg_${crypto.randomUUID()}`;
  }
}