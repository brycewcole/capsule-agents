import * as Vercel from 'ai';
import * as A2A from '@a2a-js/sdk';

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
  static createUIMessage(text: string, role: 'user' | 'assistant'): Vercel.UIMessage {
    return {
      id: crypto.randomUUID(),
      role,
      parts: [{ type: 'text', text }],
    };
  }
}