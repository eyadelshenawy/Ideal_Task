import { z } from "zod";
import PptxGenJS from "pptxgenjs";

// Builds a PowerPoint in IDEAL colours from the slide content Claude sends to
// the send_report tool. Claude never sends a file: only short text, numbers
// and tables, which are checked here and laid out on fixed templates.
// No images are added, so nothing from outside is ever parsed as a picture.

const DARK = "0A5A46";
const LIGHT = "82B478";
const TEXT = "16261F";
const SUB = "5B6B64";
const BG = "F5F8F6";
const FONT = "Calibri";

const short = (max: number) => z.string().trim().min(1).max(max);

const kpi = z.object({
  label: short(60),
  value: short(30),
  formula: z.string().trim().max(160).optional(),
});

const table = z.object({
  headers: z.array(z.string().max(60)).min(1).max(8),
  rows: z.array(z.array(z.string().max(160)).max(8)).max(20),
});

const chart = z.object({
  type: z.enum(["bar", "line", "pie"]),
  categories: z.array(z.string().max(40)).min(1).max(24),
  series: z
    .array(z.object({ name: short(40), values: z.array(z.number().finite()).min(1).max(24) }))
    .min(1)
    .max(4),
});

const slide = z
  .object({
    title: short(90),
    kpis: z.array(kpi).max(6).optional(),
    bullets: z.array(z.string().trim().min(1).max(220)).max(10).optional(),
    table: table.optional(),
    chart: chart.optional(),
    note: z.string().trim().max(300).optional(),
  })
  .refine((s) => s.kpis?.length || s.bullets?.length || s.table || s.chart, { message: "Each slide needs kpis, bullets, a table or a chart" });

export const deckSchema = z.object({
  title: short(90),
  subtitle: z.string().trim().max(140).optional(),
  slides: z.array(slide).min(1).max(20),
});

export type Deck = z.infer<typeof deckSchema>;

function footer(s: PptxGenJS.Slide, n: number, total: number) {
  s.addShape("rect", { x: 0, y: 7.2, w: 13.33, h: 0.3, fill: { color: DARK } });
  s.addText("IDEAL for Digital Transformation", { x: 0.4, y: 7.2, w: 8, h: 0.3, fontFace: FONT, fontSize: 10, color: "FFFFFF" });
  s.addText(`${n} / ${total}`, { x: 11.4, y: 7.2, w: 1.5, h: 0.3, fontFace: FONT, fontSize: 10, color: "FFFFFF", align: "right" });
}

