/**
 * Official SF10-JHS template rendering.
 *
 * The registrar/record-keeper upload flow patches whatever file was filed. A
 * JHS learner usually has no filed form yet, so this service fills the school's
 * own blank SF10 template (`assets/sf10-template.xlsx`) instead:
 *
 *  - `fillSf10Template` writes the learner block + the grade's subject rows into
 *    the template workbook and leaves every label, merge, border and formula
 *    master alone. The LEARNING AREAS column is blank in the template, so each
 *    filled row's learning area is written from Zentra's own subject name.
 *  - `renderSf10TemplatePdf` turns a filled workbook into a PDF at the exact
 *    print size the form is laid out for (10.4" × 13" portrait, margins
 *    top 0.1", left/right 0.25", bottom 0.75"). There is no XLSX→PDF engine in
 *    the stack, so the PDF is drawn from the workbook's own geometry: borders
 *    and text are placed at the cell coordinates Excel would print.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { logger } from "../../lib/pino.js";
import { convertXlsxToPdf } from "./xlsx-to-pdf.service.js";

type ExcelJSModule = typeof import("exceljs");
type Workbook = import("exceljs").Workbook;
type Worksheet = import("exceljs").Worksheet;
type Cell = import("exceljs").Cell;
type Borders = import("exceljs").Borders;
type PaperSize = import("exceljs").PaperSize;

async function excelJs(): Promise<ExcelJSModule> {
  const imported = (await import("exceljs")) as unknown as ExcelJSModule & {
    default?: ExcelJSModule;
  };
  return imported.default ?? imported;
}

/* ------------------------------ school block ------------------------------ */

const SCHOOL_NAME = "MATI SCHOOL OF ARTS AND TRADES";
const SCHOOL_ID = "304326";
const SCHOOL_DISTRICT = "City of Mati";
// The header's Division field is narrow (AP20:AX20); the full "Schools Division
// of the City of Mati" overflows across the neighbouring labels, so the value
// matches the DepEd short form that already sits behind "Division:".
const SCHOOL_DIVISION = "City of Mati";
const SCHOOL_REGION = "XI";

/* ------------------------------- public API ------------------------------- */

export interface Sf10TemplateLearner {
  lastName: string | null;
  firstName: string | null;
  middleName: string | null;
  suffix: string | null;
  lrn: string;
  /** Already formatted `mm/dd/yyyy`, or null to leave the cell blank. */
  birthdate: string | null;
  /** Raw profile value ("Male" / "Female"). */
  sex: string | null;
  /** G7–G10 — the JHS band this template covers. */
  gradeLevel: string;
  section: string;
  schoolYear: string;
  adviserName: string | null;
}

export interface Sf10TemplateSubjectRow {
  /** Learning-area name as stored in Zentra (e.g. "Music 7"). */
  subject: string;
  quarters: Array<number | null>;
  rating: number;
  remarks: "PASSED" | "FAILED";
}

export interface Sf10TemplateInput {
  learner: Sf10TemplateLearner;
  rows: Sf10TemplateSubjectRow[];
}

const TEMPLATE_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "assets",
  "sf10-template.xlsx",
);

let cachedTemplate: Buffer | null = null;

async function loadTemplate(): Promise<Buffer> {
  if (!cachedTemplate) cachedTemplate = await readFile(TEMPLATE_PATH);
  return cachedTemplate;
}

/* ------------------------------ row mapping ------------------------------- */

/**
 * The learning-area rows of every JHS grade block are fixed by the DepEd form,
 * in this order (0 = first row of the block). MAPEH components get their own
 * rows, which is why "music"/"arts"/"physical education"/"health" are matched
 * before the umbrella "MAPEH" row — the subject normalizer collapses all of
 * them to one key, so this matcher must read the display name instead.
 */
const SUBJECT_ROWS: Array<{ offset: number; test: RegExp }> = [
  { offset: 7, test: /music/i },
  { offset: 8, test: /\barts\b/i },
  { offset: 9, test: /(physical education|\bpe\b)/i },
  { offset: 10, test: /health/i },
  { offset: 6, test: /mapeh/i },
  { offset: 5, test: /(technology and livelihood|\btle\b|\bepp\b|\bstve\b)/i },
  { offset: 11, test: /(edukasyon|edukasyong|\besp\b)/i },
  { offset: 4, test: /(araling|\bap\b)/i },
  { offset: 0, test: /english/i },
  { offset: 1, test: /(mathematics|\bmath\b)/i },
  { offset: 2, test: /filipino/i },
  { offset: 3, test: /science/i },
];

