"use client";

import { siteConfig } from "@/content/site";
import { useEffect, useState } from "react";
import { activityApi, ACTIVITY_LABELS, loadHosted, saveHosted, type HostedActivity } from "@/lib/activity";
import { qrSvg } from "@/lib/qrLocal";
import { RosterLoader } from "@/components/lms/Audience";
import { useI18n } from "@/lib/i18n";

const NAMES_KEY = "sm_class_names_v1";
const IDS_KEY = "sm_class_ids_v1";
/** t420: roster student id for a name loaded from "my groups" (null for typed / lobby names). */
export function rosterIdFor(name: string): string | null {
  try { const m = JSON.parse(localStorage.getItem(IDS_KEY) || "{}"); return typeof m[name] === "string" ? m[name] : null; } catch { return null; }
}
export function clearRosterIds() { try { localStorage.removeItem(IDS_KEY); } catch { /* */ } }
/** t432: name→studentId map so Spin/Randomiser popups can award points after a My Classes launch. */
export function saveRosterIds(map: Record<string, string>) {
  try {
    const clean: Record<string, string> = {};
    for (const [k, v] of Object.entries(map || {})) if (k && typeof v === "string" && v) clean[k] = v;
    localStorage.setItem(IDS_KEY, JSON.stringify(clean));
  } catch { /* */ }
}

export function loadNames(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(NAMES_KEY) || "[]");
    return Array.isArray(v) ? v.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}
export function saveNames(names: string[]) {
  try {
    localStorage.setItem(NAMES_KEY, JSON.stringify(names.slice(0, 300)));
  } catch {
    // ignore
  }
}
export const parseNames = (text: string) =>
  [...new Set(text.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean))].slice(0, 300);

