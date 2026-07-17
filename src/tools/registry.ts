import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { basicTools } from './basic.js';
import { analyticsTools } from './analytics.js';
import { writeTools } from './write.js';
import { aiTools } from './ai.js';
import type { ToolContext, ToolHandler, ToolModule } from './types.js';

export interface ToolRegistry {
  definitions: Tool[];
  handlers: Record<string, ToolHandler>;
}

export function mergeToolModules(modules: ToolModule[]): ToolRegistry {
  const definitions: Tool[] = [];
  const handlers: Record<string, ToolHandler> = {};

  for (const mod of modules) {
    definitions.push(...mod.definitions);
    Object.assign(handlers, mod.handlers);
  }

  return { definitions, handlers };
}

export function createDefaultToolRegistry(): ToolRegistry {
  return mergeToolModules([basicTools, analyticsTools, writeTools, aiTools]);
}

export async function dispatchTool(
  registry: ToolRegistry,
  name: string,
  args: unknown,
  ctx: ToolContext
) {
  const handler = registry.handlers[name];
  if (!handler) {
    throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
  }

  try {
    return await handler(args ?? {}, ctx);
  } catch (error) {
    if (error instanceof McpError) {
      throw error;
    }
    throw new McpError(
      ErrorCode.InternalError,
      error instanceof Error ? error.message : 'Unknown error'
    );
  }
}
