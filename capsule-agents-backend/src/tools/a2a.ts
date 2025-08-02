import { tool } from 'ai';
import { z } from 'zod';

export const a2aTool = tool({
  description: 'Communicate with other agents using the Agent-to-Agent (A2A) protocol.',
  inputSchema: z.object({
    agentUrl: z.string().describe('The URL of the agent to communicate with.'),
    method: z.string().describe('The JSON-RPC method to call.'),
    params: z.any().describe('The parameters for the JSON-RPC method.'),
  }),
  execute: async ({ agentUrl, method, params }) => {
    const response = await fetch(agentUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method,
        params,
        id: crypto.randomUUID(),
      }),
    });

    if (!response.ok) {
      return { error: `A2A request failed with status ${response.status}` };
    }

    return response.json();
  },
});