/** Cryptographically fair random integer in [0, n). */
export function randInt(n: number): number {
  if (n <= 1) return 0;
  const max = Math.floor(0xffffffff / n) * n;
  const buf = new Uint32Array(1);
  do crypto.getRandomValues(buf);
  while (buf[0] >= max);
  return buf[0] % n;
}
export function shuffled<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Class list editor shared by the wheel and the randomiser: type names, or pull them from a live activity. */
export function ClassNames({ names, setNames, hideNames = [] }: { names: string[]; setNames: (n: string[]) => void; hideNames?: string[] }) {
  const { lang } = useI18n();
  const tr = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const visible = hideNames.length ? names.filter((n) => !hideNames.includes(n)) : names;
  const visKey = visible.join("\n");
  const [text, setText] = useState(visKey);
  const [hosted, setHosted] = useState<HostedActivity[]>([]);
  const [pick, setPick] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHosted(loadHosted());
  }, []);
  useEffect(() => {
    // Keep the box in sync when names change elsewhere (e.g. a winner is removed).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setText((t) => (parseNames(t).join("\n") === visKey ? t : visKey));
  }, [visKey]);

  const apply = (list: string[]) => {
    setNames(list);
    saveNames(list);
  };

  // t304: "Start with random people" — open a join lobby (code + QR, joined via the site's Join button); names arrive live.
  const [lobby, setLobby] = useState<{ code: string; hostKey: string } | null>(null);
  const openLobby = async () => {
    setMsg("");
    try {
      const r = await activityApi.create({ type: "wall", title: tr("Join the class list", "انضم إلى قائمة الصف"), prompt: tr("Type your name to join", "اكتب اسمك للانضمام") });
      saveHosted({ code: r.code, hostKey: r.hostKey, type: "wall", title: r.title, createdAt: r.createdAt, expiresAt: r.expiresAt });
      setLobby({ code: r.code, hostKey: r.hostKey }); clearRosterIds(); apply([]); setText("");
    } catch { setMsg(tr("Couldn't open a join code — sign in as a teacher first.", "تعذر فتح رمز الانضمام — سجّل الدخول كمعلم أولًا.")); }
  };
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("lobby") === "1") openLobby();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!lobby) return;
    let stop = false;
    const tick = async () => {
      try {
        const st = await activityApi.state(lobby.code, { hostKey: lobby.hostKey });
        if (!stop && !("same" in st)) { const list = [...new Set(st.participants.filter((p) => !p.removed).map((p) => p.name))]; setNames(list); saveNames(list); setText(list.join("\n")); }
      } catch { /* */ }
    };
    tick(); const iv = setInterval(tick, 3000);
    return () => { stop = true; clearInterval(iv); };
  }, [lobby, setNames]);

  return (
    <div className="glass rounded-3xl p-4" data-testid="class-names">
      {lobby ? (
        <div className="mb-3 flex flex-wrap items-center gap-4 rounded-2xl bg-sun/30 p-3" data-testid="lobby">
          <span className="rounded-xl bg-white p-1" dangerouslySetInnerHTML={{ __html: qrSvg(`${window.location.origin}/join?code=${lobby.code}`, 132) }} data-testid="lobby-qr" />
          <div className="min-w-0">
            <p className="text-sm font-bold">{tr(`Join at ${siteConfig.domain} → Join, code:`, `انضم من ${siteConfig.domain} ← انضم، الرمز:`)}</p>
            <p className="font-mono text-4xl font-black tracking-widest" data-testid="lobby-code">{lobby.code}</p>
            <p className="text-sm">{tr(`${names.length} joined`, `انضم ${names.length}`)}</p>
            <button type="button" className="mt-1 rounded-full bg-header px-3 py-1 text-xs font-bold text-sun" onClick={() => setLobby(null)} data-testid="lobby-close">{tr("Close joining", "إيقاف الانضمام")}</button>
          </div>
        </div>
      ) : (
        <button type="button" className="mb-3 rounded-full bg-sun px-4 py-1.5 text-sm font-bold text-[#0b1b2b]" onClick={openLobby} data-testid="lobby-open">🙋 {tr("Start with random people (code / QR)", "ابدأ مع أشخاص عشوائيين (رمز / QR)")}</button>
      )}
      <label className="block text-sm font-bold" htmlFor="class-names-text">
        {tr("Names (one per line)", "الأسماء (اسم في كل سطر)")} · <span className="tabular-nums">{visible.length}</span>
      </label>
      <textarea
        id="class-names-text"
        className="mt-2 min-h-40 w-full rounded-2xl border-2 border-navy/15 bg-white px-3 py-2 text-base outline-none focus:border-sun-border dark:border-white/15 dark:bg-black/20"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const typed = parseNames(e.target.value);
          const kept = hideNames.filter((n) => names.includes(n) && !typed.includes(n));
          apply([...typed, ...kept]);
        }}
        placeholder={tr("Aisha\nBilal\nMaryam", "عائشة\nبلال\nمريم")}
        dir="auto"
        data-testid="class-names-text"
      />
      <RosterLoader onNames={(l) => { apply(l); setText(l.join("\n")); setMsg(tr(`${l.length} names loaded.`, `تم تحميل ${l.length} اسمًا.`)); }} />
      {hosted.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <select className="min-w-0 flex-1 rounded-full border border-black/10 bg-white/80 px-3 py-1.5 dark:border-white/15 dark:bg-black/30" value={pick} onChange={(e) => setPick(e.target.value)} aria-label={tr("Live activity", "نشاط مباشر")}>
            <option value="">{tr("Pull names from a live activity…", "جلب الأسماء من نشاط مباشر…")}</option>
            {hosted.map((h) => (
              <option key={h.code} value={h.code}>
                {ACTIVITY_LABELS[h.type].icon} {h.title || h.code} ({h.code})
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!pick}
            className="rounded-full bg-header px-3 py-1.5 font-bold text-sun disabled:opacity-50"
            onClick={async () => {
              const h = hosted.find((x) => x.code === pick);
              if (!h) return;
              try {
                const s = await activityApi.state(h.code, { hostKey: h.hostKey });
                if ("same" in s) return;
                const list = [...new Set(s.participants.filter((p) => !p.removed).map((p) => p.name))];
                apply(list);
                setText(list.join("\n"));
                setMsg(tr(`${list.length} names added.`, `أضيف ${list.length} اسمًا.`));
              } catch {
                setMsg(tr("Couldn't load that activity.", "تعذر تحميل هذا النشاط."));
              }
            }}
          >
            {tr("Use", "استخدم")}
          </button>
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2 text-sm">
        <button type="button" className="rounded-full border border-black/10 px-3 py-1 dark:border-white/15" onClick={() => { const l = shuffled(names); apply(l); setText(l.join("\n")); }}>
          🔀 {tr("Shuffle", "خلط")}
        </button>
        <button type="button" className="rounded-full border border-black/10 px-3 py-1 text-rose-600 dark:border-white/15" onClick={() => { if (confirm(tr("Clear all names?", "مسح كل الأسماء؟"))) { clearRosterIds(); apply([]); setText(""); } }}>
          {tr("Clear", "مسح")}
        </button>
      </div>
      {msg && <p className="mt-2 text-sm font-semibold" role="status">{msg}</p>}
    </div>
  );
}
