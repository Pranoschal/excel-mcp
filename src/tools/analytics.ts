import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { readFileContent } from '../utils/file-io.js';
import { resolveColumnIndex } from '../utils/columns.js';
import type { ToolHandler, ToolModule, ToolResult } from './types.js';
import { textResult } from './types.js';

const definitions: Tool[] = [
  {
    name: 'statistical_analysis',
    description: 'Perform comprehensive statistical analysis on a column',
    inputSchema: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: 'Path to the CSV or Excel file',
        },
        column: {
          type: 'string',
          description: 'Column name or index (0-based)',
        },
        sheet: {
          type: 'string',
          description: 'Sheet name for Excel files (optional)',
        },
      },
      required: ['filePath', 'column'],
    },
  },
  {
    name: 'correlation_analysis',
    description: 'Calculate correlation between two numeric columns',
    inputSchema: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: 'Path to the CSV or Excel file',
        },
        column1: {
          type: 'string',
          description: 'First column name or index (0-based)',
        },
        column2: {
          type: 'string',
          description: 'Second column name or index (0-based)',
        },
        sheet: {
          type: 'string',
          description: 'Sheet name for Excel files (optional)',
        },
      },
      required: ['filePath', 'column1', 'column2'],
    },
  },
  {
    name: 'data_profile',
    description: 'Generate comprehensive data profiling report for all columns',
    inputSchema: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: 'Path to the CSV or Excel file',
        },
        sheet: {
          type: 'string',
          description: 'Sheet name for Excel files (optional)',
        },
      },
      required: ['filePath'],
    },
  },
  {
    name: 'pivot_table',
    description: 'Create pivot table with grouping and aggregation',
    inputSchema: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: 'Path to the CSV or Excel file',
        },
        groupBy: {
          type: 'string',
          description: 'Column to group by',
        },
        aggregateColumn: {
          type: 'string',
          description: 'Column to aggregate',
        },
        operation: {
          type: 'string',
          description: 'Aggregation operation',
          enum: ['sum', 'average', 'count', 'min', 'max'],
        },
        sheet: {
          type: 'string',
          description: 'Sheet name for Excel files (optional)',
        },
      },
      required: ['filePath', 'groupBy', 'aggregateColumn', 'operation'],
    },
  },
];

export async function statisticalAnalysis(args: any): Promise<ToolResult> {
  const { filePath, column, sheet } = args;
  const data = await readFileContent(filePath, sheet);

  if (data.length <= 1) {
    throw new Error('File has no data rows');
  }

  const colIndex = resolveColumnIndex(data[0], column);

  const values = [];
  for (let i = 1; i < data.length; i++) {
    const val = Number(data[i][colIndex]);
    if (!isNaN(val)) {
      values.push(val);
    }
  }

  if (values.length === 0) {
    throw new Error('No numeric values found in column');
  }

  const n = values.length;
  const sum = values.reduce((a, b) => a + b, 0);
  const mean = sum / n;

  const sorted = [...values].sort((a, b) => a - b);
  const median =
    n % 2 === 0 ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2 : sorted[Math.floor(n / 2)];

  const frequency: Record<number, number> = {};
  values.forEach((val) => (frequency[val] = (frequency[val] || 0) + 1));
  const maxFreq = Math.max(...Object.values(frequency));
  const modes = Object.keys(frequency)
    .filter((val) => frequency[+val] === maxFreq)
    .map(Number);

  const variance = values.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / (n - 1);
  const stdDev = Math.sqrt(variance);

  const q1 = sorted[Math.floor(n * 0.25)];
  const q3 = sorted[Math.floor(n * 0.75)];
  const iqr = q3 - q1;

  const skewness = 3 * (mean - median) / stdDev;

  return textResult({
    column: data[0][colIndex],
    statistics: {
      count: n,
      sum,
      mean: Math.round(mean * 10000) / 10000,
      median,
      mode: modes.length === 1 ? modes[0] : modes,
      min: Math.min(...values),
      max: Math.max(...values),
      range: Math.max(...values) - Math.min(...values),
      variance: Math.round(variance * 10000) / 10000,
      standardDeviation: Math.round(stdDev * 10000) / 10000,
      quartiles: {
        q1,
        q2: median,
        q3,
        iqr,
      },
      skewness: Math.round(skewness * 10000) / 10000,
      coefficientOfVariation: Math.round((stdDev / mean) * 100 * 100) / 100,
    },
  });
}

export async function correlationAnalysis(args: any): Promise<ToolResult> {
  const { filePath, column1, column2, sheet } = args;
  const data = await readFileContent(filePath, sheet);

  if (data.length <= 1) {
    throw new Error('File has no data rows');
  }

  const col1Index = isNaN(Number(column1)) ? data[0].indexOf(column1) : Number(column1);
  const col2Index = isNaN(Number(column2)) ? data[0].indexOf(column2) : Number(column2);

  if (col1Index === -1 || col2Index === -1) {
    throw new Error('One or both columns not found');
  }

  const pairs = [];
  for (let i = 1; i < data.length; i++) {
    const val1 = Number(data[i][col1Index]);
    const val2 = Number(data[i][col2Index]);
    if (!isNaN(val1) && !isNaN(val2)) {
      pairs.push([val1, val2]);
    }
  }

  if (pairs.length < 2) {
    throw new Error('Not enough valid numeric pairs for correlation analysis');
  }

  const n = pairs.length;
  const sumX = pairs.reduce((sum, [x]) => sum + x, 0);
  const sumY = pairs.reduce((sum, [, y]) => sum + y, 0);
  const sumXY = pairs.reduce((sum, [x, y]) => sum + x * y, 0);
  const sumX2 = pairs.reduce((sum, [x]) => sum + x * x, 0);
  const sumY2 = pairs.reduce((sum, [, y]) => sum + y * y, 0);

  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

  const correlation = denominator === 0 ? 0 : numerator / denominator;

  const absCorr = Math.abs(correlation);
  let strength = 'No correlation';
  if (absCorr >= 0.9) strength = 'Very strong';
  else if (absCorr >= 0.7) strength = 'Strong';
  else if (absCorr >= 0.5) strength = 'Moderate';
  else if (absCorr >= 0.3) strength = 'Weak';
  else if (absCorr >= 0.1) strength = 'Very weak';

  return textResult({
    column1: data[0][col1Index],
    column2: data[0][col2Index],
    correlation: {
      coefficient: Math.round(correlation * 10000) / 10000,
      strength,
      direction: correlation > 0 ? 'Positive' : correlation < 0 ? 'Negative' : 'None',
      validPairs: n,
      interpretation: `${strength} ${correlation > 0 ? 'positive' : correlation < 0 ? 'negative' : ''} correlation`,
    },
  });
}

