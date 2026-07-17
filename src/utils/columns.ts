/** Resolve a column name or 0-based index against header row. */
export function resolveColumnIndex(headers: any[], column: string | number): number {
  const colIndex = isNaN(Number(column)) ? headers.indexOf(column) : Number(column);

  if (colIndex === -1 || colIndex >= (headers?.length || 0)) {
    throw new Error(`Column "${column}" not found`);
  }

  return colIndex;
}
