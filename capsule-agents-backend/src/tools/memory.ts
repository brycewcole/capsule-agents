import { tool } from 'ai';
import { z } from 'zod';

const memoryStore: Record<string, string> = {};

export const memoryTool = tool({
  description: 'Store and retrieve information in memory.',
  inputSchema: z.object({
    operation: z.enum(['set', 'get']).describe('The memory operation to perform.'),
    key: z.string().describe('The key to store or retrieve.'),
    value: z.string().optional().describe('The value to store.'),
  }),
  execute: async ({ operation, key, value }) => {
    switch (operation) {
      case 'set':
        if (value === undefined) {
          return { error: 'Value is required for set operation' };
        }
        memoryStore[key] = value;
        return { success: true };
      case 'get':
        return { value: memoryStore[key] };
    }
  },
});
