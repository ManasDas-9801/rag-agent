"use client";

import { useEffect, useState } from "react";
import { AdminShell, adminFetch } from "@/components/app/admin-shell";

type BrowseResult = {
  table: string;
  columns: string[];
  rows: Record<string, unknown>[];
  total: number;
  limit: number;
  offset: number;
};

export default function AdminDatabasePage() {
  const [tables, setTables] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [data, setData] = useState<BrowseResult | null>(null);
  const [offset, setOffset] = useState(0);
  const limit = 50;

  useEffect(() => {
    void (async () => {
      const res = await adminFetch("/v1/admin/db/tables");
      if (res.ok) {
        const body = (await res.json()) as { tables: string[] };
        setTables(body.tables);
        if (body.tables[0]) setSelected(body.tables[0]);
      }
    })();
  }, []);

  useEffect(() => {
    if (!selected) return;
    void (async () => {
      const res = await adminFetch(
        `/v1/admin/db/tables/${selected}?limit=${limit}&offset=${offset}`,
      );
      if (res.ok) setData((await res.json()) as BrowseResult);
    })();
  }, [selected, offset]);

  function formatCell(value: unknown) {
    if (value === null || value === undefined) return "—";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  }

  return (
    <AdminShell
      title="Database browser"
      subtitle="Read-only view of PostgreSQL tables. Passwords and tokens are redacted."
    >
      <div className="flex flex-col gap-6 lg:flex-row">
        <aside className="card-glass w-full shrink-0 p-4 lg:w-56">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Tables</p>
          <ul className="mt-3 space-y-1">
            {tables.map((t) => (
              <li key={t}>
                <button
                  type="button"
                  className={`w-full rounded-lg px-3 py-2 text-left text-sm ${
                    selected === t
                      ? "bg-indigo-50 font-medium text-indigo-700"
                      : "text-slate-700 hover:bg-slate-50"
                  }`}
                  onClick={() => {
                    setSelected(t);
                    setOffset(0);
                  }}
                >
                  {t}
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <div className="min-w-0 flex-1">
          {data ? (
            <>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-slate-600">
                  <span className="font-semibold text-slate-900">{data.table}</span> — {data.total}{" "}
                  rows
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="btn-secondary px-3 py-1 text-xs"
                    disabled={offset === 0}
                    onClick={() => setOffset(Math.max(0, offset - limit))}
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    className="btn-secondary px-3 py-1 text-xs"
                    disabled={offset + limit >= data.total}
                    onClick={() => setOffset(offset + limit)}
                  >
                    Next
                  </button>
                </div>
              </div>
              <div className="card-glass overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      {data.columns.map((col) => (
                        <th key={col} className="whitespace-nowrap px-3 py-2 font-semibold">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={data.columns.length}
                          className="px-3 py-8 text-center text-slate-500"
                        >
                          No rows
                        </td>
                      </tr>
                    ) : (
                      data.rows.map((row, i) => (
                        <tr key={i} className="border-b border-slate-100 hover:bg-slate-50/50">
                          {data.columns.map((col) => (
                            <td
                              key={col}
                              className="max-w-xs truncate px-3 py-2 font-mono text-slate-700"
                              title={formatCell(row[col])}
                            >
                              {formatCell(row[col])}
                            </td>
                          ))}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="flex justify-center py-16">
              <div className="h-10 w-10 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
            </div>
          )}
        </div>
      </div>
    </AdminShell>
  );
}
