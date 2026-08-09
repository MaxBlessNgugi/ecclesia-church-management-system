// =============================================================================
// Client-side export helpers (dependency-free)
// =============================================================================
//
// PURPOSE
//   Generates downloadable CSV, Excel (SpreadsheetML 2003 XML), and PDF (via
//   browser print) files straight from in-memory row arrays, so report panels
//   can offer real exports without a backend round trip or an extra library.
//
// AVAILABLE FUNCTIONS
//   exportCsv<T>(filename, columns, rows)   → UTF-8 CSV (with BOM for Excel)
//   exportExcel<T>(filename, columns, rows) → .xls SpreadsheetML XML
//   exportPdf<T>(filename, title, columns, rows) → Print-to-PDF via browser
//
// COLUMN DEFINITION
//   Each export function accepts an array of `ExportColumn<T>` objects. A column
//   pairs a human-readable `label` (used as the CSV/Excel header) with a `value`
//   extractor function that pulls the desired field from each data row. This
//   gives the caller full control over which fields appear and in what order.
//
// ARCHITECTURE
//   ┌──────────────────────────────────────────────────────────────────────┐
//   │ downloadBlob(filename, blob)     — Internal: triggers browser download│
//   │ csvEscape(value)                 — Internal: RFC 4180 CSV escaping   │
//   │ xmlEscape(value)                 — Internal: XML entity escaping     │
//   │                                                                      │
//   │ exportCsv(filename, cols, rows)  — Public: builds CSV and downloads  │
//   │ exportExcel(filename, cols, rows)— Public: builds .xls and downloads │
//   │ exportPdf(filename, title, cols, rows) — Public: print dialog PDF   │
//   └──────────────────────────────────────────────────────────────────────┘
//
// DEPENDENCY NOTES
//   This module uses zero external libraries. All file generation is done via
//   string concatenation and Blob creation — lightweight enough for any bundle.
//
// RELATED FILES
//   - src/services/api.ts              → Backend data fetching (feeds rows here)
//   - src/views/Reports/*.tsx          → Consumers that call these export fns
// =============================================================================

/**
 * Column definition for an export: a header label plus a value extractor.
 *
 * @typeParam T - The type of each row in the data array.
 */
export interface ExportColumn<T> {
  /** Human-readable header label shown in the CSV/Excel/PDF first row. */
  label: string;

  /**
   * Extracts the value for this column from a single data row.
   *
   * @param row - The current row being processed.
   * @returns The cell value as a string, number, null, or undefined.
   */
  value: (row: T) => string | number | null | undefined;
}

/**
 * Triggers a browser download of a Blob-backed text file.
 *
 * Algorithm:
 *   1. Create an object URL from the Blob.
 *   2. Create a hidden `<a>` element, set its `href` and `download` attributes.
 *   3. Append the anchor to the document body (required for the click to register).
 *   4. Programmatically click it to initiate the download.
 *   5. Remove the anchor from the DOM.
 *   6. Revoke the object URL to free memory.
 *
 * @param filename - Suggested filename for the download (e.g. `"report.csv"`).
 * @param blob     - The Blob containing the file content.
 */
function downloadBlob(filename: string, blob: Blob): void {
  // Step 1: Create a temporary URL that points to the in-memory Blob.
  const url = URL.createObjectURL(blob);

  // Step 2: Create an invisible anchor element for the download trigger.
  const a = document.createElement('a');
  a.href = url;
  // The `download` attribute tells the browser to save rather than navigate.
  a.download = filename;

  // Step 3 & 4: Attach to the DOM (click won't fire on detached elements) and click.
  document.body.appendChild(a);
  a.click();

  // Step 5: Clean up the DOM — the anchor is no longer needed.
  document.body.removeChild(a);

  // Step 6: Release the object URL so the browser can reclaim the memory.
  URL.revokeObjectURL(url);
}

/**
 * CSV field escaping per RFC 4180.
 *
 * Algorithm:
 *   1. Convert `null`/`undefined` to an empty string; coerce everything else
 *      to a string via `String()`.
 *   2. If the string contains a comma, double-quote, or line break, wrap it
 *      in double quotes and double any embedded double-quotes (`"` → `""`).
 *   3. Otherwise return the string unquoted.
 *
 * @param value - The cell value to escape (may be null/undefined).
 * @returns The escaped string safe for CSV embedding.
 */
