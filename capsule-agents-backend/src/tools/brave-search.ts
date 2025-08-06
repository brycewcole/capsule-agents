import { tool } from 'ai';
import { z } from 'zod';
import process from "node:process";
import type { AgentSkill } from '@a2a-js/sdk';

export const braveSearchTool = tool({
  description: 'Perform a web search using the Brave Search API.',
  inputSchema: z.object({
    query: z.string().describe('The search query.'),
  }),
  execute: async ({ query }) => {
    const apiKey = process.env.BRAVE_API_KEY;
    if (!apiKey) {
      return { error: 'BRAVE_API_KEY environment variable is not set.' };
    }

    const response = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}`, {
      headers: {
        'X-Subscription-Token': apiKey,
      },
    });

    if (!response.ok) {
      return { error: `Brave Search API request failed with status ${response.status}` };
    }

    return response.json();
  },
});

export const braveSearchSkill: AgentSkill = {
  id: 'brave-search',
  name: 'Web Search',
  description: 'Perform web searches using the Brave Search API to find current information',
  tags: ['search', 'web', 'information', 'research', 'internet'],
  examples: [
    'Search for current news',
    'Find technical documentation',
    'Research topics and facts',
    'Look up recent events',
    'Find product information'
  ],
  inputModes: ['text/plain'],
  outputModes: ['application/json'],
};
