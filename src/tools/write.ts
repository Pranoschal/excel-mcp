import * as fs from 'fs/promises';
import * as path from 'path';
import * as csvStringify from 'csv-stringify/sync';
import * as XLSX from 'xlsx';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { publishGeneratedFile } from '../supabase-files.js';
import { parseA1Notation } from '../utils/a1.js';
import {
  correlationAnalysis,
  dataProfile,
  pivotTable,
  statisticalAnalysis,
} from './analytics.js';
import type { ToolHandler, ToolModule, ToolResult } from './types.js';
import { textResult } from './types.js';

const definitions: Tool[] = [
  {
    name: 'write_file',
    description: 'Write data to a new CSV or Excel file (supports multiple sheets for Excel)',
    inputSchema: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: 'Path for the new file (must end with .csv, .xlsx, or .xls)',
        },
        data: {
          type: 'array',
          description: 'Array of arrays representing rows of data (single sheet mode)',
          items: {
            type: 'array',
          },
        },
        headers: {
          type: 'array',
          description: 'Optional headers for the first row (single sheet mode)',
          items: {
            type: 'string',
          },
        },
        sheet: {
          type: 'string',
          description: 'Sheet name for Excel files (single sheet mode, defaults to "Sheet1")',
        },
        sheets: {
          type: 'array',
          description: 'Array of sheet objects for multi-sheet Excel files',
          items: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'Sheet name',
              },
              data: {
                type: 'array',
                description: 'Array of arrays representing rows of data',
                items: {
                  type: 'array',
                },
              },
              headers: {
                type: 'array',
                description: 'Optional headers for the first row',
                items: {
                  type: 'string',
                },
              },
            },
            required: ['name', 'data'],
          },
        },
      },
      required: ['filePath'],
    },
  },
  {
    name: 'add_sheet',
    description: 'Add a new sheet to an existing Excel file',
    inputSchema: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: 'Path to the existing Excel file (.xlsx or .xls)',
        },
        sheetName: {
          type: 'string',
          description: 'Name for the new sheet',
        },
        data: {
          type: 'array',
          description: 'Array of arrays representing rows of data',
          items: {
            type: 'array',
          },
        },
        headers: {
          type: 'array',
          description: 'Optional headers for the first row',
          items: {
            type: 'string',
          },
        },
        position: {
          type: 'number',
          description: 'Position to insert the sheet (0-based index, optional)',
        },
      },
      required: ['filePath', 'sheetName', 'data'],
    },
  },
  {
    name: 'write_multi_sheet',
    description:
      'Create a complex Excel file with multiple sheets, formulas, and inter-sheet references',
    inputSchema: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: 'Path for the new Excel file (must end with .xlsx or .xls)',
        },
        sheets: {
          type: 'array',
          description: 'Array of sheet definitions',
          items: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'Sheet name',
              },
              data: {
                type: 'array',
                description: 'Array of arrays representing rows of data',
                items: {
                  type: 'array',
                },
              },
              headers: {
                type: 'array',
                description: 'Optional headers for the first row',
                items: {
                  type: 'string',
                },
              },
              formulas: {
                type: 'array',
                description: 'Array of formula definitions',
                items: {
                  type: 'object',
                  properties: {
                    cell: {
                      type: 'string',
                      description: 'Cell address in A1 notation (e.g., "A1", "B5")',
                    },
                    formula: {
                      type: 'string',
                      description:
                        'Excel formula (e.g., "=SUM(A1:A10)", "=Sheet1!A1+Sheet2!B2")',
                    },
                  },
                  required: ['cell', 'formula'],
                },
              },
            },
            required: ['name', 'data'],
          },
        },
        sheetReferences: {
          type: 'boolean',
          description: 'Enable inter-sheet formula references (default: true)',
        },
      },
      required: ['filePath', 'sheets'],
    },
  },
  {
    name: 'export_analysis',
    description: 'Export analysis results (pivot tables, statistics, etc.) to a new file',
    inputSchema: {
      type: 'object',
      properties: {
        analysisType: {
          type: 'string',
          description: 'Type of analysis to export',
          enum: ['pivot_table', 'statistical_analysis', 'correlation', 'data_profile'],
        },
        sourceFile: {
          type: 'string',
          description: 'Path to the source data file',
        },
        outputFile: {
          type: 'string',
          description: 'Path for the output file',
        },
        analysisParams: {
          type: 'object',
          description: 'Parameters for the analysis (depends on analysisType)',
        },
      },
      required: ['analysisType', 'sourceFile', 'outputFile', 'analysisParams'],
    },
  },
];

async function buildWriteSuccessResponse(
  absolutePath: string,
  metadata: Record<string, unknown>
): Promise<ToolResult> {
  const preferredName = path.basename(absolutePath);

  try {
    const published = await publishGeneratedFile(absolutePath, preferredName);

    return textResult({
      success: true,
      ...metadata,
      ...published,
    });
  } catch (uploadError) {
    const message =
      uploadError instanceof Error ? uploadError.message : String(uploadError);

    return textResult({
      success: false,
      ...metadata,
      error: message,
      hint:
        'File was written on the server but could not be uploaded to Supabase. Ensure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set on the MCP server.',
    });
  }
}