function templateRowOffsetFor(subject: string): number | null {
  for (const { offset, test } of SUBJECT_ROWS) {
    if (test.test(subject)) return offset;
  }
  return null;
}

/**
 * One printed page carries two grade blocks: Page 1 (Sheet1) holds G7 and G8,
 * Page 2 (Sheet2) holds G9 and G10. Each block repeats the same column layout
 * (U/Y/AC/AG quarters, AJ final rating, AP remarks), so only the anchor rows
 * differ. A learner's grades go into their own grade's block and every other
 * block is left blank, exactly as the official form is filled by hand.
 */
interface GradeBlock {
  sheet: string;
  schoolRow: number;
  gradeRow: number;
  subjectStart: number;
  generalAverageRow: number;
}

const GRADE_BLOCKS: Record<string, GradeBlock> = {
  G7: { sheet: "Sheet1", schoolRow: 20, gradeRow: 21, subjectStart: 25, generalAverageRow: 37 },
  G8: { sheet: "Sheet1", schoolRow: 46, gradeRow: 47, subjectStart: 51, generalAverageRow: 63 },
  G9: { sheet: "Sheet2", schoolRow: 3, gradeRow: 4, subjectStart: 8, generalAverageRow: 20 },
  G10: { sheet: "Sheet2", schoolRow: 29, gradeRow: 30, subjectStart: 34, generalAverageRow: 48 },
};

/** Quarter value cells (merged anchors) and final/remarks anchors per block. */
const QUARTER_COLS = [21, 25, 29, 33];
const FINAL_COL = 36;
const REMARKS_COL = 42;

/* ------------------------------- XLSX fill -------------------------------- */

function writeCell(ws: Worksheet, row: number, col: number, value: string | number | null): void {
  ws.getRow(row).getCell(col).value = value;
}

/**
 * Replace formula cells in the given rows with their cached results before
 * rewriting them. The form shares the final-rating/remarks formulas across a
 * grade block; overwriting a master while clones still point at it leaves the
 * workbook unserializable (same guard as the upload auto-fill path).
 */
function flattenRowsFormulas(ws: Worksheet, rows: number[], width: number): void {
  for (const r of new Set(rows)) {
    const row = ws.getRow(r);
    for (let c = 1; c <= width; c += 1) {
      const cell = row.getCell(c);
      const value = cell.value;
      if (!value || typeof value !== "object" || value instanceof Date) continue;
      const obj = value as { formula?: unknown; sharedFormula?: unknown; result?: unknown };
      if (typeof obj.formula !== "string" && typeof obj.sharedFormula !== "string") continue;
      const result = obj.result;
      cell.value =
        typeof result === "number" || typeof result === "string" || typeof result === "boolean"
          ? result
          : null;
    }
  }
}

/**
 * One page per sheet, both pages printed at the same size and centred.
 *
 * Fit-to-page scales each sheet independently, so the taller second page came
 * out visibly narrower than the first. Instead the tightest fit across both
 * sheets is used as a fixed scale for both, the single column whose width
 * differs between the sheets is equalised, and the print area is trimmed to the
 * form itself (B..BC, no empty column A) so both pages share one width and sit
 * centred on the paper.
 */
const PRINT_PAPER_A3 = 8 as PaperSize;
const A3_WIDTH_PT = 841.89; // 297mm
const A3_HEIGHT_PT = 1190.55; // 420mm
// Symmetric on all four sides: the sheets are centred inside the margins, so
// unequal top/bottom margins would make the form sit visibly below centre.
const PRINT_MARGINS_PT = { left: 18, right: 18, top: 18, bottom: 18 };
const PRINT_FIRST_COL = 2; // B
const PRINT_LAST_COL = 55; // BC