function csvEscape(value: string | number | null | undefined): string {
  // Null / undefined become empty cells; numbers become their string form.
  const s = value == null ? '' : String(value);

  // Check if the value contains characters that require CSV quoting.
  if (/[",\n\r]/.test(s)) {
    // Wrap in double quotes and escape any internal quotes by doubling them.
    return '"' + s.replace(/"/g, '""') + '"';
  }

  // No special characters — return as-is (no quoting needed).
  return s;
}

/**
 * Builds a complete CSV file (header row + data rows) and triggers a download.
 *
 * Algorithm:
 *   1. Map each column label through `csvEscape` and join with commas → header row.
 *   2. For each data row, extract each column's value via `c.value(r)`, escape
 *      it with `csvEscape`, and join with commas → data row.
 *   3. Combine all rows with `\r\n` line breaks (CRLF per CSV spec).
 *   4. Prepend a UTF-8 BOM (`\uFEFF`) so Microsoft Excel renders non-ASCII
 *      characters (e.g. accented names) correctly.
 *   5. Wrap in a Blob with `text/csv;charset=utf-8` MIME type.
 *   6. Ensure the filename ends with `.csv` before passing to `downloadBlob`.
 *
 * @typeParam T - The type of each row in the data array.
 * @param filename - Desired filename (`.csv` is appended if missing).
 * @param columns  - Column definitions controlling headers and value extraction.
 * @param rows     - The data array to export.
 */
export function exportCsv<T>(filename: string, columns: ExportColumn<T>[], rows: T[]): void {
  // Step 1 & 2: Build the header row from column labels, then map each data
  // row through the column extractors and escape function.
  const lines = [
    // Header row: each column label escaped and comma-joined.
    columns.map((c) => csvEscape(c.label)).join(','),
    // Data rows: for each row, extract and escape each column value.
    ...rows.map((r) => columns.map((c) => csvEscape(c.value(r))).join(','))
  ];

  // Step 3 & 4: Join rows with CRLF and prepend the UTF-8 BOM for Excel compat.
  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });

  // Step 6: Ensure the filename has a `.csv` extension.
  downloadBlob(filename.endsWith('.csv') ? filename : `${filename}.csv`, blob);
}

/**
 * XML-escapes a cell value for embedding in a SpreadsheetML document.
 *
 * Algorithm:
 *   1. Convert `null`/`undefined` to an empty string; coerce to string.
 *   2. Replace the four XML-significant characters (`&`, `<`, `>`, `"`)
 *      with their corresponding entity references.
 *
 * @param value - The cell value to escape (may be null/undefined).
 * @returns The XML-safe string.
 */