export async function dataProfile(args: any): Promise<ToolResult> {
  const { filePath, sheet } = args;
  const data = await readFileContent(filePath, sheet);

  if (data.length === 0) {
    throw new Error('File is empty');
  }

  const headers = data[0];
  const profile: Record<string, any> = {
    overview: {
      totalRows: data.length - 1,
      totalColumns: headers.length,
      fileName: filePath.split('/').pop() || filePath,
    },
    columns: {},
  };

  for (let colIdx = 0; colIdx < headers.length; colIdx++) {
    const columnName = headers[colIdx];
    const values = data.slice(1).map((row) => row[colIdx]);
    const nonEmptyValues = values.filter((val) => val !== '' && val !== null && val !== undefined);

    const numericValues = nonEmptyValues.map(Number).filter((val) => !isNaN(val));
    const isNumeric = numericValues.length > nonEmptyValues.length * 0.8;

    const columnProfile: Record<string, any> = {
      dataType: isNumeric ? 'Numeric' : 'Text',
      totalValues: values.length,
      nonEmptyValues: nonEmptyValues.length,
      emptyValues: values.length - nonEmptyValues.length,
      uniqueValues: new Set(nonEmptyValues).size,
      duplicateValues: nonEmptyValues.length - new Set(nonEmptyValues).size,
    };

    if (isNumeric && numericValues.length > 0) {
      const mean = numericValues.reduce((a, b) => a + b, 0) / numericValues.length;
      columnProfile.statistics = {
        min: Math.min(...numericValues),
        max: Math.max(...numericValues),
        mean: Math.round(mean * 100) / 100,
        median: numericValues.sort((a, b) => a - b)[Math.floor(numericValues.length / 2)],
      };
    } else {
      const lengths = nonEmptyValues.map((val) => String(val).length);
      if (lengths.length > 0) {
        columnProfile.textAnalysis = {
          minLength: Math.min(...lengths),
          maxLength: Math.max(...lengths),
          avgLength: Math.round((lengths.reduce((a, b) => a + b, 0) / lengths.length) * 100) / 100,
        };
      }
    }

    profile.columns[columnName] = columnProfile;
  }

  return textResult(profile);
}

export async function pivotTable(args: any): Promise<ToolResult> {
  const { filePath, groupBy, aggregateColumn, operation, sheet } = args;
  const data = await readFileContent(filePath, sheet);

  if (data.length <= 1) {
    throw new Error('File has no data rows');
  }

  const groupByIndex = isNaN(Number(groupBy)) ? data[0].indexOf(groupBy) : Number(groupBy);
  const aggIndex = isNaN(Number(aggregateColumn))
    ? data[0].indexOf(aggregateColumn)
    : Number(aggregateColumn);

  if (groupByIndex === -1 || aggIndex === -1) {
    throw new Error('One or both columns not found');
  }

  const groups: Record<string, number[]> = {};
  for (let i = 1; i < data.length; i++) {
    const groupKey = String(data[i][groupByIndex]);
    const value = Number(data[i][aggIndex]);

    if (!groups[groupKey]) {
      groups[groupKey] = [];
    }

    if (!isNaN(value)) {
      groups[groupKey].push(value);
    }
  }

  const results: Array<{ group: string; value: number; count: number }> = [];
  for (const [group, values] of Object.entries(groups)) {
    if (values.length === 0) continue;

    let result: number;
    switch (operation) {
      case 'sum':
        result = values.reduce((a: number, b: number) => a + b, 0);
        break;
      case 'average':
        result = values.reduce((a: number, b: number) => a + b, 0) / values.length;
        break;
      case 'count':
        result = values.length;
        break;
      case 'min':
        result = Math.min(...values);
        break;
      case 'max':
        result = Math.max(...values);
        break;
      default:
        result = 0;
    }

    results.push({
      group,
      value: Math.round(result * 100) / 100,
      count: values.length,
    });
  }

  results.sort((a, b) => b.value - a.value);

  return textResult({
    pivotTable: {
      groupBy: data[0][groupByIndex],
      aggregateColumn: data[0][aggIndex],
      operation,
      totalGroups: results.length,
      results,
    },
  });
}

const handlers: Record<string, ToolHandler> = {
  statistical_analysis: (args) => statisticalAnalysis(args),
  correlation_analysis: (args) => correlationAnalysis(args),
  data_profile: (args) => dataProfile(args),
  pivot_table: (args) => pivotTable(args),
};

export const analyticsTools: ToolModule = { definitions, handlers };
