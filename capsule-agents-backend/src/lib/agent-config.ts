import { getDb } from './db.ts';
import * as log from "https://deno.land/std@0.203.0/log/mod.ts";

// Types for agent configuration
interface AgentInfoRow {
  name: string;
  description: string;
  model_name: string;
  model_parameters: string;
  tools: string;
}

export type Tool = {
  name: string;
  type: string;
  tool_schema: Record<string, unknown>;
};

export type AgentInfo = {
  name: string;
  description: string;
  model_name: string;
  model_parameters: Record<string, unknown>;
  tools: Tool[];
};

export type Model = {
  model_name: string;
  display_name: string;
};

// Available models - OpenAI only for now
const AVAILABLE_MODELS: Model[] = [
  { model_name: "openai/gpt-4o", display_name: "GPT-4o" },
  { model_name: "openai/gpt-4o-mini", display_name: "GPT-4o Mini" },
  { model_name: "openai/gpt-3.5-turbo", display_name: "GPT-3.5 Turbo" }
];

export class AgentConfigService {
  private db = getDb();

  getAgentInfo(): AgentInfo {
    try {
      const stmt = this.db.prepare(`
        SELECT name, description, model_name, model_parameters, tools 
        FROM agent_info WHERE key = 1
      `);

      const row = stmt.get() as AgentInfoRow | undefined;
      if (!row) {
        log.error('No agent info found in database');
        throw new Error('Agent info not found');
      }

      const tools = JSON.parse(row.tools || '[]');
      const modelParameters = JSON.parse(row.model_parameters || '{}');

      const result = {
        name: row.name,
        description: row.description,
        model_name: row.model_name,
        model_parameters: modelParameters,
        tools: tools
      };

      log.debug('AgentConfigService.getAgentInfo() returning:', {
        name: result.name,
        model_name: result.model_name,
        toolCount: result.tools.length
      });

      return result;
    } catch (error) {
      log.error('Error in AgentConfigService.getAgentInfo():', error);
      throw error;
    }
  }

  updateAgentInfo(info: AgentInfo): AgentInfo {
    try {
      // Validate a2a_call tools
      for (const tool of info.tools) {
        if (tool.type === 'a2a_call') {
          log.info('Validating a2a_call tool:', tool.name);
          if (!tool.tool_schema || typeof tool.tool_schema !== 'object') {
            const error = `Tool '${tool.name}' of type 'a2a_call' has an invalid tool_schema (expected a dictionary).`;
            log.error('Tool validation error:', error);
            throw new Error(error);
          }
          if (!tool.tool_schema.agent_url) {
            const error = `Tool '${tool.name}' of type 'a2a_call' is missing 'agent_url' in its tool_schema.`;
            log.error('Tool validation error:', error);
            throw new Error(error);
          }
        }
      }

      log.info('Preparing database update...');
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO agent_info(key, name, description, model_name, model_parameters, tools) 
        VALUES(1, ?, ?, ?, ?, ?)
      `);

      log.info('Executing database update...');
      stmt.run(
        info.name,
        info.description,
        info.model_name,
        JSON.stringify(info.model_parameters),
        JSON.stringify(info.tools)
      );

      log.info('Database update completed successfully');
      return info;
    } catch (error) {
      log.error('Error in AgentConfigService.updateAgentInfo():', error);
      throw error;
    }
  }

  getAvailableModels(): Model[] {
    return AVAILABLE_MODELS;
  }
}