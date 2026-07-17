import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { NLPProcessor } from '../ai/nlp-processor.js';
import type { FormulaEvaluator } from '../formula/evaluator.js';

export interface ToolResult {
  [x: string]: unknown;
  content: Array<{
    type: 'text';
    text: string;
  }>;
}

export interface ToolContext {
  nlpProcessor: NLPProcessor;
  formulaEvaluator: FormulaEvaluator;
}

export type ToolHandler = (args: any, ctx: ToolContext) => Promise<ToolResult>;

export interface ToolModule {
  definitions: Tool[];
  handlers: Record<string, ToolHandler>;
}

export function textResult(data: unknown): ToolResult {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}
