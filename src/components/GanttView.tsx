"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Diamond } from "lucide-react";
import type { Task } from "@/types/models";
import { STATUSES, MONTHS, todayStr, addDays, diffDays, toTreeRows } from "@/lib/taskHelpers";

interface GanttViewProps {
  tasks: Task[];
  onEditTask: (task: Task) => void;
  /** Initials of the task's assignees ("OH, MA"), shown beside each bar. */
  assigneeLabel?: (task: Task) => string;
}

type Scale = "days" | "weeks";

// Days: one 30px column per day. Weeks: one 56px column per week (8px a day).
const dayWidthFor: Record<Scale, number> = { days: 30, weeks: 8 };
const rowHeight = 34;
const headerHeight = 40;

function dayOfWeek(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).getDay();
}

export default function GanttView({ tasks, onEditTask, assigneeLabel }: GanttViewProps) {
  const [scale, setScale] = useState<Scale>("days");
  const scrollRef = useRef<HTMLDivElement>(null);
  // A narrower task-name column on phones leaves room for the bars.
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const update = () => setNarrow(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  const sidebarWidth = narrow ? 130 : 230;
  // Month and year at the left edge of what's in view, shown beside the buttons.
  const [visibleMonth, setVisibleMonth] = useState("");
  const dayWidth = dayWidthFor[scale];
  const todayS = todayStr();

  // The range always includes today, so the view can open scrolled to it.
  const { start, end } = useMemo(() => {
    const dates: string[] = [todayS];
    tasks.forEach((t) => {
      if (t.startDate) dates.push(t.startDate);
      if (t.dueDate) dates.push(t.dueDate);
    });
    dates.sort();
    let s = addDays(dates[0], -2);
    let e = addDays(dates[dates.length - 1], 4);
    if (scale === "weeks") {
      // Whole weeks, Sunday to Saturday.
      s = addDays(s, -dayOfWeek(s));
      e = addDays(e, 6 - dayOfWeek(e));
    }
    return { start: s, end: e };
  }, [tasks, scale, todayS]);

  // Header columns: one per day, or one per week.
  const columns = useMemo(() => {
    const step = scale === "days" ? 1 : 7;
    const arr: { date: string; label: string; monthLabel: string | null; isWeekend: boolean; isToday: boolean }[] = [];
    let cur = start;
    let lastMonth = -1;
    while (cur <= end) {
      const [, m, d] = cur.split("-").map(Number);
      const dow = dayOfWeek(cur);
      const containsToday = scale === "days" ? cur === todayS : todayS >= cur && todayS <= addDays(cur, 6);
      arr.push({
        date: cur,
        label: String(d),
        monthLabel: m !== lastMonth ? MONTHS[m - 1] : null,
        isWeekend: scale === "days" && (dow === 5 || dow === 6),
        isToday: containsToday,
      });
      lastMonth = m;
      cur = addDays(cur, step);
    }
    return arr;
  }, [start, end, scale, todayS]);
  const columnWidth = dayWidth * (scale === "days" ? 1 : 7);

  // Parent/child tasks render in tree order (child rows directly beneath
  // their parent, indented) rather than whatever order the caller sorted
  // them in — Gantt isn't split into status columns like Board, so unlike
  // there, full nesting works here without conflicting with anything.
  const rows = useMemo(() => toTreeRows(tasks, new Set()), [tasks]);

  const totalDays = diffDays(start, end) + 1;
  const totalWidth = sidebarWidth + totalDays * dayWidth;
  const totalHeight = headerHeight + rows.length * rowHeight;
  const xForDate = (dateStr: string) => sidebarWidth + diffDays(start, dateStr) * dayWidth;

  const bars = useMemo(
    () => rows
      .map(({ task: t, depth }, i) => {
        const effStart = t.startDate || t.dueDate;
        const effEnd = t.dueDate || t.startDate;
        if (!effStart || !effEnd) return null;
        const x1 = xForDate(effStart);
        const x2 = xForDate(effEnd) + dayWidth;
        return { task: t, depth, rowIndex: i, x: x1, width: Math.max(x2 - x1, dayWidth), y: headerHeight + i * rowHeight };
      })
      .filter((b): b is NonNullable<typeof b> => b !== null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, start, dayWidth, sidebarWidth],
  );

  const barById = useMemo(() => {
    const map: Record<string, (typeof bars)[number]> = {};
    bars.forEach((b) => { map[b.task.id] = b; });
    return map;
  }, [bars]);

  const arrows = useMemo(() => {
    const list: { x1: number; y1: number; x2: number; y2: number }[] = [];
    bars.forEach((b) => {
      (b.task.dependsOn || []).forEach((depId) => {
        const pred = barById[depId];
        if (!pred) return;
        list.push({ x1: pred.x + pred.width, y1: pred.y + rowHeight / 2, x2: b.x, y2: b.y + rowHeight / 2 });
      });
    });
    return list;
  }, [bars, barById]);

  const todayX = xForDate(todayS) + dayWidth / 2;

  function updateVisibleMonth() {
    const el = scrollRef.current;
    if (!el) return;
    const [y, m] = addDays(start, Math.floor(el.scrollLeft / dayWidth)).split("-").map(Number);
    setVisibleMonth(`${MONTHS[m - 1]} ${y}`);
  }

  function scrollToToday() {
    const el = scrollRef.current;
    if (!el) return;
    // Leave up to a week (or a third of the visible width) before today.
    const lead = Math.min(dayWidth * 7, (el.clientWidth - sidebarWidth) / 3);
    el.scrollLeft = Math.max(0, todayX - sidebarWidth - lead);
    updateVisibleMonth();
  }
  // Open on today, and again whenever Days/Weeks or the column width changes.
  useEffect(() => { scrollToToday(); }, [scale, sidebarWidth]); // eslint-disable-line react-hooks/exhaustive-deps

  if (tasks.length === 0) {
    return <div className="text-center text-brand-sub text-sm py-10">No tasks to show on the timeline</div>;
  }

  return (
    <div className="border border-brand-border rounded-[10px] bg-white overflow-hidden">
      <div className="flex items-center gap-2 px-2.5 py-2 border-b border-brand-border">
        <button onClick={scrollToToday} className="rounded-lg px-2.5 py-1 text-xs border border-brand-border text-brand-text">
          Today
        </button>
        <div className="flex rounded-lg border border-brand-border overflow-hidden">
          {(["days", "weeks"] as Scale[]).map((s) => (
            <button
              key={s}
              onClick={() => setScale(s)}
              className="px-2.5 py-1 text-xs"
              style={{ background: scale === s ? "#0A5A46" : "#fff", color: scale === s ? "#fff" : "#5B6B64" }}
            >
              {s === "days" ? "Days" : "Weeks"}
            </button>
          ))}
        </div>
        <span className="text-xs font-semibold text-brand-dark ml-1">{visibleMonth}</span>
      </div>

      <div ref={scrollRef} onScroll={updateVisibleMonth} className="overflow-auto" style={{ maxHeight: 520 }}>
        <div style={{ position: "relative", width: totalWidth, height: totalHeight }}>
          {/* Weekend shading sits behind everything; no per-day grid lines. */}
          <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
            {columns.filter((c) => c.isWeekend).map((c) => (
              <div key={c.date} style={{ position: "absolute", top: 0, bottom: 0, left: xForDate(c.date), width: columnWidth, background: "#F7F9F8" }} />
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: `${sidebarWidth}px repeat(${columns.length}, ${columnWidth}px)`, position: "relative" }}>
            <div
              style={{
                position: "sticky", top: 0, left: 0, zIndex: 4, background: "#fff",
                borderBottom: "1px solid #E1E8E4", height: headerHeight,
              }}
            />
            {columns.map((c) => (
              <div
                key={c.date}
                className="text-[10px] text-brand-sub"
                style={{
                  position: "sticky", top: 0, zIndex: 2, height: headerHeight,
                  background: c.isToday ? "#E4EFE8" : c.isWeekend ? "#F7F9F8" : "#fff",
                  color: c.isToday ? "#0A5A46" : undefined,
                  borderBottom: "1px solid #E1E8E4",
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end",
                  paddingBottom: 4,
                }}
              >
                {c.monthLabel && (
                  <div className="text-[9px] font-bold text-brand-dark" style={{ position: "absolute", top: 3, left: 3 }}>
                    {c.monthLabel}
                  </div>
                )}
                <div style={{ fontWeight: c.isToday ? 700 : 400 }}>{c.label}</div>
              </div>
            ))}

            {rows.map(({ task: t, depth }) => (
              <Fragment key={t.id}>
                <div
                  onClick={() => onEditTask(t)}
                  className="text-[12px] text-brand-text cursor-pointer"
                  style={{
                    position: "sticky", left: 0, zIndex: 3, background: "#fff",
                    borderBottom: "1px solid #EEF2F0", borderRight: "1px solid #E1E8E4",
                    height: rowHeight, display: "flex", alignItems: "center", gap: 6, padding: `0 10px 0 ${10 + depth * 14}px`,
                  }}
                >
                  {t.isMilestone && <Diamond size={11} className="text-brand-dark flex-shrink-0" />}
                  {t.code && !narrow && <span className="font-mono text-[10px] flex-shrink-0" style={{ color: "#9AA7A1" }}>{t.code}</span>}
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={t.title}>{t.title}</span>
                </div>
                <div style={{ gridColumn: "2 / -1", height: rowHeight, borderBottom: "1px solid #EEF2F0" }} />
              </Fragment>
            ))}
          </div>

          <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
            <svg width={totalWidth} height={totalHeight} style={{ position: "absolute", top: 0, left: 0 }}>
              <defs>
                <marker id="arrowhead" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                  <path d="M0,0 L8,4 L0,8 Z" fill="#9AA6A0" />
                </marker>
              </defs>
              <line x1={todayX} y1={headerHeight} x2={todayX} y2={totalHeight} stroke="#C4443D" strokeWidth={1} strokeDasharray="3,3" />
              {arrows.map((a, idx) => (
                <line key={idx} x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2} stroke="#9AA6A0" strokeWidth={1.5} markerEnd="url(#arrowhead)" />
              ))}
            </svg>

            {bars.map((b) => {
              const status = STATUSES.find((s) => s.id === b.task.status)!;
              const who = assigneeLabel?.(b.task);
              const label = who ? (
                <div
                  className="text-[10.5px] text-brand-sub whitespace-nowrap"
                  style={{ position: "absolute", left: b.x + b.width + 6, top: b.y + rowHeight / 2 - 7, lineHeight: "14px" }}
                >
                  {who}
                </div>
              ) : null;
              if (b.task.isMilestone) {
                return (
                  <Fragment key={b.task.id}>
                    <div
                      onClick={() => onEditTask(b.task)}
                      title={b.task.title}
                      style={{
                        position: "absolute", left: b.x + b.width / 2 - 6, top: b.y + rowHeight / 2 - 6, width: 12, height: 12,
                        background: "#0A5A46", transform: "rotate(45deg)", pointerEvents: "auto", cursor: "pointer",
                      }}
                    />
                    {label}
                  </Fragment>
                );
              }
              return (
                <Fragment key={b.task.id}>
                  <div
                    onClick={() => onEditTask(b.task)}
                    title={`${b.task.title} — ${b.task.progress || 0}%`}
                    style={{
                      position: "absolute", left: b.x + 1, top: b.y + (rowHeight - 16) / 2, width: b.width - 2, height: 16,
                      borderRadius: 5, background: status.color + "33", border: `1px solid ${status.color}`,
                      pointerEvents: "auto", cursor: "pointer", overflow: "hidden",
                    }}
                  >
                    <div style={{ height: "100%", width: `${b.task.progress || 0}%`, background: status.color }} />
                  </div>
                  {label}
                </Fragment>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