function xmlEscape(value: string | number | null | undefined): string {
  // Null / undefined → empty string; numbers → string form.
  const s = value == null ? '' : String(value);

  // Order matters: `&` must be escaped first to avoid double-escaping.
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Builds a SpreadsheetML 2003 XML workbook and triggers a download as `.xls`.
 *
 * The generated XML uses the Microsoft Office SpreadsheetML namespace, which
 * Excel (and most compatible spreadsheet apps) open natively. Number cells
 * use `ss:Type="Number"` so Excel keeps them numeric rather than treating
 * them as text.
 *
 * Algorithm:
 *   1. Build the XML header (declaration, mso-application PI, Workbook root).
 *   2. Open a Worksheet named "Report" and a Table.
 *   3. Write the header row: each column label → `<Cell><Data ss:Type="String">`.
 *   4. For each data row, extract each column's value:
 *      a. If the value is a finite number → `ss:Type="Number"`.
 *      b. Otherwise → `ss:Type="String"`.
 *   5. Close the Table, Worksheet, and Workbook elements.
 *   6. Wrap in a Blob with `application/vnd.ms-excel;charset=utf-8` MIME type.
 *   7. Ensure the filename ends with `.xls` before passing to `downloadBlob`.
 *
 * @typeParam T - The type of each row in the data array.
 * @param filename - Desired filename (`.xls` is appended if missing).
 * @param columns  - Column definitions controlling headers and value extraction.
 * @param rows     - The data array to export.
 */
export function exportExcel<T>(filename: string, columns: ExportColumn<T>[], rows: T[]): void {
  // Build the entire SpreadsheetML XML document as a single string array,
  // then join for maximum performance (avoids repeated string concatenation).
  const sheet = [
    // XML declaration and Microsoft Office application identifier.
    '<?xml version="1.0"?>',
    '<?mso-application progid="Excel.Sheet"?>',
    // Workbook root element with the SpreadsheetML namespace.
    '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">',
    // Single worksheet named "Report".
    '<Worksheet ss:Name="Report">',
    '<Table>',

    // --- Header row ---
    '<Row>',
    ...columns.map((c) => `<Cell><Data ss:Type="String">${xmlEscape(c.label)}</Data></Cell>`),
    '</Row>',

    // --- Data rows ---
    ...rows.map(
      (r) =>
        '<Row>' +
        columns
          .map((c) => {
            // Extract the raw value from the data row.
            const raw = c.value(r);
            // Determine if the value is a finite number — if so, type
            // the cell as Number so Excel preserves numeric formatting.
            const isNumber = typeof raw === 'number' && Number.isFinite(raw);
            return `<Cell><Data ss:Type="${isNumber ? 'Number' : 'String'}">${xmlEscape(raw)}</Data></Cell>`;
          })
          .join('') +
        '</Row>'
    ),

    // Close the Table, Worksheet, and Workbook elements.
    '</Table>',
    '</Worksheet>',
    '</Workbook>'
  ].join('');

  // Wrap in a Blob with the Excel MIME type.
  const blob = new Blob([sheet], { type: 'application/vnd.ms-excel;charset=utf-8;' });

  // Ensure the filename has an `.xls` extension.
  downloadBlob(filename.endsWith('.xls') ? filename : `${filename}.xls`, blob);
}

/**
 * PDF export via the browser's native "Print to PDF" — zero extra dependencies.
 *
 * Opens a clean, print-optimized popup window containing a styled HTML table
 * (header + data rows), then triggers the browser's print dialog. The user
 * selects "Save as PDF" in the print destination. The window closes itself
 * after the print dialog completes (or is cancelled).
 *
 * Algorithm:
 *   1. Build the HTML table header cells from column labels.
 *   2. For each data row, build `<td>` elements by extracting column values.
 *   3. Assemble a full HTML document with:
 *      - A `<meta charset>` tag for proper encoding.
 *      - A `<title>` (also used as the suggested PDF filename).
 *      - Inline CSS for print-optimized styling (serif font, borders, zebra striping).
 *      - The styled table with a title heading and a metadata line (date + row count).
 *   4. Open a new browser window (`window.open`) with fixed dimensions.
 *   5. Write the HTML into the new window and close the document for rendering.
 *   6. After a 350ms delay (to allow font/layout rendering), call `win.print()`.
 *   7. Close the popup window.
 *
 * @typeParam T - The type of each row in the data array.
 * @param filename - Suggested filename (displayed in the browser's save dialog).
 * @param title    - Heading text shown at the top of the printed report.
 * @param columns  - Column definitions controlling headers and value extraction.
 * @param rows     - The data array to export.
 */
export function exportPdf<T>(filename: string, title: string, columns: ExportColumn<T>[], rows: T[]): void {
  // Step 1: Build header cells from column labels, XML-escaped for safe embedding.
  const headerCells = columns.map((c) => `<th>${xmlEscape(c.label)}</th>`).join('');

  // Step 2: Build data rows — each row maps columns to <td> elements.
  const bodyRows = rows
    .map(
      (r) =>
        `<tr>${columns.map((c) => `<td>${xmlEscape(c.value(r))}</td>`).join('')}</tr>`
    )
    .join('');

  // Step 3: Assemble the full HTML document with inline CSS for print styling.
  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${xmlEscape(filename)}</title>
    <style>
      /* Box-sizing reset for predictable layout. */
      * { box-sizing: border-box; }
      /* Serif font for a formal report appearance; generous margins. */
      body { font-family: Georgia, 'Times New Roman', serif; color: #1a1c1c; margin: 32px; }
      /* Report title — compact, prominent. */
      h1 { font-size: 20px; margin: 0 0 4px; }
      /* Metadata line (date, row count) — small and muted. */
      .meta { font-size: 11px; color: #555; margin-bottom: 20px; }
      /* Full-width table with collapsed borders. */
      table { width: 100%; border-collapse: collapse; font-size: 12px; }
      th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; }
      /* Header row: bold, uppercase, slightly smaller. */
      th { background: #f0efef; font-weight: bold; text-transform: uppercase; font-size: 10px; letter-spacing: 0.05em; }
      /* Zebra striping for readability in long tables. */
      tr:nth-child(even) td { background: #fafafa; }
      /* Tighter margins when actually printing. */
      @media print { body { margin: 12mm; } }
    </style>
  </head>
  <body>
    <h1>${xmlEscape(title)}</h1>
    <div class="meta">Generated ${xmlEscape(new Date().toLocaleString())} &middot; ${rows.length} record(s)</div>
    <table><thead><tr>${headerCells}</tr></thead><tbody>${bodyRows || '<tr><td colspan="' + columns.length + '" style="text-align:center;color:#888">No records yet.</td></tr>'}</tbody></table>
  </body>
</html>`;

  // Step 4: Open a new popup window for the print preview.
  const win = window.open('', '_blank', 'width=900,height=700');

  // Guard: popup blockers may prevent the window from opening.
  if (!win) {
    alert('Please allow pop-ups so the report can be printed to PDF.');
    return;
  }

  // Step 5: Write the HTML document into the new window.
  win.document.write(html);
  // Signal that writing is complete so the browser can begin rendering.
  win.document.close();
  // Bring the window to the foreground so the user sees the print dialog.
  win.focus();

  // Step 6 & 7: Wait 350ms for fonts and layout to settle, then open the
  // print dialog and close the window when done (whether the user prints
  // or cancels).
  setTimeout(() => {
    win.print();
    win.close();
  }, 350);
}
