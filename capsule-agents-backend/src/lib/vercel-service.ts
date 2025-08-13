import type * as Vercel from 'ai';
import type * as A2A from '@a2a-js/sdk';
import { isToolCallData, isToolResultData, type ToolCallData, type ToolResultData } from "./types.ts";

/**
 * Service for converting A2A protocol types to Vercel AI SDK types
 */
export class VercelService {
  /**
   * Convert A2A Message to Vercel UIMessage
   */
  static toUIMessage(message: A2A.Message): Vercel.UIMessage {
    const text = message.parts
      .filter((part): part is A2A.TextPart => part.kind === 'text')
      .map(part => part.text)
      .filter(Boolean)
      .join(' ');

    return {
      id: message.messageId,
      role: message.role as 'user' | 'assistant',
      parts: [{ type: 'text', text }],
    };
  }

  /**
   * Convert array of A2A Messages to Vercel UIMessages
   */
  static toUIMessages(messages: A2A.Message[]): Vercel.UIMessage[] {
    return messages.map(msg => this.toUIMessage(msg));
  }

  /**
   * Extract text content from A2A Message
   */
  static extractText(message: A2A.Message): string {
    return message.parts
      .filter((part): part is A2A.TextPart => part.kind === 'text')
      .map(part => part.text)
      .filter(Boolean)
      .join(' ');
  }

  /**
   * Create Vercel UIMessage from text
   */
  static createAssistantUIMessage(text: string): Vercel.UIMessage {
    return {
      id: crypto.randomUUID(),
      role: 'assistant',
      parts: [{ type: 'text', text }],
    };
  }

  /**
   * Convert A2A Message parts to Vercel UIMessage parts
   */
  static toVercelMessageParts(parts: A2A.Part[]): Vercel.UIMessagePart<Vercel.UIDataTypes, Vercel.UITools>[] {
    const messageParts: Vercel.UIMessagePart<Vercel.UIDataTypes, Vercel.UITools>[] = [];

    for (const part of parts) {
      switch (part.kind) {
        case 'text':
          messageParts.push({ type: 'text', text: part.text || '' });
          break;

        case 'data': {
          if (!part.data) {
            throw new Error('Data part missing data property');
          }

          switch (part.data.type) {
            case 'function_call':
              {
                if (!isToolCallData(part.data)) {
                  throw new Error(`Part is marked as function call but ${part.data} is not a valid ToolCallData`);
                }
                const toolCall: ToolCallData = part.data;
                messageParts.push({
                  type: 'tool-call',
                  toolCallId: toolCall.id,
                  state: 'input-available',
                  input: toolCall.args || {}
                });
                break;
              }

            case 'function_response':
              {
                if (!isToolResultData(part.data)) {
                  throw new Error(`Part is marked as function response but ${part.data} is not a valid ToolResultData`);
                }
                const result: ToolResultData = part.data;
                messageParts.push({
                  type: 'tool-result',
                  toolCallId: result.id,
                  state: 'output-available',
                  input: result.args || {},
                  output: result.response
                });
                break;
              }

            default:
              throw new Error(`Unsupported data type: ${part.data.type}`);
          }
          break;
        }

        default:
          throw new Error(`Unsupported part kind: ${part.kind}`);
      }
    }

    return messageParts;
  }

  /**
   * Create comprehensive Vercel UIMessage from A2A Message with full part support
   */
  static createUIMessage(message: A2A.Message): Vercel.UIMessage {
    const parts = this.toVercelMessageParts(message.parts);

    return {
      id: message.messageId,
      role: message.role as 'user' | 'assistant',
      parts: parts.length > 0 ? parts : [{ type: 'text', text: '' }],
    };
  }
}