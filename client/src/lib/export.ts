// Zero-dependency export helpers.
//  - CSV: text/csv
//  - XLSX: real Office Open XML (.xlsx) wrapped in a store-only ZIP (CRC32, no deps)
//  - PDF: branded print window (Dashen header, totals, page breaks)

import { BRAND } from "@/lib/constants";

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

function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function exportCsv(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(",")];
  for (const r of rows) lines.push(headers.map((h) => csvCell(r[h])).join(","));
  triggerDownload(new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" }), filename);
}

/* ----------------------------- XLSX (OOXML) ----------------------------- */

function escapeXml(v: unknown): string {
  return String(v ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c] as string)
  );
}

function sheetXml(rows: Record<string, unknown>[]): string {
  const headers = rows.length ? Object.keys(rows[0]) : [];
  const cols = headers
    .map((_, i) => `<c r="${colLetter(i + 1)}1" t="inlineStr"><is><t>${escapeXml(headers[i])}</t></is></c>`)
    .join("");
  const body = rows
    .map((r, ri) => {
      const rownum = ri + 2;
      const cells = headers
        .map((h, ci) => {
          const val = r[h];
          const ref = `${colLetter(ci + 1)}${rownum}`;
          if (typeof val === "number") return `<c r="${ref}"><v>${val}</v></c>`;
          return `<c r="${ref}" t="inlineStr"><is><t>${escapeXml(val)}</t></is></c>`;
        })
        .join("");
      return `<row r="${rownum}">${cells}</row>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1">${cols}</row>${body}</sheetData></worksheet>`;
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

export function exportXlsx(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const sheet = sheetXml(rows);
  const files = [
    { name: "[Content_Types].xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>` },
    { name: "_rels/.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: "xl/workbook.xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheets><sheet name="Report" sheetId="1" r:id="rId1" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/></sheets></workbook>` },
    { name: "xl/_rels/workbook.xml.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>` },
    { name: "xl/worksheets/sheet1.xml", data: sheet },
  ];
  triggerDownload(makeZip(files), filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`);
}

/* ------------------------------- PDF print ------------------------------- */

export function exportPdf(html: string, title: string) {
  const w = window.open("", "_blank", "width=960,height=720");
  if (!w) return;
  const stamp = new Date().toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
  w.document.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
      @page { size: A4; margin: 16mm; }
      * { box-sizing: border-box; }
      body { font-family: "Helvetica Neue", Arial, sans-serif; color: #1f2937; margin: 0; font-size: 11px; }
      .brand { display: flex; align-items: center; justify-content: space-between; border-bottom: 3px solid #273274; padding-bottom: 10px; margin-bottom: 14px; }
      .brand .left { display: flex; align-items: center; gap: 10px; }
      .logo { width: 38px; height: 38px; border-radius: 8px; background: #273274; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 18px; }
      .brand h1 { font-size: 16px; margin: 0; color: #273274; }
      .brand .sub { font-size: 10px; color: #6b7280; }
      .meta { text-align: right; font-size: 10px; color: #6b7280; }
      .report-title { font-size: 14px; font-weight: 700; margin: 0 0 10px; }
      table { width: 100%; border-collapse: collapse; font-size: 10px; }
      thead th { background: #273274; color: #fff; text-align: left; padding: 6px 8px; }
      tbody td { border: 1px solid #e5e7eb; padding: 5px 8px; }
      tbody tr:nth-child(even) td { background: #f9fafb; }
      tfoot td { border-top: 2px solid #273274; font-weight: 700; padding: 6px 8px; }
      .foot { margin-top: 16px; border-top: 1px solid #e5e7eb; padding-top: 8px; font-size: 9px; color: #9ca3af; display: flex; justify-content: space-between; }
      .page-break { page-break-before: always; }
    </style></head><body>
      <div class="brand">
        <div class="left"><div class="logo">D</div><div><h1>${BRAND.name}</h1><div class="sub">${BRAND.system}</div></div></div>
        <div class="meta">Generated: ${stamp}<br/>Confidential — Internal Use</div>
      </div>
      <div class="report-title">${escapeHtml(title)}</div>
      ${html}
      <div class="foot"><span>${BRAND.short} • ${BRAND.name}</span><span>Page <span class="pageNumber"></span></span></div>
      <script>window.onload = () => { document.querySelectorAll('.pageNumber').forEach(e=>e.textContent='1'); setTimeout(()=>window.print(), 350); };</script>
    </body></html>`
  );
  w.document.close();
  w.focus();
}

function escapeHtml(v: unknown): string {
  return String(v ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string)
  );
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
