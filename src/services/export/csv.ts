// Minimal RFC 4180 CSV encoding — pure, no I/O, so the escaping rules are
// unit-testable in isolation from the streaming/file-writing concerns in
// exportCsv.ts. See docs/07-architecture.md "Export".

/** Escapes one field per RFC 4180: quote if it contains a comma, quote, or newline; double any embedded quotes. */
export function csvField(value: string | number | null): string {
  if (value === null) return ''
  const str = String(value)
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export function csvRow(fields: (string | number | null)[]): string {
  return fields.map(csvField).join(',') + '\r\n'
}
