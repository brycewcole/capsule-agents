import { tool } from 'ai';
import { z } from 'zod';

export const braveSearchTool = tool({
  description: 'Perform a web search using the Brave Search API.',
  parameters: z.object({
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
