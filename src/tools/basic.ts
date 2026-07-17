import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { parseA1Notation } from '../utils/a1.js';
import { readFileContent } from '../utils/file-io.js';
import { resolveColumnIndex } from '../utils/columns.js';
import type { ToolHandler, ToolModule, ToolResult } from './types.js';
import { textResult } from './types.js';

const definitions: Tool[] = [
  {
    name: 'read_file',
    description: 'Read an entire CSV or Excel file',
    inputSchema: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: 'Path to the CSV or Excel file',
        },
        sheet: {
          type: 'string',
          description: 'Sheet name for Excel files (optional, defaults to first sheet)',
        },
      },
      required: ['filePath'],
    },
  },
  {
    name: 'get_cell',
    description: 'Get the value of a specific cell using A1 notation',
    inputSchema: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: 'Path to the CSV or Excel file',
        },
        cell: {
          type: 'string',
          description: 'Cell address in A1 notation (e.g., "A1", "B5")',
        },
        sheet: {
          type: 'string',
          description: 'Sheet name for Excel files (optional)',
        },
      },
      required: ['filePath', 'cell'],
    },
  },
  {
    name: 'get_range',
    description: 'Get values from a range of cells',
    inputSchema: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: 'Path to the CSV or Excel file',
        },
        startCell: {
          type: 'string',
          description: 'Start cell in A1 notation (e.g., "A1")',
        },
        endCell: {
          type: 'string',
          description: 'End cell in A1 notation (e.g., "D10")',
        },
        sheet: {
          type: 'string',
          description: 'Sheet name for Excel files (optional)',
        },
      },
      required: ['filePath', 'startCell', 'endCell'],
    },
  },
  {
    name: 'get_headers',
    description: 'Get the column headers (first row) of a file',
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
    name: 'search',
    description: 'Search for cells containing a specific value',
    inputSchema: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: 'Path to the CSV or Excel file',
        },
        searchValue: {
          type: 'string',
          description: 'Value to search for',
        },
        exact: {
          type: 'boolean',
          description: 'Whether to match exactly or contains (default: false)',
        },
        sheet: {
          type: 'string',
          description: 'Sheet name for Excel files (optional)',
        },
      },
      required: ['filePath', 'searchValue'],
    },
  },
  {
    name: 'filter_rows',
    description: 'Filter rows based on column values',
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
        condition: {
          type: 'string',
          description: 'Condition: equals, contains, greater_than, less_than',
          enum: ['equals', 'contains', 'greater_than', 'less_than'],
        },
        value: {
          type: 'string',
          description: 'Value to compare against',
        },
        sheet: {
          type: 'string',
          description: 'Sheet name for Excel files (optional)',
        },
      },
      required: ['filePath', 'column', 'condition', 'value'],
    },
  },
  {
    name: 'aggregate',
    description: 'Perform aggregation operations on a column',
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
      required: ['filePath', 'column', 'operation'],
    },
  },
];

async function readFile(args: any): Promise<ToolResult> {
  const { filePath, sheet } = args;
  const data = await readFileContent(filePath, sheet);
  console.log('\n\n\n\nDATA READ', data);
  return textResult({
    rows: data.length,
    columns: data[0]?.length || 0,
    data: data,
  });
}

async function getCell(args: any): Promise<ToolResult> {
  const { filePath, cell, sheet } = args;
  const data = await readFileContent(filePath, sheet);
  const { row, col } = parseA1Notation(cell);

  if (row >= data.length || col >= (data[0]?.length || 0)) {
    throw new Error(`Cell ${cell} is out of range`);
  }

  const value = data[row][col];

  return textResult({
    cell,
    value,
  });
}

async function getRange(args: any): Promise<ToolResult> {
  const { filePath, startCell, endCell, sheet } = args;
  const data = await readFileContent(filePath, sheet);
  const start = parseA1Notation(startCell);
  const end = parseA1Notation(endCell);

  const rangeData = [];
  for (let row = start.row; row <= end.row && row < data.length; row++) {
    const rowData = [];
    for (let col = start.col; col <= end.col && col < (data[row]?.length || 0); col++) {
      rowData.push(data[row][col]);
    }
    rangeData.push(rowData);
  }

  return textResult({
    range: `${startCell}:${endCell}`,
    data: rangeData,
  });
}

async function getHeaders(args: any): Promise<ToolResult> {
  const { filePath, sheet } = args;
  const data = await readFileContent(filePath, sheet);

  if (data.length === 0) {
    throw new Error('File is empty');
  }

  return textResult({
    headers: data[0],
  });
}

async function search(args: any): Promise<ToolResult> {
  const { filePath, searchValue, exact = false, sheet } = args;
  const data = await readFileContent(filePath, sheet);
  const results = [];

  for (let row = 0; row < data.length; row++) {
    for (let col = 0; col < (data[row]?.length || 0); col++) {
      const cellValue = String(data[row][col]);
      const matches = exact
        ? cellValue === searchValue
        : cellValue.toLowerCase().includes(searchValue.toLowerCase());

      if (matches) {
        const colLetter = String.fromCharCode(65 + (col % 26));
        results.push({
          cell: `${colLetter}${row + 1}`,
          value: data[row][col],
          row: row + 1,
          column: col + 1,
        });
      }
    }
  }

  return textResult({
    searchValue,
    found: results.length,
    results,
  });
}

async function filterRows(args: any): Promise<ToolResult> {
  const { filePath, column, condition, value, sheet } = args;
  const data = await readFileContent(filePath, sheet);

  if (data.length === 0) {
    throw new Error('File is empty');
  }

  const colIndex = resolveColumnIndex(data[0], column);

  const headers = data[0];
  const filteredRows = [headers];

  for (let i = 1; i < data.length; i++) {
    const cellValue = String(data[i][colIndex]);
    let matches = false;

    switch (condition) {
      case 'equals':
        matches = cellValue === value;
        break;
      case 'contains':
        matches = cellValue.toLowerCase().includes(value.toLowerCase());
        break;
      case 'greater_than':
        matches = Number(cellValue) > Number(value);
        break;
      case 'less_than':
        matches = Number(cellValue) < Number(value);
        break;
    }

    if (matches) {
      filteredRows.push(data[i]);
    }
  }

  return textResult({
    totalRows: data.length - 1,
    filteredRows: filteredRows.length - 1,
    data: filteredRows,
  });
}

async function aggregate(args: any): Promise<ToolResult> {
  const { filePath, column, operation, sheet } = args;
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

  let result;
  switch (operation) {
    case 'sum':
      result = values.reduce((a, b) => a + b, 0);
      break;
    case 'average':
      result = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
      break;
    case 'count':
      result = values.length;
      break;
    case 'min':
      result = values.length > 0 ? Math.min(...values) : null;
      break;
    case 'max':
      result = values.length > 0 ? Math.max(...values) : null;
      break;
  }

  return textResult({
    column: data[0][colIndex],
    operation,
    result,
    validValues: values.length,
  });
}

const handlers: Record<string, ToolHandler> = {
  read_file: (args) => readFile(args),
  get_cell: (args) => getCell(args),
  get_range: (args) => getRange(args),
  get_headers: (args) => getHeaders(args),
  search: (args) => search(args),
  filter_rows: (args) => filterRows(args),
  aggregate: (args) => aggregate(args),
};

export const basicTools: ToolModule = { definitions, handlers };
