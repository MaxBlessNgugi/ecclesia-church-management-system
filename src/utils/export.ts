// =============================================================================
// Client-side export helpers (dependency-free)
// -----------------------------------------------------------------------------
// Generates downloadable CSV and Excel (SpreadsheetML 2003 XML) files straight
// from in-memory row arrays, so report panels can offer real exports without a
// backend round trip or an extra library. Column definitions pair a header
// label with a value getter so the caller controls exactly what is exported.
//
//   exportCsv('sacraments', cols, rows)   -> UTF-8 CSV (with BOM for Excel)
//   exportExcel('sacraments', cols, rows) -> .xls SpreadsheetML XML
// =============================================================================

/** Column definition for an export: a header label plus a value extractor. */
export interface ExportColumn<T> {
  label: string;
  value: (row: T) => string | number | null | undefined;
}

/**
 * Triggers a browser download of a Blob-backed text file. The anchor is
 * appended to the document so the click registers, then removed; the object URL
 * is revoked after the download starts.
 */
function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * CSV field escaping: values containing a comma, quote or line break are
 * wrapped in double quotes with embedded quotes doubled per RFC 4180.
 */
function csvEscape(value: string | number | null | undefined): string {
  const s = value == null ? '' : String(value);
  if (/[",\n\r]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

/**
 * Builds a CSV (header + data rows) from a column list and downloads it. A UTF-8
 * BOM is prepended so Microsoft Excel renders non-ASCII content correctly.
 */
export function exportCsv<T>(filename: string, columns: ExportColumn<T>[], rows: T[]): void {
  const lines = [
    columns.map((c) => csvEscape(c.label)).join(','),
    ...rows.map((r) => columns.map((c) => csvEscape(c.value(r))).join(','))
  ];
  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(filename.endsWith('.csv') ? filename : `${filename}.csv`, blob);
}

/** XML-escapes a cell value for the SpreadsheetML document. */
function xmlEscape(value: string | number | null | undefined): string {
  const s = value == null ? '' : String(value);
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Builds a SpreadsheetML 2003 XML workbook (opened natively by Excel) and
 * downloads it as an .xls file. Numbers are typed so Excel keeps them numeric;
 * everything else is a string cell.
 */
export function exportExcel<T>(filename: string, columns: ExportColumn<T>[], rows: T[]): void {
  const sheet = [
    '<?xml version="1.0"?>',
    '<?mso-application progid="Excel.Sheet"?>',
    '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">',
    '<Worksheet ss:Name="Report">',
    '<Table>',
    '<Row>',
    ...columns.map((c) => `<Cell><Data ss:Type="String">${xmlEscape(c.label)}</Data></Cell>`),
    '</Row>',
    ...rows.map(
      (r) =>
        '<Row>' +
        columns
          .map((c) => {
            const raw = c.value(r);
            const isNumber = typeof raw === 'number' && Number.isFinite(raw);
            return `<Cell><Data ss:Type="${isNumber ? 'Number' : 'String'}">${xmlEscape(raw)}</Data></Cell>`;
          })
          .join('') +
        '</Row>'
    ),
    '</Table>',
    '</Worksheet>',
    '</Workbook>'
  ].join('');
  const blob = new Blob([sheet], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  downloadBlob(filename.endsWith('.xls') ? filename : `${filename}.xls`, blob);
}