export async function writeFile(args: any): Promise<ToolResult> {
  const { filePath, data, headers, sheet = 'Sheet1', sheets } = args;
  const ext = path.extname(filePath).toLowerCase();
  const absolutePath = path.resolve(filePath);

  if (sheets && Array.isArray(sheets)) {
    if (ext === '.csv') {
      throw new Error(
        'CSV format does not support multiple sheets. Use .xlsx or .xls for multi-sheet files.'
      );
    }

    if (ext !== '.xlsx' && ext !== '.xls') {
      throw new Error('Multi-sheet mode only works with Excel files (.xlsx or .xls)');
    }

    const workbook = XLSX.utils.book_new();
    let totalRows = 0;
    let totalColumns = 0;

    for (const sheetData of sheets) {
      if (!sheetData.data || !Array.isArray(sheetData.data)) {
        throw new Error(`Sheet "${sheetData.name}" must have valid data array`);
      }

      const fullData = sheetData.headers
        ? [sheetData.headers, ...sheetData.data]
        : sheetData.data;

      if (fullData.length === 0) {
        fullData.push([]);
      }

      const worksheet = XLSX.utils.aoa_to_sheet(fullData);
      XLSX.utils.book_append_sheet(workbook, worksheet, sheetData.name);

      totalRows += fullData.length;
      if (fullData.length > 0 && Array.isArray(fullData[0])) {
        totalColumns = Math.max(totalColumns, fullData[0].length || 0);
      }
    }

    XLSX.writeFile(workbook, absolutePath);

    return buildWriteSuccessResponse(absolutePath, {
      mode: 'multi-sheet',
      sheetsWritten: sheets.length,
      sheetNames: sheets.map((s: { name: string }) => s.name),
      totalRowsWritten: totalRows,
      maxColumnsWritten: totalColumns,
    });
  }

  if (!data || !Array.isArray(data)) {
    throw new Error(
      'Either "data" (for single sheet) or "sheets" (for multiple sheets) must be provided.'
    );
  }

  const fullData = headers ? [headers, ...data] : data;

  if (ext === '.csv') {
    const csvContent = csvStringify.stringify(fullData);
    await fs.writeFile(absolutePath, csvContent, 'utf-8');
  } else if (ext === '.xlsx' || ext === '.xls') {
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet(fullData);
    XLSX.utils.book_append_sheet(workbook, worksheet, sheet);
    XLSX.writeFile(workbook, absolutePath);
  } else {
    throw new Error('Unsupported file format. Please use .csv, .xlsx, or .xls extension.');
  }

  return buildWriteSuccessResponse(absolutePath, {
    mode: 'single-sheet',
    sheetName: ext === '.csv' ? null : sheet,
    rowsWritten: fullData.length,
    columnsWritten: fullData[0]?.length || 0,
  });
}

async function addSheet(args: any): Promise<ToolResult> {
  const { filePath, sheetName, data, headers, position } = args;
  const ext = path.extname(filePath).toLowerCase();
  const absolutePath = path.resolve(filePath);

  if (ext !== '.xlsx' && ext !== '.xls') {
    throw new Error('add_sheet only works with Excel files (.xlsx or .xls)');
  }

  try {
    await fs.access(absolutePath);
  } catch {
    throw new Error(`File not found: ${filePath}`);
  }

  const workbook = XLSX.readFile(absolutePath);

  if (workbook.SheetNames.includes(sheetName)) {
    throw new Error(`Sheet "${sheetName}" already exists in the workbook`);
  }

  const fullData = headers ? [headers, ...data] : data;

  const worksheet = XLSX.utils.aoa_to_sheet(fullData);

  if (position !== undefined && position >= 0 && position <= workbook.SheetNames.length) {
    workbook.SheetNames.splice(position, 0, sheetName);
    workbook.Sheets[sheetName] = worksheet;
  } else {
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  }

  XLSX.writeFile(workbook, absolutePath);

  return textResult({
    success: true,
    filePath: absolutePath,
    sheetName,
    sheetCount: workbook.SheetNames.length,
    sheetNames: workbook.SheetNames,
    rowsAdded: fullData.length,
    columnsAdded: fullData[0]?.length || 0,
    position: position !== undefined ? position : workbook.SheetNames.length - 1,
  });
}

