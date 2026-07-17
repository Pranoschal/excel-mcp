import * as fs from 'fs/promises';
import * as path from 'path';
import * as csv from 'csv-parse/sync';
import * as XLSX from 'xlsx';
import { resolveLocalFilePath } from '../supabase-files.js';

export async function readFileContent(filePath: string, sheet?: string): Promise<any[][]> {
  const ext = path.extname(filePath).toLowerCase();
  const absolutePath = await resolveLocalFilePath(filePath);

  if (ext === '.csv') {
    const content = await fs.readFile(absolutePath, 'utf-8');
    return csv.parse(content, {
      skip_empty_lines: true,
      relax_quotes: true,
      relax_column_count: true,
    });
  } else if (ext === '.xlsx' || ext === '.xls') {
    try {
      const buffer = await fs.readFile(absolutePath);
      const workbook = XLSX.read(buffer, { type: 'buffer' });

      if (!workbook.SheetNames.length) {
        throw new Error('No sheets found in the workbook');
      }

      const sheetName = sheet || workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];

      if (!worksheet) {
        throw new Error(`Sheet "${sheetName}" not found`);
      }

      console.log('Available sheets:', workbook.SheetNames);
      console.log('Reading sheet:', sheetName);

      const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' }) as any[][];
      console.log('Parsed data rows:', data.length);

      return data;
    } catch (error) {
      console.error('Error reading XLSX file:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown Error Occured';
      throw new Error(`Failed to read XLSX file: ${errorMessage}`);
    }
  } else {
    throw new Error('Unsupported file format. Please use .csv, .xlsx, or .xls files.');
  }
}
