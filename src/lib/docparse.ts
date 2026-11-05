/**
 * Client-side document → text extraction for the exam importer.
 * One entry point for every single-file type teachers have:
 *   .txt .md .markdown .csv .tsv  → read as text directly
 *   .pdf                          → pdf.js (CDN, ESM)
 *   .docx                         → mammoth browser build (CDN, UMD)
 *   .xlsx .xls .xlsm .ods         → SheetJS (CDN, UMD) — every sheet
 * Heavy parsers are loaded from CDN at runtime — keeps them out of the
 * server/edge bundle (pdfjs/xlsx pull node builtins when bundled).
 */

type Pending = Promise<unknown>;
const cache = new Map<string, Pending>();

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const el = document.createElement("script");
    el.src = src;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error(`Could not load parser (${src.split("/").pop()})`));
    document.head.appendChild(el);
  });
}

const PDFJS_URL = "https://unpkg.com/pdfjs-dist@4.7.76/legacy/build/pdf.min.mjs";
const PDFJS_WORKER_URL = "https://unpkg.com/pdfjs-dist@4.7.76/legacy/build/pdf.worker.min.mjs";

async function pdfjsLib(): Promise<{ getDocument: (src: { data: ArrayBuffer }) => { promise: Promise<PdfDoc> }; GlobalWorkerOptions: { workerSrc: string } }> {
  if (!cache.has("pdfjs")) {
    cache.set(
      "pdfjs",
      import(/* webpackIgnore: true */ PDFJS_URL).then(
        (m: unknown) => {
          const lib = m as { GlobalWorkerOptions: { workerSrc: string } };
          lib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
          return lib;
        }
      )
    );
  }
  return cache.get("pdfjs") as Promise<{ getDocument: (src: { data: ArrayBuffer }) => { promise: Promise<PdfDoc> }; GlobalWorkerOptions: { workerSrc: string } }>;
}

interface PdfDoc {
  numPages: number;
  getPage: (n: number) => Promise<{
    getTextContent: () => Promise<{ items: { str?: string; hasEOL?: boolean }[] }>;
  }>;
}

async function xlsxLib(): Promise<{ read: (data: ArrayBuffer, opts: Record<string, unknown>) => XlsxBook }> {
  if (!cache.has("xlsx")) {
    const w = window as unknown as Record<string, unknown>;
    cache.set(
      "xlsx",
      (w.XLSX
        ? Promise.resolve(w.XLSX)
        : loadScript("https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js").then(
            () => (window as unknown as Record<string, unknown>).XLSX
          ))
    );
  }
  return cache.get("xlsx") as Promise<{ read: (data: ArrayBuffer, opts: Record<string, unknown>) => XlsxBook }>;
}

interface XlsxBook {
  SheetNames: string[];
  Sheets: Record<string, Record<string, unknown> | undefined>;
}

async function mammothLib(): Promise<{ extractRawText: (input: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string; messages: unknown[] }> }> {
  if (!cache.has("mammoth")) {
    const w = window as unknown as Record<string, unknown>;
    cache.set(
      "mammoth",
      (w.mammoth
        ? Promise.resolve(w.mammoth)
        : loadScript("https://unpkg.com/mammoth@1.8.0/mammoth.browser.min.js").then(
            () => (window as unknown as Record<string, unknown>).mammoth
          ))
    );
  }
  return cache.get("mammoth") as Promise<{ extractRawText: (input: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string; messages: unknown[] }> }>;
}

export async function extractDocText(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  const ext = name.slice(name.lastIndexOf(".") + 1);

  if (ext === "pdf") return extractPdf(file);
  if (ext === "docx") return extractDocx(file);
  if (ext === "xlsx" || ext === "xls" || ext === "xlsm" || ext === "ods") return extractSheet(file);
  if (["txt", "md", "markdown", "csv", "tsv", "text", "log", "json"].includes(ext)) {
    return file.text();
  }
  // Unknown — try text first; the caller surfaces a clear error if it's binary.
  const text = await file.text();
  if (text.includes("\u0000")) {
    throw new Error(`Unsupported file type: .${ext}. Use txt, md, csv, pdf, docx or xlsx.`);
  }
  return text;
}

async function extractPdf(file: File): Promise<string> {
  const pdfjs = await pdfjsLib();
  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  let out = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    for (const item of content.items) {
      if (item.str) out += item.str + (item.hasEOL ? "\n" : " ");
    }
    out += "\n";
  }
  return out;
}

async function extractDocx(file: File): Promise<string> {
  const mammoth = await mammothLib();
  const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  return value;
}

async function extractSheet(file: File): Promise<string> {
  const XLSX = await xlsxLib();
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const chunks: string[] = [];
  let qn = 0;
  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) continue;
    const rows = sheetToRows(sheet);
    for (const row of rows) {
      const cells = row.map((c) => String(c ?? "").trim());
      if (cells.every((c) => !c)) continue;
      const first = cells[0];
      const rest = cells.slice(1).filter((c) => c !== "");
      // Row whose first cell is a question number → new question line.
      if (/^(?:Q(?:uestion)?\s*)?\d{1,3}[.)]?$/.test(first) && rest.length > 0) {
        qn += 1;
        chunks.push(`${qn}. ${rest.join(" ")}`);
        continue;
      }
      // Option rows like [A, "Paris"] or ["A)", "Paris"].
      const opt = first.match(/^\(?([A-Fa-f])\)?[).\]:]?$/);
      if (opt && rest.length > 0) {
        chunks.push(`${opt[1].toUpperCase()}) ${rest.join(" ")}`);
        continue;
      }
      // Answer/key rows.
      if (/^(?:answer|ans|key|correct)/i.test(first) && rest.length > 0) {
        chunks.push(`Answer: ${rest.join(" ")}`);
        continue;
      }
      // Anything else — emit as-is so the text parser can continue a prompt.
      chunks.push(cells.filter((c) => c !== "").join(" "));
    }
  }
  return chunks.join("\n");
}

/** Minimal A1-keyed sheet reader (avoids the utils bundle too). */
function sheetToRows(sheet: Record<string, unknown>): unknown[][] {
  const ref = String(sheet["!ref"] ?? "A1:A1");
  const m = ref.match(/^[A-Z]+(\d+):([A-Z]+)(\d+)$/);
  if (!m) return [];
  const startRow = parseInt(m[1], 10);
  const endRow = parseInt(m[3], 10);
  const colToNum = (s: string): number => {
    let n = 0;
    for (const ch of s) n = n * 26 + (ch.charCodeAt(0) - 64);
    return n;
  };
  const startCol = colToNum(ref.match(/^[A-Z]+/)![0]);
  const endCol = colToNum(m[2]);
  const rows: unknown[][] = [];
  for (let r = startRow; r <= endRow; r++) {
    const row: unknown[] = [];
    for (let c = startCol; c <= endCol; c++) {
      const key = `${colName(c)}${r}`;
      const cell = sheet[key] as { v?: unknown } | undefined;
      row.push(cell?.v ?? "");
    }
    rows.push(row);
  }
  return rows;
}

function colName(n: number): string {
  let s = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