/** Excel column width (characters) → points at 96 dpi (print-geometry copy). */
function printColumnPt(width: number | undefined): number {
  const w = width && width > 0 ? width : 8.43;
  const px = Math.round(((256 * w + Math.round(128 / 7)) / 256) * 7);
  return px * 0.75;
}

function contentLastRow(ws: Worksheet): number {
  let lastRow = 0;
  ws.eachRow({ includeEmpty: false }, (_row, rowNumber) => {
    lastRow = Math.max(lastRow, rowNumber);
  });
  return Math.max(lastRow, 1);
}

function rowHeightPt(ws: Worksheet, row: number): number {
  const height = ws.getRow(row).height;
  if (height && height > 0) return height;
  return ws.properties.defaultRowHeight ?? 15;
}

function applyPrintSetup(sheets: Worksheet[]): void {
  if (sheets.length === 0) return;

  // Both pages print the same column span, so a column that differs between
  // them would print each page at a different width.
  for (let c = PRINT_FIRST_COL; c <= PRINT_LAST_COL; c += 1) {
    const widest = Math.max(...sheets.map((s) => s.getColumn(c).width ?? 0));
    for (const sheet of sheets) sheet.getColumn(c).width = widest;
  }

  const availW = A3_WIDTH_PT - PRINT_MARGINS_PT.left - PRINT_MARGINS_PT.right;
  const availH = A3_HEIGHT_PT - PRINT_MARGINS_PT.top - PRINT_MARGINS_PT.bottom;
  let scale = 1;
  for (const sheet of sheets) {
    const lastRow = contentLastRow(sheet);
    let width = 0;
    for (let c = PRINT_FIRST_COL; c <= PRINT_LAST_COL; c += 1) {
      width += printColumnPt(sheet.getColumn(c).width);
    }
    let height = 0;
    for (let r = 1; r <= lastRow; r += 1) height += rowHeightPt(sheet, r);
    scale = Math.min(scale, availW / width, availH / height);
  }
  // Whole percent, rounded down with a point of slack so the printer never
  // spills a sheet onto a second page for a fraction of a millimetre.
  const percent = Math.max(10, Math.floor(scale * 100) - 1);

  for (const sheet of sheets) {
    const setup = sheet.pageSetup;
    setup.paperSize = PRINT_PAPER_A3;
    setup.orientation = "portrait";
    setup.fitToPage = false;
    setup.scale = percent;
    setup.horizontalCentered = true;
    setup.verticalCentered = true;
    setup.horizontalDpi = 600;
    setup.verticalDpi = 600;
    setup.margins = { left: 0.25, right: 0.25, top: 0.25, bottom: 0.25, header: 0, footer: 0 };
    setup.printArea = `B1:BC${contentLastRow(sheet)}`;
  }
}

