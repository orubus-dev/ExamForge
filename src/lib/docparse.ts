/**
 * Client-side document → text extraction for the exam importer.
 * One entry point for every single-file type teachers have:
 *   .txt .md .markdown .csv .tsv  → read as text directly
 *   .pdf                          → pdf.js text layer
 *   .docx                         → mammoth (Word)
 *   .xlsx .xls .xlsm .ods         → SheetJS (Excel) — every sheet, cell grid
 * Returns plain text shaped for parseQuestionsFromText().
 */

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
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc =
    "https://unpkg.com/pdfjs-dist@4.7.76/build/pdf.worker.min.mjs";
  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  let out = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    for (const item of content.items) {
      if ("str" in item) out += item.str + (item.hasEOL ? "\n" : " ");
    }
    out += "\n";
  }
  return out;
}

async function extractDocx(file: File): Promise<string> {
  const mammoth = await import("mammoth");
  const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  return value;
}

async function extractSheet(file: File): Promise<string> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const chunks: string[] = [];
  let qn = 0;
  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) continue;
    // Header row option keeps A/B/C option letters intact.
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, defval: "" });
    for (const row of rows) {
      const cells = (row as unknown[]).map((c) => String(c ?? "").trim());
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
