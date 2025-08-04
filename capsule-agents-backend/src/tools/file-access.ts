import { tool } from 'ai';
import { z } from 'zod';
import { ensureDir } from '@std/fs';
import { join, resolve } from '@std/path';

const AGENT_WORKSPACE = '/agent-workspace';

export const fileAccessTool = tool({
  description: 'Access files in the agent workspace.',
  inputSchema: z.object({
    operation: z.enum(['read', 'write', 'list']).describe('The file operation to perform.'),
    path: z.string().describe('The path to the file or directory.'),
    content: z.string().optional().describe('The content to write to the file.'),
  }),
  execute: async ({ operation, path: relativePath, content }: {
    operation: 'read' | 'write' | 'list';
    path: string;
    content?: string;
  }) => {
    const absolutePath = join(AGENT_WORKSPACE, relativePath);

    // Basic security check to prevent path traversal
    if (!absolutePath.startsWith(AGENT_WORKSPACE)) {
      return { error: 'Invalid path' };
    }

    try {
      switch (operation) {
        case 'read': {
          return { content: await Deno.readTextFile(absolutePath) };
        }
        case 'write': {
          if (content === undefined) {
            return { error: 'Content is required for write operation' };
          }
          // Ensure directory exists
          await ensureDir(resolve(absolutePath, '..'));
          await Deno.writeTextFile(absolutePath, content);
          return { success: true };
        }
        case 'list': {
          const files = [];
          for await (const entry of Deno.readDir(absolutePath)) {
            files.push(entry.name);
          }
          return { files };
        }
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { error: message };
    }
  },
});