export async function fillSf10Template(input: Sf10TemplateInput): Promise<Buffer> {
  const ExcelJS = await excelJs();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load((await loadTemplate()) as unknown as ArrayBuffer);

  const L = input.learner;
  const gradeKey = L.gradeLevel.toUpperCase().replace(/^GRADE\s*/i, "G");
  const block = GRADE_BLOCKS[gradeKey];
  if (!block) {
    throw new Error(`SF10-JHS template has no grade block for ${L.gradeLevel}`);
  }
  const ws = wb.getWorksheet(block.sheet) ?? wb.worksheets[0];
  if (!ws) throw new Error("SF10 template has no worksheet");

  // Learner block (merged value cells; writing the anchor is enough). Only the
  // first page repeats the learner's identity.
  const identity = wb.getWorksheet("Sheet1") ?? ws;
  writeCell(identity, 6, 7, L.lastName ?? "");
  writeCell(identity, 6, 23, L.firstName ?? "");
  writeCell(identity, 6, 40, L.suffix ?? "");
  writeCell(identity, 6, 50, L.middleName ?? "");
  writeCell(identity, 7, 13, L.lrn);
  writeCell(identity, 7, 34, L.birthdate ?? "");
  writeCell(identity, 7, 48, L.sex ?? "");

  // Scholastic header for this grade block.
  writeCell(ws, block.schoolRow, 5, SCHOOL_NAME);
  writeCell(ws, block.schoolRow, 21, SCHOOL_ID);
  writeCell(ws, block.schoolRow, 30, SCHOOL_DISTRICT);
  writeCell(ws, block.schoolRow, 42, SCHOOL_DIVISION);
  writeCell(ws, block.schoolRow, 54, SCHOOL_REGION);
  writeCell(ws, block.gradeRow, 9, gradeKey.replace(/^G/, ""));
  writeCell(ws, block.gradeRow, 14, L.section);
  writeCell(ws, block.gradeRow, 22, L.schoolYear);
  writeCell(ws, block.gradeRow, 35, L.adviserName ?? "");

  const slots = new Map<number, Sf10TemplateSubjectRow>();
  for (const row of input.rows) {
    const slot = templateRowOffsetFor(row.subject);
    if (slot != null && !slots.has(slot)) slots.set(slot, row);
  }

  // Subject rows run from the block's first row to the row before its General
  // Average band (12 learning areas on every JHS block).
  const touchedRows: number[] = [];
  for (let i = 0; i < 12; i += 1) touchedRows.push(block.subjectStart + i);
  touchedRows.push(block.generalAverageRow);
  flattenRowsFormulas(ws, touchedRows, ws.columnCount);

  // The school template ships with the LEARNING AREAS column blank, so the
  // learning area is written from the learner's own subject, not a printed
  // DepEd default that would not match Zentra's subject names.
  for (const [offset, filled] of slots) {
    const rowNumber = block.subjectStart + offset;
    writeCell(ws, rowNumber, 2, filled.subject);
    QUARTER_COLS.forEach((col, i) => {
      writeCell(ws, rowNumber, col, filled.quarters[i] ?? null);
    });
    writeCell(ws, rowNumber, FINAL_COL, filled.rating);
    writeCell(ws, rowNumber, REMARKS_COL, filled.remarks);
  }

  // General average over the rows actually written. The template's own formula
  // expects four quarters per subject; Zentra runs trimesters, so the captured
  // rating is the correct basis.
  if (slots.size > 0) {
    const sum = [...slots.values()].reduce((total, r) => total + r.rating, 0);
    writeCell(ws, block.generalAverageRow, FINAL_COL, Math.round(sum / slots.size));
  }

  // Applied last so the print area and scale cover the filled content.
  applyPrintSetup(wb.worksheets);

  return Buffer.from(await wb.xlsx.writeBuffer());
}

/* -------------------------------- PDF render ------------------------------- */

/**
 * Print the filled workbook as PDF. LibreOffice renders the workbook itself, so
 * the paper output is exactly what Excel prints (print area, scaling, row
 * heights, fonts, fills). When no soffice binary is available the hand-drawn
 * renderer below is used instead — it only approximates the printed layout.
 */
export async function renderSf10Pdf(xlsx: Buffer): Promise<Buffer> {
  try {
    const converted = await convertXlsxToPdf(xlsx);
    if (converted) return converted;
  } catch (err) {
    logger.warn({ err }, "LibreOffice SF10 conversion failed — using the built-in PDF renderer");
  }
  return renderSf10TemplatePdf(xlsx);
}

const PAGE_WIDTH = 10.4 * 72;
const PAGE_HEIGHT = 13 * 72;
const MARGIN_TOP = 0.1 * 72;
const MARGIN_LEFT = 0.25 * 72;
const MARGIN_RIGHT = 0.25 * 72;
const MARGIN_BOTTOM = 0.75 * 72;

/** Excel column width → pixels (Calibri 11 metric), then points at 96 dpi. */
function columnWidthPt(width: number | undefined): number {
  const w = width && width > 0 ? width : 8.43;
  const px = Math.round(((256 * w + Math.round(128 / 7)) / 256) * 7);
  return px * 0.75;
}

