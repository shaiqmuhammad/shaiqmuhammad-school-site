"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { lmsApi } from "@/lib/lms";

type Row = { id: string; vid: string; name: string; role: string; text: string; at: number; status: string };

/** Admin → Community → Video comments: approve, hide or delete comments (visitor comments arrive as "pending"). */
export function AdminVideoComments() {
  const { lang } = useI18n();
  const tr = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const [items, setItems] = useState<Row[] | null>(null);
  const [filter, setFilter] = useState("pending");
  const load = useCallback(() => lmsApi.vidAdminList(filter === "all" ? "" : filter).then((r) => setItems(r.items)).catch(() => setItems([])), [filter]);
  useEffect(() => { load(); }, [load]);
  const act = async (id: string, st: "ok" | "hidden" | "delete") => { await lmsApi.vidAdminSet(id, st).catch(() => undefined); load(); };
  const chip = (on: boolean) => `rounded-full border px-3 py-1 text-sm font-semibold ${on ? "border-sun-border bg-sun text-navy" : "border-card-border bg-card-solid"}`;
  return (
    <div className="space-y-4" data-testid="vc-admin">
      <div className="flex flex-wrap gap-2">{([["pending", tr("Waiting", "بانتظار الموافقة")], ["ok", tr("Approved", "معتمد")], ["hidden", tr("Hidden", "مخفي")], ["all", tr("All", "الكل")]] as const).map(([k, l]) => <button key={k} type="button" className={chip(filter === k)} onClick={() => setFilter(k)} data-testid={`vc-f-${k}`}>{l}</button>)}</div>
      {items === null ? <p className="opacity-60">…</p> : !items.length ? <p className="py-8 text-center opacity-70" data-testid="vc-empty">{tr("No comments here.", "لا تعليقات.")}</p> : (
        <ul className="space-y-2">{items.map((c) => (
          <li key={c.id} className="flex flex-wrap items-start gap-3 rounded-2xl border border-card-border bg-card-solid p-3" data-testid="vc-row">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`https://i.ytimg.com/vi/${c.vid}/default.jpg`} alt="" className="h-14 w-20 shrink-0 rounded-lg object-cover" />
            <div className="min-w-0 flex-1"><p className="text-sm"><b dir="auto">{c.name}</b> <span className="text-xs opacity-60">· {c.role} · {new Date(c.at).toLocaleString(lang === "ar" ? "ar" : "en-GB")} · {c.status}</span></p><p className="whitespace-pre-wrap break-words text-sm" dir="auto">{c.text}</p></div>
            <div className="flex gap-1.5">
              {c.status !== "ok" && <button type="button" className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-bold text-white" onClick={() => act(c.id, "ok")} data-testid="vc-approve">✓ {tr("Approve", "اعتماد")}</button>}
              {c.status !== "hidden" && <button type="button" className="rounded-full bg-amber-500 px-3 py-1 text-xs font-bold text-black" onClick={() => act(c.id, "hidden")}>{tr("Hide", "إخفاء")}</button>}
              <button type="button" className="rounded-full bg-rose-600 px-3 py-1 text-xs font-bold text-white" onClick={() => { if (confirm(tr("Delete this comment?", "حذف التعليق؟"))) act(c.id, "delete"); }} data-testid="vc-delete">🗑</button>
            </div>
          </li>))}</ul>
      )}
    </div>
  );
}
