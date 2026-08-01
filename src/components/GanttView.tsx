"use client";

import { Fragment, useMemo } from "react";
import { Diamond } from "lucide-react";
import type { Task } from "@/types/models";
import { STATUSES, MONTHS, todayStr, addDays, diffDays, toTreeRows } from "@/lib/taskHelpers";

interface GanttViewProps {
  tasks: Task[];
  onEditTask: (task: Task) => void;
}

const dayWidth = 30;
const rowHeight = 42;
const headerHeight = 46;
const sidebarWidth = 210;

export default function GanttView({ tasks, onEditTask }: GanttViewProps) {
  const { start, end } = useMemo(() => {
    const dates: string[] = [];
    tasks.forEach((t) => {
      if (t.startDate) dates.push(t.startDate);
      if (t.dueDate) dates.push(t.dueDate);
    });
    if (dates.length === 0) {
      const t0 = todayStr();
      return { start: addDays(t0, -3), end: addDays(t0, 17) };
    }
    dates.sort();
    return { start: addDays(dates[0], -2), end: addDays(dates[dates.length - 1], 4) };
  }, [tasks]);

  const days = useMemo(() => {
    const arr: { date: string; dayNum: number; isWeekend: boolean; isMonthStart: boolean; monthLabel: string; isToday: boolean }[] = [];
    let cur = start;
    const todayS = todayStr();
    while (cur <= end) {
      const [y, m, d] = cur.split("-").map(Number);
      const dow = new Date(y, m - 1, d).getDay();
      arr.push({
        date: cur, dayNum: d, isWeekend: dow === 5 || dow === 6, isMonthStart: d === 1,
        monthLabel: MONTHS[m - 1], isToday: cur === todayS,
      });
      cur = addDays(cur, 1);
    }
    return arr;
  }, [start, end]);

  // Parent/child tasks render in tree order (child rows directly beneath
  // their parent, indented) rather than whatever order the caller sorted
  // them in — Gantt isn't split into status columns like Board, so unlike
  // there, full nesting works here without conflicting with anything.
  const rows = useMemo(() => toTreeRows(tasks, new Set()), [tasks]);

  const totalWidth = sidebarWidth + days.length * dayWidth;
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
    [rows, start],
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

  const todayX = xForDate(todayStr()) + dayWidth / 2;

  if (tasks.length === 0) {
    return <div className="text-center text-brand-sub text-sm py-10">No tasks to show on the timeline</div>;
  }

  return (
    <div className="overflow-auto border border-brand-border rounded-[10px] bg-white" style={{ maxHeight: 520 }}>
      <div style={{ position: "relative", width: totalWidth, height: totalHeight }}>
        <div style={{ display: "grid", gridTemplateColumns: `${sidebarWidth}px repeat(${days.length}, ${dayWidth}px)` }}>
          <div
            className="text-[11px] font-bold text-brand-sub"
            style={{
              position: "sticky", top: 0, left: 0, zIndex: 4, background: "#fff",
              borderBottom: "1px solid #E1E8E4", borderLeft: "1px solid #E1E8E4",
              height: headerHeight, display: "flex", alignItems: "center", paddingLeft: 10,
            }}
          >
            TASK
          </div>
          {days.map((d) => (
            <div
              key={d.date}
              className="text-[10px] text-brand-sub"
              style={{
                position: "sticky", top: 0, zIndex: 2, height: headerHeight,
                background: d.isToday ? "#E4EFE8" : d.isWeekend ? "#F5F8F6" : "#fff",
                borderBottom: "1px solid #E1E8E4", borderLeft: "1px solid #E1E8E4",
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end",
                paddingBottom: 4,
              }}
            >
              {d.isMonthStart && (
                <div className="text-[9px] font-bold text-brand-dark" style={{ position: "absolute", top: 3 }}>
                  {d.monthLabel}
                </div>
              )}
              <div style={{ fontWeight: d.isToday ? 700 : 400 }}>{d.dayNum}</div>
            </div>
          ))}

          {rows.map(({ task: t, depth }) => (
            <Fragment key={t.id}>
              <div
                onClick={() => onEditTask(t)}
                className="text-[12px] text-brand-text cursor-pointer"
                style={{
                  position: "sticky", left: 0, zIndex: 3, background: "#fff",
                  borderBottom: "1px solid #E1E8E4", borderLeft: "1px solid #E1E8E4",
                  height: rowHeight, display: "flex", alignItems: "center", gap: 6, padding: `0 10px 0 ${10 + depth * 14}px`,
                }}
              >
                {t.isMilestone && <Diamond size={11} className="text-brand-dark flex-shrink-0" />}
                {t.code && <span className="font-mono text-[10px] text-brand-sub flex-shrink-0">{t.code}</span>}
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</span>
              </div>
              {days.map((d) => (
                <div
                  key={t.id + d.date}
                  style={{
                    height: rowHeight, borderBottom: "1px solid #E1E8E4", borderLeft: "1px solid #E1E8E4",
                    background: d.isWeekend ? "#FAFCFB" : "#fff",
                  }}
                />
              ))}
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
            if (b.task.isMilestone) {
              return (
                <div
                  key={b.task.id}
                  onClick={() => onEditTask(b.task)}
                  title={b.task.title}
                  style={{
                    position: "absolute", left: b.x - 6, top: b.y + rowHeight / 2 - 6, width: 12, height: 12,
                    background: "#0A5A46", transform: "rotate(45deg)", pointerEvents: "auto", cursor: "pointer",
                  }}
                />
              );
            }
            return (
              <div
                key={b.task.id}
                onClick={() => onEditTask(b.task)}
                title={`${b.task.title} — ${b.task.progress || 0}%`}
                style={{
                  position: "absolute", left: b.x + 1, top: b.y + (rowHeight - 20) / 2, width: b.width - 2, height: 20,
                  borderRadius: 5, background: status.color + "33", border: `1px solid ${status.color}`,
                  pointerEvents: "auto", cursor: "pointer", overflow: "hidden",
                }}
              >
                <div style={{ height: "100%", width: `${b.task.progress || 0}%`, background: status.color }} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
