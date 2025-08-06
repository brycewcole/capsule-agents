import { tool } from 'ai';
import { z } from 'zod';
import type { AgentSkill } from '@a2a-js/sdk';

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

export const a2aMetadata: AgentSkill = {
  id: 'a2a-communication',
  name: 'Agent Communication',
  description: 'Communicate with other agents using the Agent-to-Agent (A2A) protocol for collaboration',
  tags: ['communication', 'agents', 'collaboration', 'a2a', 'json-rpc'],
  examples: [
    'Communicate with other agents',
    'Delegate tasks to specialized agents',
    'Coordinate multi-agent workflows',
    'Send JSON-RPC requests to agents',
    'Collaborate on complex tasks'
  ],
  inputModes: ['text/plain'],
  outputModes: ['application/json'],
};
