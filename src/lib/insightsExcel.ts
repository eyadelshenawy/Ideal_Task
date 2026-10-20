import type { Insights } from "@/lib/reportInsights";

/**
 * Downloads the insight reports as an Excel file. Raw counts and sums are
 * written as numbers; every total, average and percentage is an Excel
 * formula, so the workbook shows how each figure is worked out.
 */
export async function exportInsightsToExcel(data: Insights, periodLabel: string) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();

  const sheet = (name: string, headers: string[]) => {
    const ws = wb.addWorksheet(name);
    ws.addRow([`IDEAL Tasks — ${name} — ${periodLabel}`]).font = { bold: true, color: { argb: "FF0A5A46" } };
    const h = ws.addRow(headers);
    h.eachCell((c) => {
      c.font = { bold: true, color: { argb: "FFFFFFFF" } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0A5A46" } };
    });
    ws.columns.forEach((col, i) => { col.width = i === 0 ? 30 : 14; });
    return ws;
  };
  const col = (n: number) => String.fromCharCode(64 + n); // 1 → A
  const months = data.months;
  const lastMonthCol = col(1 + months.length);

  // 1 · Tickets per customer per month
  let ws = sheet("Tickets per customer", ["Customer", ...months.map((m) => m.label), "Total"]);
  data.ticketsPerCustomer.forEach((r) => {
    const row = ws.addRow([r.name, ...months.map((m) => r.counts[m.key] ?? 0)]);
    row.getCell(2 + months.length).value = { formula: `SUM(B${row.number}:${lastMonthCol}${row.number})` };
  });

  // 2 · SLA met % per customer per month
  ws = sheet("SLA per customer", ["Customer", "Month", "Met", "Breached", "Met %"]);
  data.slaPerCustomer.forEach((r) => months.forEach((m) => {
    const met = r.met[m.key] ?? 0, breached = r.breached[m.key] ?? 0;
    if (met + breached === 0) return;
    const row = ws.addRow([r.name, m.label, met, breached]);
    const n = row.number;
    row.getCell(5).value = { formula: `IF(C${n}+D${n}=0,"",ROUND(C${n}/(C${n}+D${n})*100,0))` };
  }));

  // 3 · Average response and resolution time
  ws = sheet("Response & resolution", ["Priority", "Total response hours", "Tickets responded", "Avg response (hours)", "Total resolution working days", "Tickets resolved", "Avg resolution (working days)"]);
  data.speed.forEach((s) => {
    const row = ws.addRow([s.label, Math.round(s.responseHours * 10) / 10, s.responseCount, null, s.resolutionDays, s.resolutionCount]);
    const n = row.number;
    row.getCell(4).value = { formula: `IF(C${n}=0,"",ROUND(B${n}/C${n},1))` };
    row.getCell(7).value = { formula: `IF(F${n}=0,"",ROUND(E${n}/F${n},1))` };
  });

  // 4 · Age of open tickets
  ws = sheet("Age of open tickets", ["Age (working days from created date to today)", "Open tickets"]);
  const ageStart = ws.rowCount + 1;
  data.ageing.forEach((a) => ws.addRow([a.label, a.count]));
  ws.addRow(["Total", { formula: `SUM(B${ageStart}:B${ws.rowCount})` }]).font = { bold: true };

  // 5 · Where problems come from
  ws = sheet("Top modules & categories", ["Type", "Name", "Tickets"]);
  data.topModules.forEach((t) => ws.addRow(["Module", t.name, t.count]));
  data.topCategories.forEach((t) => ws.addRow(["Category", t.name, t.count]));

  // 6 · Hours per customer per month
  ws = sheet("Hours per customer", ["Customer", ...months.map((m) => m.label), "Total"]);
  const hoursStart = ws.rowCount + 1;
  data.hoursPerCustomer.forEach((r) => {
    const row = ws.addRow([r.name, ...months.map((m) => Math.round((r.hours[m.key] ?? 0) * 100) / 100)]);
    row.getCell(2 + months.length).value = { formula: `SUM(B${row.number}:${lastMonthCol}${row.number})` };
  });
  if (data.hoursPerCustomer.length) {
    const hoursEnd = ws.rowCount;
    const totals = ws.addRow(["Total"]);
    for (let c = 2; c <= 2 + months.length; c++) {
      totals.getCell(c).value = { formula: `SUM(${col(c)}${hoursStart}:${col(c)}${hoursEnd})` };
    }
    totals.font = { bold: true };
  }

  // 7 · Team performance
  ws = sheet("Team performance", ["Person", "Closed", "Total resolution working days", "Avg resolution (working days)", "Open now", "Overdue now", "Overdue %"]);
  data.team.forEach((r) => {
    const row = ws.addRow([r.name, r.closed, r.resolutionDays, null, r.open, r.overdue]);
    const n = row.number;
    row.getCell(4).value = { formula: `IF(B${n}=0,"",ROUND(C${n}/B${n},1))` };
    row.getCell(7).value = { formula: `IF(E${n}=0,"",ROUND(F${n}/E${n}*100,0))` };
  });

  // 8 · Opened vs closed per week
  ws = sheet("Opened vs closed", ["Week starting", "Opened", "Closed", "Change (opened − closed)"]);
  data.weeks.forEach((w) => {
    const row = ws.addRow([w.week, w.opened, w.closed]);
    row.getCell(4).value = { formula: `B${row.number}-C${row.number}` };
  });

  // 9 · Reopened tickets
  ws = sheet("Reopened", ["Reopened", "Closed", "Reopened %"]);
  const r9 = ws.addRow([data.reopenedCount, data.closedCount]);
  r9.getCell(3).value = { formula: `IF(B${r9.number}=0,"",ROUND(A${r9.number}/B${r9.number}*100,0))` };

  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `IDEAL-Tasks-reports-${new Date().toISOString().slice(0, 10)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
