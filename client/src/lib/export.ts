// Corporate report exports (Dashen Bank / VTIRS).
//  - CSV: pure interchange data (BOM + formula-injection guard).
//  - XLSX: real Office Open XML with a corporate layout — title block, styled
//    header, freeze panes + print titles, auto-filter, fitted columns,
//    currency formatting and a totals row. No dependencies.
//  - PDF: branded print document with parameters, summary, sign-off block.
//
// The `build*` functions are pure (no DOM) so the output is unit-verifiable;
// the `export*` wrappers only handle the download/print side effects.

import { BRAND } from "@/lib/constants";

export interface ExportSummaryItem {
  label: string;
  value: string;
}

export interface ExportMeta {
  /** Human report title, e.g. "Vehicle Inventory". */
  title: string;
  /** Active filters/parameters, e.g. "Branch: HQ · Status: Active". Omit when unfiltered. */
  subtitle?: string;
  /** Full name of the user generating the export. */
  generatedBy?: string;
  /** Defaults to now. */
  generatedAt?: Date;
  /** KPI boxes rendered in PDF (and counted in subtitles). */
  summary?: ExportSummaryItem[];
  /** Header names rendered as ETB currency in Excel. */
  moneyColumns?: string[];
  /** Totals row appended after the body (PDF + Excel). */
  totals?: Record<string, string | number>;
}

// dashen-vtirs_vehicle-inventory_filtered_2026-09-03
export function reportFilename(title: string, scope?: string): string {
  const slug =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "report";
  const stamp = new Date().toISOString().slice(0, 10);
  return `dashen-vtirs_${slug}${scope ? `_${scope}` : ""}_${stamp}`;
}

function metaLine(meta: ExportMeta, rowCount: number): string {
  const stamp = (meta.generatedAt ?? new Date()).toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const parts = [
    meta.subtitle ? `Parameters: ${meta.subtitle}` : "Parameters: none (full dataset)",
    `Generated: ${stamp}${meta.generatedBy ? ` by ${meta.generatedBy}` : ""}`,
    `${rowCount} row${rowCount === 1 ? "" : "s"}`,
  ];
  return parts.join("  ·  ");
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ---------------------------------- CSV ---------------------------------- */

function csvCell(v: unknown): string {
  let s = v == null ? "" : String(v);
  // Formula-injection guard (OWASP): a cell starting with = + - @ (or tab/CR)
  // becomes a live formula when the CSV is opened in Excel. Prefixing with a
  // single quote forces text treatment — Excel hides the marker. The XLSX
  // path needs no guard (inlineStr cells are always strings) and neither
  // does the PDF path (HTML-escaped).
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function buildCsvText(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(",")];
  for (const r of rows) lines.push(headers.map((h) => csvCell(r[h])).join(","));
  return lines.join("\n");
}

export function exportCsv(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  // BOM so Windows Excel detects UTF-8 (Amharic names etc. mojibake otherwise).
  triggerDownload(new Blob(["\uFEFF" + buildCsvText(rows)], { type: "text/csv;charset=utf-8;" }), filename);
}

/* ----------------------------- XLSX (OOXML) ----------------------------- */

function escapeXml(v: unknown): string {
  return String(v ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c] as string)
  );
}

