"use client";

import { useMemo } from "react";
import useSWR from "swr";
import { DEFAULT_WORK_DAYS, type WorkDays } from "@/lib/workdays";

const fetcher = (url: string) => fetch(url).then((r) => (r.ok ? r.json() : null));
const once = { revalidateOnFocus: false, dedupingInterval: 600000 };

type DayKey = "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat";
const KEYS: DayKey[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/** The Work Calendar (working weekdays + holidays), loaded once and shared. */
export function useWorkDays(): WorkDays {
  const { data: week } = useSWR<Record<DayKey, boolean> | null>("/api/settings/work-week", fetcher, once);
  const { data: holidays } = useSWR<{ date: string }[] | null>("/api/holidays", fetcher, once);
  return useMemo(() => ({
    days: week ? KEYS.map((k) => !!week[k]) : DEFAULT_WORK_DAYS.days,
    holidays: new Set(Array.isArray(holidays) ? holidays.map((h) => h.date) : []),
  }), [week, holidays]);
}
