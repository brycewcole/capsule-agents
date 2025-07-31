import { v4 as uuidv4 } from 'uuid';

// Chat API functions for Vercel AI SDK integration
export class ChatAPI {
  private baseURL: string;

  constructor(baseURL: string = '') {
    this.baseURL = baseURL;
  }

  // Create a new chat session
  async createChat(userId?: string): Promise<{ chatId: string }> {
    const response = await fetch(`${this.baseURL}/api/chat/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userId: userId || 'anonymous' }),
    });

    if (!response.ok) {
      throw new Error(`Failed to create chat: ${response.statusText}`);
    }

    return response.json();
  }

  // Check if backend is healthy
  async checkHealth(): Promise<{ status: string }> {
    const response = await fetch(`${this.baseURL}/api/health`);
    
    if (!response.ok) {
      throw new Error(`Health check failed: ${response.statusText}`);
    }

    return response.json();
  }
}

// Default instance
export const chatAPI = new ChatAPI();

// Storage utility for chat sessions
export class ChatStorage {
  private static readonly CHAT_ID_KEY = 'current-chat-id';

  static getCurrentChatId(): string | null {
    return localStorage.getItem(this.CHAT_ID_KEY);
  }

  static setCurrentChatId(chatId: string): void {
    localStorage.setItem(this.CHAT_ID_KEY, chatId);
  }

  static clearCurrentChatId(): void {
    localStorage.removeItem(this.CHAT_ID_KEY);
  }

  static async getOrCreateChatId(): Promise<string> {
    let chatId = this.getCurrentChatId();
    
    if (!chatId) {
      const { chatId: newChatId } = await chatAPI.createChat();
      chatId = newChatId;
      this.setCurrentChatId(chatId);
    }
    
    return chatId;
  }

  static startNewChat(): string {
    this.clearCurrentChatId();
    const chatId = uuidv4();
    this.setCurrentChatId(chatId);
    return chatId;
  }
}