function colLetter(n: number): string {
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/*
 * Cell styles (cellXfs index):
 *   0 normal · 1 header (bold white on navy, centered) · 2 title (bold 14 navy)
 *   3 subtitle (10pt grey italic) · 4 money (ETB #,##0.00, right) ·
 *   5 totals row (bold + top border) · 6 totals money
 */
const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;ETB&quot; #,##0.00"/></numFmts><fonts count="5"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="14"/><color rgb="FF273274"/><name val="Calibri"/></font><font><i/><sz val="10"/><color rgb="FF6B7280"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF273274"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top style="thin"><color rgb="FF273274"/></top><bottom style="thin"><color rgb="FFD1D5DB"/></bottom></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="7"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"><alignment horizontal="right"/></xf><xf numFmtId="0" fontId="4" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1"/><xf numFmtId="164" fontId="4" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"><alignment horizontal="right"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

interface StyledCell {
  ref: string;
  style: number;
  value: string;
  numeric: boolean;
}

function styledCell(ref: string, style: number, value: unknown, numeric: boolean): StyledCell {
  return { ref, style, value: String(value ?? ""), numeric };
}

function cellXml(c: StyledCell): string {
  if (c.numeric) return `<c r="${c.ref}" s="${c.style}"><v>${c.value}</v></c>`;
  return `<c r="${c.ref}" s="${c.style}" t="inlineStr"><is><t>${escapeXml(c.value)}</t></is></c>`;
}

function sheetXml(
  headers: string[],
  body: Record<string, unknown>[],
  meta: ExportMeta,
  totals?: Record<string, string | number>
): string {
  const money = new Set(meta.moneyColumns ?? []);
  const lastCol = colLetter(headers.length);

  // Layout: R1 title (merged) · R2 subtitle (merged) · R3 styled header ·
  // R4+ body · optional totals row.
  const subtitle = metaLine(meta, body.length);
  const rowsXml: string[] = [];

  rowsXml.push(
    `<row r="1" ht="24" customHeight="1">${cellXml(styledCell("A1", 2, meta.title, false))}</row>`
  );
  rowsXml.push(
    `<row r="2" ht="15" customHeight="1">${cellXml(styledCell("A2", 3, subtitle, false))}</row>`
  );
  rowsXml.push(
    `<row r="3" ht="20" customHeight="1">${headers
      .map((h, i) => cellXml(styledCell(`${colLetter(i + 1)}3`, 1, h, false)))
      .join("")}</row>`
  );

  let rownum = 4;
  for (const r of body) {
    const cells = headers
      .map((h, i) => {
        const val = r[h];
        const isMoney = money.has(h);
        if (typeof val === "number" && Number.isFinite(val)) {
          return cellXml(styledCell(`${colLetter(i + 1)}${rownum}`, isMoney ? 4 : 0, val, true));
        }
        return cellXml(styledCell(`${colLetter(i + 1)}${rownum}`, 0, val, false));
      })
      .join("");
    rowsXml.push(`<row r="${rownum}">${cells}</row>`);
    rownum += 1;
  }

  if (totals) {
    const cells = headers
      .map((h, i) => {
        const val = totals[h] ?? "";
        const isMoney = money.has(h);
        if (typeof val === "number" && Number.isFinite(val)) {
          return cellXml(styledCell(`${colLetter(i + 1)}${rownum}`, isMoney ? 6 : 5, val, true));
        }
        const text = val === "" ? (i === 0 ? "TOTAL" : "") : val;
        return cellXml(styledCell(`${colLetter(i + 1)}${rownum}`, 5, text, false));
      })
      .join("");
    rowsXml.push(`<row r="${rownum}">${cells}</row>`);
  }

  // Fitted column widths from header + sampled body text (capped).
  const widths = headers.map((h) => {
    let max = h.length;
    for (let s = 0; s < Math.min(body.length, 200); s++) {
      const v = body[s][h];
      const len = v == null ? 0 : String(v).length;
      if (len > max) max = len;
    }
    if (money.has(h)) max = Math.max(max, 16);
    return Math.min(42, Math.max(12, max + 2));
  });
  const colsXml = `<cols>${widths
    .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
    .join("")}</cols>`;

  const merges =
    headers.length > 1
      ? `<mergeCells count="2"><mergeCell ref="A1:${lastCol}1"/><mergeCell ref="A2:${lastCol}2"/></mergeCells>`
      : "";

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="3" topLeftCell="A4" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A4" sqref="A4"/></sheetView></sheetViews>${colsXml}<sheetData>${rowsXml.join("")}</sheetData><autoFilter ref="A3:${lastCol}3"/>${merges}<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/><pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>`;
}

// Minimal store-only ZIP with CRC32 (no compression) — enough for .xlsx.
function crc32(buf: Uint8Array): number {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c >>> 0;
}

function makeZip(files: { name: string; data: string }[]): Blob {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const u16 = (n: number) => new Uint8Array([n & 0xff, (n >>> 8) & 0xff]);
  const u32 = (n: number) => new Uint8Array([n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]);

  for (const f of files) {
    const data = enc.encode(f.data);
    const crc = crc32(data);
    const nameBytes = enc.encode(f.name);
    const local = concat([
      u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(crc), u32(data.length), u32(data.length), u16(nameBytes.length), u16(0),
      nameBytes, data,
    ]);
    chunks.push(local);
    const centralRec = concat([
      u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(crc), u32(data.length), u32(data.length), u16(nameBytes.length), u16(0),
      u16(0), u16(0), u16(0), u32(0), u32(offset), nameBytes,
    ]);
    central.push(centralRec);
    offset += local.length;
  }

  const centralBuf = concat(central);
  const end = concat([
    u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
    u32(centralBuf.length), u32(offset), u16(0),
  ]);

  const all = concat([...chunks, centralBuf, end]);
  return new Blob([all as unknown as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

function concat(arrs: Uint8Array[]): Uint8Array {
  const len = arrs.reduce((a, b) => a + b.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const a of arrs) { out.set(a, o); o += a.length; }
  return out;
}

export function buildWorkbookFile(
  rows: Record<string, unknown>[],
  meta: ExportMeta
): { blob: Blob; sheetName: string } {
  const headers = rows.length ? Object.keys(rows[0]) : [];
  const sheet = sheetXml(headers, rows, meta, meta.totals);
  const files = [
    { name: "[Content_Types].xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>` },
    { name: "_rels/.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: "xl/workbook.xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Report" sheetId="1" r:id="rId1"/></sheets><definedNames><definedName name="_xlnm.Print_Titles" localSheetId="0">'Report'!$3:$3</definedName></definedNames></workbook>` },
    { name: "xl/_rels/workbook.xml.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: "xl/worksheets/sheet1.xml", data: sheet },
    { name: "xl/styles.xml", data: STYLES_XML },
  ];
  return { blob: makeZip(files), sheetName: "Report" };
}

export function exportXlsx(filename: string, rows: Record<string, unknown>[], meta?: ExportMeta) {
  if (!rows.length) return;
  const resolved: ExportMeta = { title: filename.replace(/\.xlsx$/i, ""), ...(meta ?? {}) };
  const { blob } = buildWorkbookFile(rows, resolved);
  triggerDownload(blob, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`);
}

/* ------------------------------- PDF print ------------------------------- */

function escapeHtml(v: unknown): string {
  return String(v ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string)
  );
}

export interface PdfMeta {
  subtitle?: string;
  summary?: ExportSummaryItem[];
  generatedBy?: string;
  rowCount?: number;
}

export function buildPdfHtml(
  tableHtml: string,
  title: string,
  orgName: string | undefined,
  meta: PdfMeta = {}
): string {
  const base = typeof window !== "undefined" ? window.location.origin : "";
  const stamp = new Date().toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
  const company = orgName || BRAND.name;
  const summary = meta.summary?.length
    ? `<div class="summary">${meta.summary
        .map((s) => `<div class="stat"><div class="stat-label">${escapeHtml(s.label)}</div><div class="stat-value">${escapeHtml(s.value)}</div></div>`)
        .join("")}</div>`
    : "";
  const contextLine = [
    meta.subtitle ? `Parameters: ${escapeHtml(meta.subtitle)}` : "Parameters: none (full dataset)",
    `Generated: ${stamp}${meta.generatedBy ? ` by ${escapeHtml(meta.generatedBy)}` : ""}${
      meta.rowCount !== undefined ? ` · ${meta.rowCount} row${meta.rowCount === 1 ? "" : "s"}` : ""
    }`,
  ].join("<br/>");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
    @page { size: A4 landscape; margin: 14mm; }
    @media print { .noprint { display: none !important; } }
    * { box-sizing: border-box; }
    body { font-family: "Helvetica Neue", Arial, sans-serif; color: #1f2937; margin: 0; font-size: 11px; }
    .brand { display: flex; align-items: center; justify-content: space-between; border-bottom: 3px solid #273274; padding-bottom: 8px; margin-bottom: 12px; }
    .brand .left { display: flex; align-items: center; gap: 12px; }
    .brand .left img { height: 36px; width: auto; }
    .brand h1 { font-size: 15px; margin: 0; color: #273274; line-height: 1.2; }
    .brand .motto { font-size: 10px; color: #e8941a; font-style: italic; letter-spacing: 0.3px; }
    .brand .sub { font-size: 9px; color: #6b7280; }
    .meta { text-align: right; font-size: 9px; color: #6b7280; line-height: 1.5; }
    .report-title { font-size: 13px; font-weight: 700; margin: 0 0 8px; color: #012169; padding-left: 4px; border-left: 3px solid #e8941a; }
    .context { font-size: 9px; color: #4b5563; background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 6px; padding: 6px 8px; margin-bottom: 10px; line-height: 1.6; }
    .context .k { font-weight: 700; color: #273274; }
    .summary { display: flex; gap: 8px; margin-bottom: 12px; }
    .summary .stat { flex: 1; border: 1px solid #e5e7eb; border-radius: 6px; padding: 6px 10px; background: #f8fafc; }
    .summary .stat-label { font-size: 8px; text-transform: uppercase; letter-spacing: 0.4px; color: #6b7280; }
    .summary .stat-value { font-size: 14px; font-weight: 700; color: #012169; }
    table { width: 100%; border-collapse: collapse; font-size: 9px; }
    thead th { background: #273274; color: #fff; text-align: left; padding: 5px 6px; font-size: 9px; letter-spacing: 0.3px; }
    tbody td { border: 1px solid #e5e7eb; padding: 4px 6px; }
    tbody tr:nth-child(even) td { background: #f9fafb; }
    tfoot td { border-top: 2px solid #273274; font-weight: 700; padding: 4px 6px; }
    .sign { display: flex; gap: 24px; margin-top: 28px; page-break-inside: avoid; }
    .sign div { flex: 1; border-top: 1px solid #6b7280; padding-top: 4px; font-size: 9px; color: #4b5563; }
    .foot { margin-top: 12px; border-top: 1px solid #e5e7eb; padding-top: 6px; font-size: 8px; color: #9ca3af; display: flex; justify-content: space-between; }
    .page-break { page-break-before: always; }
  </style></head><body>
    <div class="brand">
      <div class="left"><img src="${base}/dashen-logo.svg" alt="${company}"><div><h1>${company}</h1><div class="motto">Always One Step Ahead</div><div class="sub">${BRAND.system}</div></div></div>
      <div class="meta">Generated: ${stamp}<br/>Confidential — Internal Use</div>
    </div>
    <div class="report-title">${escapeHtml(title)}</div>
    <div class="context"><span class="k">Report context — </span>${contextLine}</div>
    ${summary}
    ${tableHtml}
    <div class="sign"><div>Prepared by<br/><br/>Name / Signature / Date</div><div>Reviewed by<br/><br/>Name / Signature / Date</div><div>Approved by<br/><br/>Name / Signature / Date</div></div>
    <div class="foot"><span>&copy; ${new Date().getFullYear()} ${company} — ${BRAND.short}</span></div>
  </body></html>`;
}

export function exportPdf(html: string, title: string, orgName?: string, meta?: PdfMeta) {
  const doc = buildPdfHtml(html, title, orgName, meta);
  // Use a hidden iframe instead of window.open so we don't open a new tab.
  const iframe = document.createElement("iframe");
  iframe.className = "noprint";
  iframe.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;opacity:0";
  document.body.appendChild(iframe);
  const cleanup = () => {
    if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
  };
  const fDoc = iframe.contentWindow?.document;
  if (!fDoc) { cleanup(); return; }
  fDoc.open();
  fDoc.write(doc);
  fDoc.close();
  try {
    // afterprint fires when the print dialog closes — the normal cleanup path.
    iframe.contentWindow?.addEventListener("afterprint", cleanup);
  } catch { /* cross-browser safety */ }
  // Fallback: never leak the node if afterprint doesn't fire.
  setTimeout(cleanup, 60000);
  setTimeout(() => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
  }, 500);
}

export function rowsToHtmlTable(_title: string, rows: Record<string, unknown>[], totals?: Record<string, string | number>): string {
  if (!rows.length) return `<p>No data available for the selected filters.</p>`;
  const headers = Object.keys(rows[0]);
  const head = headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("");
  const body = rows.map((r) => `<tr>${headers.map((h) => `<td>${escapeHtml(r[h])}</td>`).join("")}</tr>`).join("");
  const foot = totals
    ? `<tfoot><tr>${headers.map((h) => `<td>${escapeHtml(totals[h] ?? "")}</td>`).join("")}</tr></tfoot>`
    : "";
  return `<table><thead><tr>${head}</tr></thead>${body ? `<tbody>${body}</tbody>` : ""}${foot}</table>`;
}
