/**
 * Streaming CSV parser, RFC 4180-ish.
 *
 * Supports:
 *  - quoted fields with embedded commas, quotes ("" → "), and newlines
 *  - LF, CRLF, CR line endings
 *  - delimiter override (default `,`)
 *  - first row as headers
 *
 * Returns an async iterator that yields { lineNumber, values } where
 * `lineNumber` is the 1-based input line of the first character of the row.
 */

export interface CsvOptions {
  delimiter?: string;        // default ","
  headerRow?: boolean;       // default true
}

export interface CsvRowRaw {
  /** 1-based line of the start of the row (useful for error messages). */
  line: number;
  /** Raw fields, header-keyed if headerRow=true; otherwise positional via __0, __1, … */
  values: Record<string, string>;
}

/**
 * Parse a string body. For very large files the caller should pre-stream
 * the file via FileReader / ReadableStream then assemble into chunks before
 * calling — the v0.7 ImportPanel does this.
 */
export async function* parseCsvString(
  text: string,
  opts: CsvOptions = {},
): AsyncGenerator<CsvRowRaw, void, void> {
  const delim = opts.delimiter ?? ",";
  const useHeader = opts.headerRow ?? true;
  const rows = lex(text, delim);
  let header: string[] | null = null;
  for (const { line, fields } of rows) {
    if (useHeader && !header) {
      header = fields;
      continue;
    }
    const out: Record<string, string> = {};
    for (let i = 0; i < fields.length; i++) {
      const key = header?.[i] ?? `__${i}`;
      out[key] = fields[i]!;
    }
    yield { line, values: out };
  }
}

interface LexedRow {
  line: number;
  fields: string[];
}

function lex(text: string, delim: string): LexedRow[] {
  const out: LexedRow[] = [];
  let i = 0;
  let line = 1;
  while (i < text.length) {
    const start = line;
    const { row, advanced, lines } = lexRow(text, i, delim);
    line += lines;
    i += advanced;
    if (row.length === 1 && row[0] === "") continue; // skip blank lines
    out.push({ line: start, fields: row });
  }
  return out;
}

function lexRow(text: string, start: number, delim: string): { row: string[]; advanced: number; lines: number } {
  const row: string[] = [];
  let i = start;
  let field = "";
  let lines = 0;
  let inQuotes = false;

  while (i < text.length) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      if (ch === "\n") lines++;
      if (ch === "\r" && text[i + 1] === "\n") {
        // CRLF inside quoted field — preserve as LF.
        field += "\n";
        lines++;
        i += 2;
        continue;
      }
      if (ch === "\r") {
        field += "\n";
        lines++;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }

    if (ch === '"' && field === "") {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === delim) {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (ch === "\r" && text[i + 1] === "\n") {
      row.push(field);
      return { row, advanced: i + 2 - start, lines: lines + 1 };
    }
    if (ch === "\n" || ch === "\r") {
      row.push(field);
      return { row, advanced: i + 1 - start, lines: lines + 1 };
    }
    field += ch;
    i++;
  }
  // EOF without trailing newline
  row.push(field);
  return { row, advanced: i - start, lines };
}
