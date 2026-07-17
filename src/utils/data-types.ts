export function detectDataTypes(
  data: any[][]
): Record<string, 'number' | 'text' | 'date' | 'formula'> {
  if (data.length < 2) return {};

  const headers = data[0];
  const types: Record<string, 'number' | 'text' | 'date' | 'formula'> = {};

  for (let col = 0; col < headers.length; col++) {
    const columnData = data
      .slice(1)
      .map((row) => row[col])
      .filter((val) => val != null && val !== '');

    if (columnData.length === 0) {
      types[headers[col]] = 'text';
      continue;
    }

    const numericCount = columnData.filter((val) => !isNaN(Number(val))).length;
    const dateCount = columnData.filter((val) => !isNaN(Date.parse(val))).length;

    if (numericCount === columnData.length) {
      types[headers[col]] = 'number';
    } else if (dateCount === columnData.length) {
      types[headers[col]] = 'date';
    } else {
      types[headers[col]] = 'text';
    }
  }

  return types;
}
