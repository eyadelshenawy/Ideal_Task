// Reads the first sheet of an uploaded .xlsx or .csv into one object per row,
// keyed by the header row — the shape /api/import/preview expects.

type Row = Record<string, string | number>;

function dateToStr(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function cellToValue(v: unknown): string | number {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return dateToStr(v);
  if (typeof v === "number" || typeof v === "string") return v;
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "object") {
    const o = v as { text?: unknown; result?: unknown; richText?: { text: string }[]; hyperlink?: string };
    if (Array.isArray(o.richText)) return o.richText.map((r) => r.text).join("");
    if (o.result !== undefined) return cellToValue(o.result);
    if (o.text !== undefined) return cellToValue(o.text);
  }
  return String(v);
}

function rowsFromGrid(grid: (string | number)[][]): Row[] {
  const [header, ...body] = grid;
  if (!header) return [];
  const keys = header.map((h) => String(h ?? "").trim());
  return body
    .filter((r) => r.some((c) => c !== "" && c !== undefined))
    .map((r) => Object.fromEntries(keys.map((k, i) => [k, r[i] ?? ""]).filter(([k]) => k !== "")));
}

function parseCsv(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); out.push(row); row = []; field = "";
    } else field += ch;
  }
  if (field !== "" || row.length > 0) { row.push(field); out.push(row); }
  return out;
}

export async function readSpreadsheetRows(file: File): Promise<Row[]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv")) {
    return rowsFromGrid(parseCsv((await file.text()).replace(/^﻿/, "")));
  }
  if (!name.endsWith(".xlsx")) throw new Error("Unsupported file type — save it as .xlsx and try again.");

  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const sheet = wb.worksheets[0];
  if (!sheet) return [];
  const grid: (string | number)[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const values: (string | number)[] = [];
    for (let c = 1; c <= sheet.columnCount; c++) values.push(cellToValue(row.getCell(c).value));
    grid.push(values);
  });
  return rowsFromGrid(grid);
}