function argbToRgb(argb: string | undefined, fallback: [number, number, number]): [number, number, number] {
  if (!argb) return fallback;
  const hex = argb.replace(/^#/, "").slice(-6);
  if (hex.length !== 6) return fallback;
  const n = Number.parseInt(hex, 16);
  if (!Number.isFinite(n)) return fallback;
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function cellText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return "";
  if (value instanceof Date) return "";
  if (typeof value === "object") {
    const cell = value as {
      text?: unknown;
      result?: unknown;
      richText?: Array<{ text?: unknown }>;
    };
    if (typeof cell.text === "string" && cell.text.trim() && cell.text !== "[object Object]") {
      return cell.text.trim();
    }
    if (typeof cell.result === "string" || typeof cell.result === "number") {
      return String(cell.result).trim();
    }
    if (Array.isArray(cell.richText)) {
      return cell.richText.map((r) => String(r.text ?? "")).join("").trim();
    }
  }
  return "";
}

interface MergedCell {
  isMaster: boolean;
  width: number; // in columns
  height: number; // in rows
}

function addressToRC(addr: string): { row: number; col: number } | null {
  const m = /^\s*([A-Z]+)(\d+)\s*$/i.exec(addr);
  if (!m) return null;
  let col = 0;
  for (const ch of m[1].toUpperCase()) col = col * 26 + (ch.charCodeAt(0) - 64);
  return { row: Number(m[2]), col };
}

function mergeLookup(ws: Worksheet): Map<string, MergedCell> {
  const map = new Map<string, MergedCell>();
  for (const merge of ws.model.merges ?? []) {
    const [a, b] = merge.split(":");
    const start = addressToRC(a);
    const end = addressToRC(b);
    if (!start || !end) continue;
    for (let r = start.row; r <= end.row; r += 1) {
      for (let c = start.col; c <= end.col; c += 1) {
        map.set(`${r}:${c}`, {
          isMaster: r === start.row && c === start.col,
          width: end.col - start.col + 1,
          height: end.row - start.row + 1,
        });
      }
    }
  }
  return map;
}

function lastContentRow(ws: Worksheet): number {
  const max = Math.min(ws.rowCount || 0, 200);
  for (let r = max; r >= 1; r -= 1) {
    const row = ws.getRow(r);
    let seen = false;
    row.eachCell({ includeEmpty: false }, () => {
      seen = true;
    });
    if (seen) return r;
  }
  return 0;
}

function borderOf(borders: Partial<Borders> | undefined, side: keyof Borders) {
  if (!borders) return undefined;
  const border = borders[side];
  return border && border.style ? border : undefined;
}

/**
 * Draw a filled workbook as PDF pages sized for the SF10 print layout. Fonts,
 * sizes, colours, alignment and the template's own borders are read from each
 * cell, so the output matches the workbook instead of a re-invented form.
 */
export async function renderSf10TemplatePdf(xlsx: Buffer): Promise<Buffer> {
  const ExcelJS = await excelJs();
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(xlsx as unknown as ArrayBuffer);

  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  for (const ws of wb.worksheets) {
    const merges = mergeLookup(ws);
    const lastRow = lastContentRow(ws);
    const lastCol = Math.min(ws.columnCount, 60);
    if (lastRow === 0) continue;

    const colPt: number[] = [0];
    for (let c = 1; c <= lastCol; c += 1) colPt[c] = columnWidthPt(ws.getColumn(c).width);
    const rowPt: number[] = [0];
    for (let r = 1; r <= lastRow; r += 1) {
      const height = ws.getRow(r).height;
      rowPt[r] = height && height > 0 ? height : 15;
    }

    const totalW = colPt.reduce((a, b) => a + (b ?? 0), 0);
    const totalH = rowPt.reduce((a, b) => a + (b ?? 0), 0);
    const availW = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;
    const availH = PAGE_HEIGHT - MARGIN_TOP - MARGIN_BOTTOM;
    const scale = Math.min(1, availW / totalW, availH / totalH);

    const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    const xAt = (col: number): number => {
      let x = MARGIN_LEFT;
      for (let c = 1; c < col; c += 1) x += (colPt[c] ?? 0) * scale;
      return x;
    };
    const yTopAt = (row: number): number => {
      let offset = MARGIN_TOP;
      for (let r = 1; r < row; r += 1) offset += (rowPt[r] ?? 0) * scale;
      return PAGE_HEIGHT - offset;
    };

    // Borders first so text sits on top of them.
    for (let r = 1; r <= lastRow; r += 1) {
      for (let c = 1; c <= lastCol; c += 1) {
        const cell = ws.getRow(r).getCell(c);
        const borders = cell.border;
        if (!borders) continue;
        const x1 = xAt(c);
        const x2 = xAt(c + 1);
        const yT = yTopAt(r);
        const yB = yTopAt(r + 1);
        const draw = (side: keyof Borders, from: { x: number; y: number }, to: { x: number; y: number }) => {
          const border = borderOf(borders, side);
          if (!border) return;
          const [red, green, blue] = argbToRgb(
            typeof border.color === "object" ? border.color?.argb : undefined,
            [0, 0, 0],
          );
          const width =
            border.style === "medium" || border.style === "thick"
              ? 1.1
              : border.style === "hair"
                ? 0.3
                : 0.6;
          page.drawLine({
            start: from,
            end: to,
            thickness: width,
            color: rgb(red, green, blue),
            ...(border.style === "dashed"
              ? { dashArray: [3, 2] }
              : border.style === "dotted"
                ? { dashArray: [1, 1.5] }
                : {}),
          });
        };
        draw("top", { x: x1, y: yT }, { x: x2, y: yT });
        draw("bottom", { x: x1, y: yB }, { x: x2, y: yB });
        draw("left", { x: x1, y: yT }, { x: x1, y: yB });
        draw("right", { x: x2, y: yT }, { x: x2, y: yB });
      }
    }

    // Text.
    for (let r = 1; r <= lastRow; r += 1) {
      for (let c = 1; c <= lastCol; c += 1) {
        const cell = ws.getRow(r).getCell(c);
        const text = cellText(cell.value);
        if (!text) continue;
        const merged = merges.get(`${r}:${c}`);
        if (merged && !merged.isMaster) continue;
        const spanCols = merged?.width ?? 1;
        const spanRows = merged?.height ?? 1;
        const x1 = xAt(c);
        const yT = yTopAt(r);
        const boxW = (xAt(c + spanCols) - x1) || (colPt[c] ?? 0) * scale;
        const boxH = (yTopAt(r + spanRows) - yTopAt(r)) * -1 || (rowPt[r] ?? 0) * scale;

        const isBold = !!cell.font?.bold;
        const font = isBold ? bold : regular;
        let size = Math.max(6, (cell.font?.size ?? 10) * scale);
        const [red, green, blue] = argbToRgb(
          typeof cell.font?.color === "object" ? cell.font?.color?.argb : undefined,
          [0, 0, 0],
        );
        const horizontal = cell.alignment?.horizontal;
        const vertical = cell.alignment?.vertical;

        // Wrap to the cell's printable width (a couple of points of padding).
        const maxW = Math.max(4, boxW - 2);
        const words = text.split(/\s+/);
        const lines: string[] = [];
        let line = "";
        for (const word of words) {
          const next = line ? `${line} ${word}` : word;
          if (line && font.widthOfTextAtSize(next, size) > maxW) {
            lines.push(line);
            line = word;
          } else {
            line = next;
          }
        }
        if (line) lines.push(line);
        if (lines.length === 0) continue;

        let lineHeight = size * 1.15;
        let blockH = lineHeight * lines.length;
        // Shrink a wrapped block that does not fit the merged cell's height.
        if (blockH > boxH && boxH > 2) {
          const factor = boxH / blockH;
          size = Math.max(4, size * factor);
          lineHeight = size * 1.15;
          blockH = lineHeight * lines.length;
        }

        let y: number;
        if (vertical === "middle") y = yT - (boxH - blockH) / 2 - lineHeight * 0.8;
        else if (vertical === "top") y = yT - lineHeight * 0.8;
        else y = yT - boxH + 1.5; // bottom-aligned (Excel default)

        lines.forEach((content, i) => {
          const textW = font.widthOfTextAtSize(content, size);
          let x = x1 + 1;
          if (horizontal === "center") x = x1 + Math.max(0, (boxW - textW) / 2);
          else if (horizontal === "right") x = x1 + Math.max(0, boxW - textW - 1);
          page.drawText(content, {
            x,
            y: y + (lines.length - 1 - i) * lineHeight,
            size,
            font,
            color: rgb(red, green, blue),
          });
        });
      }
    }
  }

  return Buffer.from(await doc.save());
}