export async function buildReportDeck(deck: Deck, projectName: string, dateLabel: string): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE"; // 13.33 x 7.5 in
  pptx.title = deck.title;
  pptx.company = "IDEAL for Digital Transformation";
  const total = deck.slides.length + 1;

  // Cover
  const cover = pptx.addSlide();
  cover.background = { color: DARK };
  cover.addShape("rect", { x: 0.6, y: 2.55, w: 1.2, h: 0.12, fill: { color: LIGHT } });
  cover.addText(deck.title, { x: 0.6, y: 2.8, w: 12, h: 1.2, fontFace: FONT, fontSize: 36, bold: true, color: "FFFFFF" });
  cover.addText(deck.subtitle ?? projectName, { x: 0.6, y: 4.0, w: 12, h: 0.6, fontFace: FONT, fontSize: 18, color: "DCEBD7" });
  cover.addText(dateLabel, { x: 0.6, y: 4.6, w: 12, h: 0.5, fontFace: FONT, fontSize: 14, color: LIGHT });
  cover.addText("IDEAL for Digital Transformation", { x: 0.6, y: 6.6, w: 12, h: 0.4, fontFace: FONT, fontSize: 12, color: "DCEBD7" });

  deck.slides.forEach((d, i) => {
    const s = pptx.addSlide();
    s.background = { color: "FFFFFF" };
    s.addShape("rect", { x: 0, y: 0, w: 0.18, h: 7.2, fill: { color: LIGHT } });
    s.addText(d.title, { x: 0.5, y: 0.3, w: 12.3, h: 0.7, fontFace: FONT, fontSize: 26, bold: true, color: DARK });

    let top = 1.15;
    const bottom = d.note ? 6.55 : 7.0;

    if (d.kpis?.length) {
      const n = d.kpis.length;
      const gap = 0.2;
      const w = (12.3 - gap * (n - 1)) / n;
      d.kpis.forEach((k, j) => {
        const x = 0.5 + j * (w + gap);
        s.addShape("roundRect", { x, y: top, w, h: 1.45, fill: { color: BG }, line: { color: "E1E8E4", width: 1 }, rectRadius: 0.08 });
        s.addText(k.value, { x: x + 0.15, y: top + 0.08, w: w - 0.3, h: 0.65, fontFace: FONT, fontSize: 28, bold: true, color: DARK });
        s.addText(k.label, { x: x + 0.15, y: top + 0.72, w: w - 0.3, h: 0.32, fontFace: FONT, fontSize: 12, color: TEXT });
        if (k.formula) s.addText(k.formula, { x: x + 0.15, y: top + 1.02, w: w - 0.3, h: 0.36, fontFace: FONT, fontSize: 9, italic: true, color: SUB, fit: "shrink" });
      });
      top += 1.7;
    }

    // Below the KPIs: bullets on the left, chart and/or table on the right
    // (stacked when both), or one block across the full width.
    const h = bottom - top;
    const hasBullets = !!d.bullets?.length;
    const visuals = [d.chart ? "chart" : null, d.table ? "table" : null].filter(Boolean) as ("chart" | "table")[];
    const twoCols = hasBullets && visuals.length > 0;
    const colW = twoCols ? 6 : 12.3;
    if (hasBullets) {
      s.addText(
        d.bullets!.map((t) => ({ text: t, options: { bullet: { code: "25A0" }, paraSpaceAfter: 6 } })),
        { x: 0.5, y: top, w: colW, h, fontFace: FONT, fontSize: 15, color: TEXT, valign: "top", fit: "shrink" },
      );
    }
    const vx = twoCols ? 6.8 : 0.5;
    const vw = twoCols ? 6 : 12.3;
    const vh = visuals.length === 2 ? h / 2 - 0.1 : h;
    visuals.forEach((v, k) => {
      const vy = top + k * (vh + 0.2);
      if (v === "chart") addChart(pptx, s, d.chart!, vx, vy, vw, vh);
      else addTable(s, d.table!, vx, vy, vw, vh);
    });

    if (d.note) s.addText(d.note, { x: 0.5, y: 6.6, w: 12.3, h: 0.5, fontFace: FONT, fontSize: 11, italic: true, color: SUB, fit: "shrink" });
    footer(s, i + 2, total);
  });

  const out = (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
  return out;
}

function addChart(pptx: PptxGenJS, s: PptxGenJS.Slide, c: z.infer<typeof chart>, x: number, y: number, w: number, h: number) {
  const data = c.series.map((se) => ({ name: se.name, labels: c.categories, values: c.categories.map((_, k) => se.values[k] ?? 0) }));
  const type = c.type === "bar" ? pptx.ChartType.bar : c.type === "line" ? pptx.ChartType.line : pptx.ChartType.pie;
  s.addChart(type, c.type === "pie" ? data.slice(0, 1) : data, {
    x, y, w, h,
    chartColors: [DARK, LIGHT, "4A7FB5", "D98B3A", "8E7CC3", "8A8F8C"],
    showLegend: c.series.length > 1 || c.type === "pie",
    legendPos: "b",
    legendFontSize: 11,
    catAxisLabelFontSize: 11,
    valAxisLabelFontSize: 10,
    dataLabelFontSize: 10,
    showValue: c.type !== "line",
    showPercent: c.type === "pie",
    barGapWidthPct: 60,
    valGridLine: { color: "E1E8E4", size: 0.5 },
  });
}

function addTable(s: PptxGenJS.Slide, t: z.infer<typeof table>, x: number, y: number, w: number, h: number) {
  const cols = t.headers.length;
  const head = t.headers.map((text) => ({ text, options: { bold: true, color: "FFFFFF", fill: { color: DARK } } }));
  const rows = t.rows.map((r, i) =>
    Array.from({ length: cols }, (_, k) => ({ text: r[k] ?? "", options: { color: TEXT, fill: { color: i % 2 ? "FFFFFF" : BG } } })),
  );
  const fontSize = t.rows.length > 12 ? 9 : t.rows.length > 7 ? 10.5 : 12;
  s.addTable([head, ...rows], {
    x, y, w, h: Math.min(h, 0.32 * (rows.length + 1)),
    colW: Array.from({ length: cols }, () => w / cols),
    fontFace: FONT, fontSize, border: { type: "solid", pt: 0.5, color: "E1E8E4" }, valign: "middle", autoPage: false,
  });
}