async function writeMultiSheet(args: any): Promise<ToolResult> {
  const { filePath, sheets, sheetReferences = true } = args;
  const ext = path.extname(filePath).toLowerCase();
  const absolutePath = path.resolve(filePath);

  if (ext !== '.xlsx' && ext !== '.xls') {
    throw new Error('write_multi_sheet only works with Excel files (.xlsx or .xls)');
  }

  const workbook = XLSX.utils.book_new();
  const sheetInfo: any[] = [];

  for (const sheetDef of sheets) {
    const { name, data, headers, formulas } = sheetDef;

    const fullData = headers ? [headers, ...data] : data;

    const worksheet = XLSX.utils.aoa_to_sheet(fullData);

    if (formulas && Array.isArray(formulas)) {
      for (const formulaDef of formulas) {
        const { cell, formula } = formulaDef;
        // Validate A1 notation (throws on invalid addresses)
        parseA1Notation(cell);

        if (!worksheet[cell]) {
          worksheet[cell] = {};
        }
        worksheet[cell].f = formula;

        const cleanFormula = formula.startsWith('=') ? formula.substring(1) : formula;
        worksheet[cell].f = cleanFormula;
      }
    }

    XLSX.utils.book_append_sheet(workbook, worksheet, name);

    sheetInfo.push({
      name,
      rowCount: fullData.length,
      columnCount: fullData.length > 0 && fullData[0] ? fullData[0].length : 0,
      formulaCount: formulas?.length || 0,
    });
  }

  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet['!ref']) {
      const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
      worksheet['!ref'] = XLSX.utils.encode_range(range);
    }
  }

  XLSX.writeFile(workbook, absolutePath);

  return buildWriteSuccessResponse(absolutePath, {
    mode: 'multi-sheet-advanced',
    sheetsCreated: sheets.length,
    sheetReferences: sheetReferences,
    sheets: sheetInfo,
    totalFormulas: sheetInfo.reduce((sum, sheet) => sum + sheet.formulaCount, 0),
  });
}

async function exportAnalysis(args: any): Promise<ToolResult> {
  const { analysisType, sourceFile, outputFile, analysisParams } = args;

  let exportData: any[][] = [];

  switch (analysisType) {
    case 'pivot_table': {
      const pivotResult = await pivotTable({
        filePath: sourceFile,
        ...analysisParams,
      });
      const pivotData = JSON.parse(pivotResult.content[0].text);

      exportData = [
        ['Group', 'Value', 'Count'],
        ...pivotData.pivotTable.results.map((r: any) => [r.group, r.value, r.count]),
      ];
      break;
    }

    case 'statistical_analysis': {
      const statsResult = await statisticalAnalysis({
        filePath: sourceFile,
        ...analysisParams,
      });
      const statsData = JSON.parse(statsResult.content[0].text);

      exportData = [
        ['Metric', 'Value'],
        ['Column', statsData.column],
        ['Count', statsData.statistics.count],
        ['Sum', statsData.statistics.sum],
        ['Mean', statsData.statistics.mean],
        ['Median', statsData.statistics.median],
        ['Min', statsData.statistics.min],
        ['Max', statsData.statistics.max],
        ['Range', statsData.statistics.range],
        ['Std Dev', statsData.statistics.standardDeviation],
        ['Variance', statsData.statistics.variance],
        ['CV%', statsData.statistics.coefficientOfVariation],
        ['Q1', statsData.statistics.quartiles.q1],
        ['Q3', statsData.statistics.quartiles.q3],
        ['IQR', statsData.statistics.quartiles.iqr],
        ['Skewness', statsData.statistics.skewness],
      ];
      break;
    }

    case 'correlation': {
      const corrResult = await correlationAnalysis({
        filePath: sourceFile,
        ...analysisParams,
      });
      const corrData = JSON.parse(corrResult.content[0].text);

      exportData = [
        ['Metric', 'Value'],
        ['Column 1', corrData.column1],
        ['Column 2', corrData.column2],
        ['Correlation', corrData.correlation],
        ['R-squared', corrData.rSquared],
        ['P-value', corrData.pValue || 'N/A'],
        ['Interpretation', corrData.interpretation],
      ];
      break;
    }

    case 'data_profile': {
      const profileResult = await dataProfile({
        filePath: sourceFile,
        ...analysisParams,
      });
      const profileData = JSON.parse(profileResult.content[0].text);

      const headers = ['Column', 'Type', 'Count', 'Unique', 'Missing', 'Missing%'];
      const rows = profileData.columns.map((col: any) => [
        col.name,
        col.type,
        col.count,
        col.unique,
        col.missing,
        col.missingPercentage,
      ]);

      exportData = [headers, ...rows];
      break;
    }

    default:
      throw new Error(`Unsupported analysis type: ${analysisType}`);
  }

  const writeResult = await writeFile({
    filePath: outputFile,
    data: exportData.slice(1),
    headers: exportData[0],
  });

  const writeData = JSON.parse(writeResult.content[0].text);

  return textResult({
    success: writeData.success ?? true,
    analysisType,
    sourceFile,
    outputFile,
    rowsExported: exportData.length,
    storagePath: writeData.storagePath,
    downloadUrl: writeData.downloadUrl,
    fileName: writeData.fileName,
    expiresIn: writeData.expiresIn,
    error: writeData.error,
    hint: writeData.hint,
  });
}

const handlers: Record<string, ToolHandler> = {
  write_file: (args) => writeFile(args),
  add_sheet: (args) => addSheet(args),
  write_multi_sheet: (args) => writeMultiSheet(args),
  export_analysis: (args) => exportAnalysis(args),
};

export const writeTools: ToolModule = { definitions, handlers };
