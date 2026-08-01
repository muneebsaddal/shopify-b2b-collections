const DANGEROUS_CELL_START = /^[=+\-@\t\r]/;

export function neutralizeSpreadsheetCell(value: string): string {
  return DANGEROUS_CELL_START.test(value) ? `'${value}` : value;
}

export function csvCell(value: string): string {
  const safe = neutralizeSpreadsheetCell(value);
  return `"${safe.replaceAll('"', '""')}"`;
}

export function createCsv(rows: string[][]): string {
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}
