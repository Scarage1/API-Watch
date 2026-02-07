/**
 * Data-Driven Testing Utilities
 *
 * Parse CSV and JSON data files into row-based datasets that can be
 * used to parameterise test suite iterations. Each row becomes a
 * set of variables that are injected into the request templates.
 *
 * CSV format:
 *   - First row is treated as header / variable names
 *   - Subsequent rows are data values
 *   - Supports quoted fields with commas
 *
 * JSON format:
 *   - Array of objects (each object = one iteration)
 *   - e.g. [{ "userId": "1", "name": "Alice" }, ...]
 */

export interface DataRow {
  [key: string]: string;
}

export interface DataFileResult {
  rows: DataRow[];
  columns: string[];
  format: 'csv' | 'json';
  errors: string[];
}

// ── CSV Parser ───────────────────────────────────────────────────────────────

/**
 * Parse a CSV string into an array of DataRow objects.
 * Handles quoted fields, escaped quotes (""), and various line endings.
 */
export function parseCSV(content: string): DataFileResult {
  const errors: string[] = [];
  const lines = splitCSVLines(content);

  if (lines.length === 0) {
    return { rows: [], columns: [], format: 'csv', errors: ['Empty CSV file'] };
  }

  // Parse header row
  const columns = parseCSVRow(lines[0]);
  if (columns.length === 0) {
    return { rows: [], columns: [], format: 'csv', errors: ['No columns found in CSV header'] };
  }

  // Validate column names — must be non-empty and unique
  const seen = new Set<string>();
  for (let i = 0; i < columns.length; i++) {
    const col = columns[i].trim();
    if (!col) {
      columns[i] = `column_${i + 1}`;
      errors.push(`Column ${i + 1} has no name — renamed to "column_${i + 1}"`);
    } else {
      columns[i] = col;
    }
    if (seen.has(columns[i])) {
      columns[i] = `${columns[i]}_${i + 1}`;
      errors.push(`Duplicate column name — renamed to "${columns[i]}"`);
    }
    seen.add(columns[i]);
  }

  // Parse data rows
  const rows: DataRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue; // skip empty lines

    const values = parseCSVRow(line);
    const row: DataRow = {};

    for (let j = 0; j < columns.length; j++) {
      row[columns[j]] = j < values.length ? values[j] : '';
    }

    rows.push(row);
  }

  if (rows.length === 0) {
    errors.push('CSV file has headers but no data rows');
  }

  return { rows, columns, format: 'csv', errors };
}

/**
 * Split CSV content into logical lines (handling multi-line quoted fields).
 */
function splitCSVLines(content: string): string[] {
  const lines: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];

    if (ch === '"') {
      inQuotes = !inQuotes;
      current += ch;
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && content[i + 1] === '\n') i++; // skip CRLF pair
      lines.push(current);
      current = '';
    } else {
      current += ch;
    }
  }

  if (current) lines.push(current);
  return lines;
}

/**
 * Parse a single CSV row into an array of field values.
 */
function parseCSVRow(line: string): string[] {
  const fields: string[] = [];
  let i = 0;
  let field = '';
  let inQuotes = false;

  while (i < line.length) {
    const ch = line[i];

    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          // Escaped quote
          field += '"';
          i += 2;
          continue;
        }
        // End of quoted field
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
    } else {
      if (ch === '"') {
        inQuotes = true;
        i++;
      } else if (ch === ',') {
        fields.push(field);
        field = '';
        i++;
      } else {
        field += ch;
        i++;
      }
    }
  }

  fields.push(field);
  return fields;
}

// ── JSON Parser ──────────────────────────────────────────────────────────────

/**
 * Parse a JSON string containing an array of objects into DataRow[].
 */
export function parseJSONData(content: string): DataFileResult {
  const errors: string[] = [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return { rows: [], columns: [], format: 'json', errors: ['Invalid JSON format'] };
  }

  let items: unknown[];
  if (!Array.isArray(parsed)) {
    // If it's a single object, wrap in array
    if (parsed && typeof parsed === 'object') {
      items = [parsed];
    } else {
      return { rows: [], columns: [], format: 'json', errors: ['JSON must be an array of objects'] };
    }
  } else {
    items = parsed;
  }

  if (items.length === 0) {
    return { rows: [], columns: [], format: 'json', errors: ['JSON array is empty'] };
  }

  // Extract columns from all objects
  const columnSet = new Set<string>();
  for (const item of items) {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      Object.keys(item as Record<string, unknown>).forEach((k) => columnSet.add(k));
    } else {
      errors.push('Non-object element found in JSON array — skipped');
    }
  }

  const columns = Array.from(columnSet);
  if (columns.length === 0) {
    return { rows: [], columns: [], format: 'json', errors: ['No columns found in JSON data'] };
  }

  // Build rows
  const rows: DataRow[] = [];
  for (const item of items) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;

    const row: DataRow = {};
    const obj = item as Record<string, unknown>;

    for (const col of columns) {
      const val = obj[col];
      if (val === null || val === undefined) {
        row[col] = '';
      } else if (typeof val === 'object') {
        row[col] = JSON.stringify(val);
      } else {
        row[col] = String(val);
      }
    }

    rows.push(row);
  }

  return { rows, columns, format: 'json', errors };
}

// ── Auto-detect & parse ──────────────────────────────────────────────────────

/**
 * Auto-detect format (CSV vs JSON) and parse accordingly.
 */
export function parseDataFile(content: string, filename?: string): DataFileResult {
  const ext = filename?.split('.').pop()?.toLowerCase();

  // Extension-based detection
  if (ext === 'csv' || ext === 'tsv') {
    return parseCSV(content);
  }
  if (ext === 'json') {
    return parseJSONData(content);
  }

  // Content-based detection
  const trimmed = content.trim();
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    return parseJSONData(content);
  }

  // Default to CSV
  return parseCSV(content);
}

/**
 * Generate a preview string for data rows (for display).
 */
export function previewDataRows(result: DataFileResult, maxRows = 3): string {
  if (result.rows.length === 0) return 'No data';

  const lines: string[] = [];
  lines.push(`Columns: ${result.columns.join(', ')}`);
  lines.push(`Rows: ${result.rows.length}`);
  lines.push('');

  for (let i = 0; i < Math.min(maxRows, result.rows.length); i++) {
    const row = result.rows[i];
    const parts = result.columns.map((c) => `${c}=${row[c]}`);
    lines.push(`  Row ${i + 1}: ${parts.join(', ')}`);
  }

  if (result.rows.length > maxRows) {
    lines.push(`  ... and ${result.rows.length - maxRows} more`);
  }

  return lines.join('\n');
}
