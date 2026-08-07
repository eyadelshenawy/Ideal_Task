"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";

type CustomFieldType = "TEXT" | "NUMBER" | "SELECT";
interface CustomFieldDef {
  id: string;
  name: string;
  type: CustomFieldType;
  options: string[];
}
interface CustomFieldsResponse {
  fields: CustomFieldDef[];
  values: Record<string, string>;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function TaskCustomFieldsPanel({ taskId }: { taskId: string }) {
  const { data, mutate } = useSWR<CustomFieldsResponse>(`/api/tasks/${taskId}/custom-fields`, fetcher);
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (data) setValues(data.values);
  }, [data]);

  async function save(fieldId: string, value: string) {
    setValues((prev) => ({ ...prev, [fieldId]: value }));
    await fetch(`/api/tasks/${taskId}/custom-fields`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ values: { [fieldId]: value } }),
    });
    mutate();
  }

  if (!data || data.fields.length === 0) return null;

  return (
    <div className="mt-4 pt-4 border-t border-brand-border">
      <div className="text-xs font-semibold text-brand-sub mb-2">Custom Fields</div>
      <div className="flex flex-col gap-2">
        {data.fields.map((f) => (
          <div key={f.id}>
            <label className="text-xs font-semibold text-brand-sub">{f.name}</label>
            {f.type === "SELECT" ? (
              <select
                value={values[f.id] ?? ""}
                onChange={(e) => save(f.id, e.target.value)}
                className="w-full mt-1 rounded-lg border border-brand-border px-2 py-2 text-sm outline-none"
              >
                <option value="">—</option>
                {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : (
              <input
                type={f.type === "NUMBER" ? "number" : "text"}
                value={values[f.id] ?? ""}
                onChange={(e) => setValues((prev) => ({ ...prev, [f.id]: e.target.value }))}
                onBlur={(e) => save(f.id, e.target.value)}
                className="w-full mt-1 rounded-lg border border-brand-border px-2 py-2 text-sm outline-none"
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
