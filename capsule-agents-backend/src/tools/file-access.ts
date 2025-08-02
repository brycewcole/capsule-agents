import { tool } from 'ai';
import { z } from 'zod';
import { promises as fs } from 'fs';
import path from 'path';

const AGENT_WORKSPACE = '/agent-workspace';

export const fileAccessTool = tool({
  description: 'Access files in the agent workspace.',
  inputSchema: z.object({
    operation: z.enum(['read', 'write', 'list']).describe('The file operation to perform.'),
    path: z.string().describe('The path to the file or directory.'),
    content: z.string().optional().describe('The content to write to the file.'),
  }),
  execute: async ({ operation, path: relativePath, content }) => {
    const absolutePath = path.join(AGENT_WORKSPACE, relativePath);

    // Basic security check to prevent path traversal
    if (!absolutePath.startsWith(AGENT_WORKSPACE)) {
      return { error: 'Invalid path' };
    }

    try {
      switch (operation) {
        case 'read':
          return { content: await fs.readFile(absolutePath, 'utf-8') };
        case 'write':
          if (content === undefined) {
            return { error: 'Content is required for write operation' };
          }
          await fs.writeFile(absolutePath, content);
          return { success: true };
        case 'list':
          return { files: await fs.readdir(absolutePath) };
      }
    } catch (error: any) {
      return { error: error.message };
    }
  },
});
