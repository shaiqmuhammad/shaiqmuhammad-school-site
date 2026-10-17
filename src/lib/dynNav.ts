"use client";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { API } from "@/lib/yt";

export type DynItem = { href: string; label: string; labelAr: string; place: "resources" | "top" | "footer"; order: number };
const KEY = "sm-dyn-nav-v1";
let memo: DynItem[] | null = null;

/** Menu entries the admin added (YouTube playlist pages, custom pages). Cached per tab; menus render instantly from the cache. */
export function useDynNav() {
  const { lang } = useI18n();
  const [items, setItems] = useState<DynItem[]>([]);
  useEffect(() => {
    if (memo) { // eslint-disable-next-line react-hooks/set-state-in-effect
      setItems(memo);
      return;
    }
    try { const c = JSON.parse(sessionStorage.getItem(KEY) || "null"); if (Array.isArray(c)) setItems(c); } catch { /* ignore */ }
    fetch(`${API}/nav`).then((r) => r.json()).then((j: { items?: DynItem[] }) => {
      memo = j.items || [];
      setItems(memo);
      try { sessionStorage.setItem(KEY, JSON.stringify(memo)); } catch { /* ignore */ }
    }).catch(() => undefined);
  }, []);
  const pick = (place: DynItem["place"]) => items.filter((i) => i.place === place).map((i) => ({ href: i.href, label: lang === "ar" ? i.labelAr || i.label : i.label }));
  return { resources: pick("resources"), top: pick("top"), footer: pick("footer") };
}
