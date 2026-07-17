import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { parseFormula } from '../formula/parser.js';
import type { WorkbookContext } from '../formula/evaluator.js';
import { detectDataTypes } from '../utils/data-types.js';
import { readFileContent } from '../utils/file-io.js';
import { dataProfile } from './analytics.js';
import type { ToolContext, ToolHandler, ToolModule, ToolResult } from './types.js';
import { textResult } from './types.js';

const definitions: Tool[] = [
  {
    name: 'evaluate_formula',
    description: 'Evaluate an Excel formula with given context',
    inputSchema: {
      type: 'object',
      properties: {
        formula: {
          type: 'string',
          description:
            'Excel formula to evaluate (e.g., "=SUM(A1:A10)", "=VLOOKUP(B2,C:D,2,FALSE)")',
        },
        context: {
          type: 'object',
          description: 'Cell values and ranges for formula evaluation (optional)',
          additionalProperties: true,
        },
      },
      required: ['formula'],
    },
  },
  {
    name: 'parse_natural_language',
    description: 'Convert natural language to Excel formula or command',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'Natural language query (e.g., "sum all sales", "find duplicates", "average by category")',
        },
        filePath: {
          type: 'string',
          description: 'Path to file for context (optional)',
        },
        provider: {
          type: 'string',
          description:
            'Preferred AI provider: anthropic, openai, deepseek, gemini, or local (optional)',
          enum: ['anthropic', 'openai', 'deepseek', 'gemini', 'local'],
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'explain_formula',
    description: 'Explain what an Excel formula does in plain English',
    inputSchema: {
      type: 'object',
      properties: {
        formula: {
          type: 'string',
          description: 'Excel formula to explain (e.g., "=VLOOKUP(A2,B:C,2,FALSE)")',
        },
        provider: {
          type: 'string',
          description:
            'Preferred AI provider: anthropic, openai, deepseek, gemini, or local (optional)',
          enum: ['anthropic', 'openai', 'deepseek', 'gemini', 'local'],
        },
      },
      required: ['formula'],
    },
  },
  {
    name: 'ai_provider_status',
    description: 'Check status of available AI providers',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'smart_data_analysis',
    description: 'AI-powered analysis suggestions for your data',
    inputSchema: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: 'Path to the CSV or Excel file to analyze',
        },
        sheet: {
          type: 'string',
          description: 'Sheet name for Excel files (optional)',
        },
        provider: {
          type: 'string',
          description:
            'Preferred AI provider: anthropic, openai, deepseek, gemini, or local (optional)',
          enum: ['anthropic', 'openai', 'deepseek', 'gemini', 'local'],
        },
      },
      required: ['filePath'],
    },
  },
];

async function evaluateFormula(args: any, ctx: ToolContext): Promise<ToolResult> {
  const { formula, context = {} } = args;

  try {
    const ast = parseFormula(formula);

    const workbookContext: WorkbookContext = {
      getCellValue: (reference: string) => {
        return context[reference] || 0;
      },
      getNamedRangeValue: (name: string) => {
        return context[name] || 0;
      },
      getRangeValues: (range: string) => {
        return context[range] || [];
      },
      getSheetCellValue: (sheetName: string, reference: string) => {
        const key = `${sheetName}!${reference}`;
        return context[key] || context[reference] || 0;
      },
      getSheetRangeValues: (sheetName: string, range: string) => {
        const key = `${sheetName}!${range}`;
        return context[key] || context[range] || [];
      },
    };

    const result = ctx.formulaEvaluator.evaluate(ast, workbookContext);

    return textResult({
      formula,
      result,
      success: true,
    });
  } catch (error) {
    return textResult({
      formula,
      error: error instanceof Error ? error.message : 'Unknown error',
      success: false,
    });
  }
}

async function parseNaturalLanguage(args: any, ctx: ToolContext): Promise<ToolResult> {
  const { query, filePath, provider } = args;

  try {
    let context = undefined;
    if (filePath) {
      try {
        const data = await readFileContent(filePath);
        context = {
          headers: data[0],
          rowCount: data.length,
          columnCount: data[0]?.length || 0,
          dataTypes: detectDataTypes(data),
          activeCell: 'A1',
          selectedRange: 'A1:A1',
        };
      } catch {
        // File context is optional, continue without it
      }
    }

    const result = await ctx.nlpProcessor.parseCommand(query, context, provider);

    if (result.type === 'formula') {
      try {
        const formulaResult = await ctx.nlpProcessor.buildFormula(query, context, provider);
        return textResult({
          query,
          command: result,
          formula: formulaResult,
          success: true,
          provider: ctx.nlpProcessor.getActiveProvider()?.name || 'Local',
        });
      } catch {
        // Fallback to just the command result
      }
    }

    return textResult({
      query,
      result,
      success: true,
      provider: ctx.nlpProcessor.getActiveProvider()?.name || 'Local',
    });
  } catch (error) {
    return textResult({
      query,
      error: error instanceof Error ? error.message : 'Unknown error',
      success: false,
    });
  }
}

async function explainFormula(args: any, ctx: ToolContext): Promise<ToolResult> {
  const { formula, provider } = args;

  try {
    const explanation = await ctx.nlpProcessor.explainFormula(formula, provider);

    return textResult({
      formula,
      explanation,
      success: true,
      provider: ctx.nlpProcessor.getActiveProvider()?.name || 'Local',
    });
  } catch (error) {
    return textResult({
      formula,
      error: error instanceof Error ? error.message : 'Unknown error',
      success: false,
    });
  }
}

async function getAIProviderStatus(_args: any, ctx: ToolContext): Promise<ToolResult> {
  try {
    const providers = ctx.nlpProcessor.getAvailableProviders();
    const activeProvider = ctx.nlpProcessor.getActiveProvider();
    const healthStatus = await ctx.nlpProcessor.testProviders();

    return textResult({
      activeProvider,
      availableProviders: providers,
      healthStatus,
      success: true,
    });
  } catch (error) {
    return textResult({
      error: error instanceof Error ? error.message : 'Unknown error',
      success: false,
    });
  }
}

async function smartDataAnalysis(args: any, ctx: ToolContext): Promise<ToolResult> {
  const { filePath, sheet, provider } = args;

  try {
    const data = await readFileContent(filePath, sheet);

    if (data.length === 0) {
      throw new Error('File is empty');
    }

    const context = {
      headers: data[0],
      rowCount: data.length,
      columnCount: data[0]?.length || 0,
      dataTypes: detectDataTypes(data),
      sampleData: data.slice(0, 6),
      activeCell: 'A1',
      selectedRange: 'A1:A1',
    };

    const suggestions = await ctx.nlpProcessor.suggestFormulas(context);

    const profile = await dataProfile({ filePath, sheet });

    return textResult({
      filePath,
      context: {
        headers: context.headers,
        rowCount: context.rowCount,
        columnCount: context.columnCount,
        dataTypes: context.dataTypes,
      },
      aiSuggestions: suggestions,
      dataProfile: JSON.parse(profile.content[0].text),
      success: true,
      provider: ctx.nlpProcessor.getActiveProvider()?.name || 'Local',
    });
  } catch (error) {
    return textResult({
      filePath,
      error: error instanceof Error ? error.message : 'Unknown error',
      success: false,
    });
  }
}

const handlers: Record<string, ToolHandler> = {
  evaluate_formula: evaluateFormula,
  parse_natural_language: parseNaturalLanguage,
  explain_formula: explainFormula,
  ai_provider_status: getAIProviderStatus,
  smart_data_analysis: smartDataAnalysis,
};

export const aiTools: ToolModule = { definitions, handlers };
