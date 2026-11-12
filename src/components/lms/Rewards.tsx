"use client";
/** t441: Reward Cards (بطاقات المكافآت) — student wallet + Reward Shop, teacher award / approve, plan editor for admin and teachers allowed to plan. */
import { useCallback, useEffect, useMemo, useState } from "react";
import { AssessmentShell } from "@/components/assessment/AssessmentShell";
import { LmsStaffToolbar } from "@/components/lms/LmsEntry";
import { useLmsActor, useTr } from "@/components/lms/useLms";
import { lmsApi, lmsErrorText, lmsSession } from "@/lib/lms";
import { ExcellenceDesign, ExcellencePreview, EXC_DEFAULT, type CertWho, type ExcDesign } from "@/components/lms/ExcellenceCert";
import { StickerDesk } from "@/components/lms/Stickers";

const NAVY = "#1b3a57", GOLD = "#f5c542";
type Band = "a" | "b" | "c";
type Hist = { at: number; amt: number; label: string; kind: string; by: string; icon: string };
type Item = { id: string; name: string; nameAr: string; icon: string; cost: number; stock: number; bands: string; on: boolean; pos: number; kind?: string };
type Req = { id: string; item?: string; student: string; sname: string; cls: string; section?: string; name: string; icon: string; cost: number; status: string; by: string; note: string; at: number; subject?: string; year?: string; sticker?: string; kind?: string; choices?: string[] };
type Me = { on: boolean; band: Band; balance: number; lifetime: number; spent: number; history: Hist[]; shop: Item[]; requests: Req[]; rules: Record<string, number>; cap: number; labels: Record<string, [string, string]>; excellence?: string[]; stickers?: string[]; subjects?: string[]; name?: string; nameAr?: string; badge?: string; design?: ExcDesign };
type Plan = { on: boolean; deduct: boolean; legacy: boolean; resetAt: number; since: number; cap: Record<Band, number>; rules: Record<string, Record<Band, number>>; manualMax: number };
type Stu = { id: string; name: string; cls: string; section: string; band: Band; balance: number; lifetime: number };
type Staff = { acc: { view: boolean; add: boolean; edit: boolean; plan?: boolean }; plan: Plan; students: Stu[]; requests: Req[]; shop: Item[]; classes: string[]; labels: Record<string, [string, string]>; admin: boolean; design?: ExcDesign | null };

export const BANDS: [Band, string, string][] = [["a", "FS2 – Y2", "FS2 – Y2"], ["b", "Y3 – Y6", "Y3 – Y6"], ["c", "Y7 – Y13", "Y7 – Y13"]];
const LEVELS: [number, string, string, string][] = [[0, "Bronze", "برونزي", "🥉"], [50, "Silver", "فضي", "🥈"], [150, "Gold", "ذهبي", "🥇"], [300, "Platinum", "بلاتيني", "💎"], [600, "Noor Legend", "أسطورة النور", "🌟"]];
export const levelOf = (n: number) => { let i = 0; while (i + 1 < LEVELS.length && n >= LEVELS[i + 1][0]) i++; return { cur: LEVELS[i], next: LEVELS[i + 1] }; };
const btn = "rounded-full px-4 py-2 text-sm font-extrabold transition hover:scale-[1.02] disabled:opacity-50";
const gold = `${btn} text-[#1b3a57]`;
const inp = "rounded-xl border border-black/10 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-white/5";
const date = (t: number) => new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short" });
const granted = (s: string) => s === "approved" || s === "fulfilled";
const isExc = (r: Req, ids?: string[]) => r.kind === "excellence" || (ids || []).includes(r.item || "") || r.name === "Certificate of Excellence";
const isStk = (r: Req, ids?: string[]) => r.kind === "sticker" || (ids || []).includes(r.item || "") || r.name === "Sticker";

function AwardPanels({ me, onChange }: { me: Me; onChange: () => void }) {
  const { tr } = useTr();
  const [open, setOpen] = useState<Req | null>(null);
  const certs = me.requests.filter((r) => isExc(r, me.excellence) && granted(r.status));
  const sticks = me.requests.filter((r) => isStk(r, me.stickers));
  const locked = !!lmsSession()?.user.viewAs;
  const who = (r: Req): CertWho => ({ name: me.name || lmsSession()?.user.name || "", nameAr: me.nameAr, cls: r.cls, section: r.section, subject: r.subject || "", year: r.year || "", at: r.at });
  const refresh = () => { onChange(); window.dispatchEvent(new Event("sm-avatar")); };
  if (!certs.length && !sticks.some((s) => granted(s.status) || s.status === "pending")) return null;
  return (
    <section className="space-y-3" data-testid="my-awards">
      {certs.length > 0 && <h3 className="text-lg font-extrabold">📜 {tr("My certificates", "شهاداتي")}</h3>}
      {certs.map((r) => (
        <div key={r.id} className="flex flex-wrap items-center gap-2 rounded-2xl bg-white p-3 text-sm shadow-sm dark:bg-white/5">
          <span className="text-2xl" aria-hidden>{r.icon || "📜"}</span>
          <span className="min-w-0 flex-1"><b dir="auto">{tr("Certificate of Excellence", "شهادة تميز")}</b><span className="block text-xs opacity-70" dir="auto">{[r.subject, [r.cls, r.section].filter(Boolean).join(" "), r.year].filter(Boolean).join(" · ")}</span></span>
          {!locked && !r.subject && (me.subjects || []).length > 0 && (
            <select className={inp} aria-label={tr("Subject on the certificate", "المادة على الشهادة")} defaultValue="" onChange={(e) => { if (e.target.value) lmsApi.rc("subject", { id: r.id, subject: e.target.value }).then(onChange).catch(() => undefined); }}>
              <option value="">{tr("Add subject", "أضف المادة")}</option>
              {(me.subjects || []).map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
          <button type="button" className="rounded-full bg-[#1b3a57] px-3 py-1.5 text-xs font-bold text-[#f5c542]" data-testid="exc-open" onClick={() => setOpen(r)}>{tr("Open certificate", "افتح الشهادة")}</button>
        </div>
      ))}
      <StickerDesk items={sticks.map((s) => ({ id: s.id, at: s.at, sticker: s.sticker || "", status: s.status }))} badge={me.badge || ""} locked={locked} onChoose={async (id, code) => { await lmsApi.rc("sticker", { id, code }); refresh(); }} onWear={async (code) => { await lmsApi.rc("badge", { code }); refresh(); }} />
      {open && <ExcellencePreview who={who(open)} design={me.design || EXC_DEFAULT} onClose={() => setOpen(null)} />}
    </section>
  );
}

/** Certificates and stickers on the student's own account page. */
export function StudentAwards() {
  const [me, setMe] = useState<Me | null>(null);
  const load = useCallback(() => { lmsApi.rc<Me>("me", { sync: false }).then(setMe).catch(() => setMe(null)); }, []);
  useEffect(() => { load(); }, [load]);
  if (!me) return null;
  return <AwardPanels me={me} onChange={load} />;
}

function CardStack({ n, size = 64 }: { n: number; size?: number }) {
  return (
    <span className="relative inline-block" style={{ width: size, height: size * 1.3 }} aria-hidden>
      {[2, 1, 0].map((i) => (
        <span key={i} className="absolute inset-0 grid place-items-center rounded-xl border-2 font-black shadow-md" style={{ transform: `rotate(${(i - 1) * 8}deg) translate(${i * 3}px, ${-i * 2}px)`, background: i ? NAVY : `linear-gradient(135deg, ${GOLD}, #ffe9a3)`, borderColor: GOLD, color: NAVY, fontSize: size * 0.32 }}>{i ? "" : n > 999 ? "999+" : n}</span>
      ))}
    </span>
  );
}

/** Student dashboard card: balance, level and a link to the shop. */
export function RewardCardsTile() {
  const { tr } = useTr();
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => { lmsApi.rc<Me>("me").then(setMe).catch(() => undefined); }, []);
  if (!me || !me.on) return null;
  const { cur, next } = levelOf(me.lifetime);
  const pct = next ? Math.min(100, Math.round(((me.lifetime - cur[0]) / (next[0] - cur[0])) * 100)) : 100;
  return (
    <a href="/lms/rewards" className="flex items-center gap-4 rounded-3xl p-4 text-white shadow-lg ring-2 transition hover:-translate-y-0.5" style={{ background: `linear-gradient(135deg, ${NAVY}, #24507a)`, ["--tw-ring-color" as string]: GOLD }} data-testid="rc-tile">
      <CardStack n={me.balance} size={52} />
      <span className="min-w-0 flex-1">
        <b className="block text-lg" style={{ color: GOLD }}>{tr("My Reward Cards", "بطاقات المكافآت")}</b>
        <span className="block text-sm opacity-90">{tr(`${me.balance} cards to spend · ${cur[3]} ${cur[1]}`, `${me.balance} بطاقة للاستخدام · ${cur[3]} ${cur[2]}`)}</span>
        <span className="mt-1 block h-2 overflow-hidden rounded-full bg-white/20"><span className="block h-full rounded-full" style={{ width: `${pct}%`, background: GOLD }} /></span>
        {next && <span className="text-xs opacity-80">{tr(`${next[0] - me.lifetime} more to ${next[1]}`, `${next[0] - me.lifetime} للوصول إلى ${next[2]}`)}</span>}
      </span>
      <span className="rounded-full px-3 py-1.5 text-sm font-extrabold" style={{ background: GOLD, color: NAVY }}>{tr("Shop", "المتجر")} →</span>
    </a>
  );
}

function StudentView() {
  const { tr, lang } = useTr();
  const [me, setMe] = useState<Me | null>(null);
  const [msg, setMsg] = useState("");
  const [pick, setPick] = useState<Item | null>(null);
  const [pickSub, setPickSub] = useState("");
  const load = useCallback(() => lmsApi.rc<Me>("me").then(setMe).catch((e) => setMsg(lmsErrorText(e, tr))), [tr]);
  useEffect(() => { load(); }, [load]);
  if (!me) return <p className="p-8 text-center opacity-70">{msg || tr("Loading…", "جارٍ التحميل…")}</p>;
  const L = (k: string) => (me.labels[k] ? tr(...me.labels[k]) : k);
  const { cur, next } = levelOf(me.lifetime);
  const redeem = (it: Item, subject?: string) => { if (!confirm(tr(`Spend ${it.cost} cards on “${it.name}”?`, `استخدام ${it.cost} بطاقة لـ «${it.nameAr || it.name}»؟`))) return; lmsApi.rc("redeem", { item: it.id, ...(subject ? { subject } : {}) }).then(() => { setPick(null); setMsg(tr("Request sent! Your teacher will approve it. 🎉", "تم إرسال الطلب! سيوافق عليه معلمك. 🎉")); load(); }).catch((e) => setMsg(lmsErrorText(e, tr))); };
  const ask = (it: Item) => {
    const cert = it.kind === "excellence" || it.name === "Certificate of Excellence";
    if (cert && (me.subjects || []).length > 1) { setPick(it); setPickSub(""); return; }
    redeem(it, cert && me.subjects?.length === 1 ? me.subjects[0] : undefined);
  };
  const ST: Record<string, [string, string, string]> = { pending: ["Waiting", "بانتظار الموافقة", "bg-amber-100 text-amber-900"], approved: ["Approved", "تمت الموافقة", "bg-emerald-100 text-emerald-900"], fulfilled: ["Received", "تم الاستلام", "bg-sky-100 text-sky-900"], rejected: ["Not approved — cards returned", "مرفوض — أعيدت البطاقات", "bg-rose-100 text-rose-900"], cancelled: ["Cancelled", "ملغي", "bg-slate-100 text-slate-700"] };
  return (
    <div className="space-y-5">
      {!me.on && <p className="rounded-2xl bg-amber-100 px-4 py-3 text-amber-900">{tr("Reward Cards are paused by the school right now.", "بطاقات المكافآت متوقفة حاليًا.")}</p>}
      <section className="flex flex-wrap items-center gap-5 rounded-3xl p-5 text-white shadow-xl" style={{ background: `linear-gradient(135deg, ${NAVY}, #24507a)` }} data-testid="rc-wallet">
        <CardStack n={me.balance} size={80} />
        <div className="min-w-0 flex-1">
          <h2 className="text-2xl font-black" style={{ color: GOLD }}>{tr("My Reward Cards", "بطاقات المكافآت")}</h2>
          <p className="text-lg font-bold">{tr(`${me.balance} cards to spend`, `${me.balance} بطاقة للاستخدام`)}</p>
          <p className="text-sm opacity-85">{cur[3]} {tr(`${cur[1]} collector · ${me.lifetime} cards earned in total`, `جامع ${cur[2]} · ${me.lifetime} بطاقة مكتسبة`)}</p>
          {next && <p className="text-sm opacity-85">{tr(`${next[0] - me.lifetime} more cards to reach ${next[3]} ${next[1]}`, `${next[0] - me.lifetime} بطاقة للوصول إلى ${next[3]} ${next[2]}`)}</p>}
        </div>
      </section>
      {msg && <p className="rounded-2xl bg-sky-100 px-4 py-2 text-sky-900" role="status">{msg}</p>}
      <section className="glass rounded-3xl p-4">
        <h3 className="mb-2 text-lg font-extrabold">✨ {tr("How to earn cards", "كيف تكسب البطاقات")}</h3>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(me.rules).filter(([, v]) => v > 0).map(([k, v]) => <div key={k} className="flex items-center justify-between rounded-2xl bg-black/[0.03] px-3 py-2 text-sm dark:bg-white/5"><span>{L(k)}</span><b style={{ color: "#b8860b" }}>+{v} 🃏</b></div>)}
          <div className="flex items-center justify-between rounded-2xl bg-black/[0.03] px-3 py-2 text-sm dark:bg-white/5"><span>{tr("Helping, teamwork, effort in class", "المساعدة والعمل الجماعي والاجتهاد")}</span><b style={{ color: "#b8860b" }}>{tr("from your teacher", "من معلمك")}</b></div>
        </div>
        {me.cap > 0 && <p className="mt-2 text-xs opacity-70">{tr(`Up to ${me.cap} automatic cards a day — every effort counts!`, `حتى ${me.cap} بطاقة تلقائية يوميًا — كل جهد مهم!`)}</p>}
      </section>
      <section>
        <h3 className="mb-2 text-lg font-extrabold">🎁 {tr("Reward Shop", "متجر المكافآت")}</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {me.shop.map((it) => { const can = me.on && me.balance >= it.cost && it.stock !== 0; return (
            <div key={it.id} className="flex flex-col items-center gap-1 rounded-3xl border-2 bg-white p-3 text-center shadow-sm dark:bg-white/5" style={{ borderColor: can ? GOLD : "transparent" }} data-testid="rc-item">
              <span className="text-4xl" aria-hidden>{it.icon}</span>
              <b className="text-sm" dir="auto">{lang === "ar" && it.nameAr ? it.nameAr : it.name}</b>
              <span className="text-sm font-black" style={{ color: NAVY }}>🃏 {it.cost}</span>
              {it.stock >= 0 && <span className="text-xs opacity-60">{tr(`${it.stock} left`, `متبقٍ ${it.stock}`)}</span>}
              <button type="button" disabled={!can} onClick={() => ask(it)} className={gold} style={{ background: GOLD }}>{it.stock === 0 ? tr("Sold out", "نفد") : can ? tr("Get it", "اطلب") : tr(`Need ${it.cost - me.balance} more`, `تحتاج ${it.cost - me.balance}`)}</button>
            </div>); })}
          {!me.shop.length && <p className="opacity-70">{tr("The shop is empty for now.", "المتجر فارغ حاليًا.")}</p>}
        </div>
      </section>
      {me.requests.length > 0 && <section className="glass rounded-3xl p-4">
        <h3 className="mb-2 text-lg font-extrabold">📦 {tr("My requests", "طلباتي")}</h3>
        <ul className="space-y-1.5">{me.requests.map((r) => <li key={r.id} className="flex flex-wrap items-center gap-2 text-sm"><span>{r.icon}</span><b dir="auto">{r.name}</b><span className="opacity-70">🃏 {r.cost} · {date(r.at)}</span><span className={`rounded-full px-2 py-0.5 text-xs font-bold ${ST[r.status]?.[2] || ""}`}>{ST[r.status] ? tr(ST[r.status][0], ST[r.status][1]) : r.status}</span>{r.status === "pending" && <button type="button" className="text-xs underline" onClick={() => lmsApi.rc("cancel", { id: r.id }).then(load).catch(() => undefined)}>{tr("Cancel", "إلغاء")}</button>}{r.status === "pending" && isExc(r, me.excellence) && <span className="text-xs opacity-70">{tr("Your certificate opens after your teacher approves it.", "تُفتح شهادتك بعد موافقة معلمك.")}</span>}{r.status === "pending" && isStk(r, me.stickers) && <span className="text-xs opacity-70">{tr("You can choose your sticker after your teacher approves it.", "يمكنك اختيار الملصق بعد موافقة معلمك.")}</span>}</li>)}</ul>
      </section>}
      <AwardPanels me={me} onChange={load} />
      <section className="glass rounded-3xl p-4">
        <h3 className="mb-2 text-lg font-extrabold">🕘 {tr("Card history", "سجل البطاقات")}</h3>
        <ul className="divide-y divide-black/5 dark:divide-white/10">{me.history.map((h, i) => <li key={i} className="flex items-center gap-2 py-1.5 text-sm"><span aria-hidden>{h.icon}</span><span className="min-w-0 flex-1 truncate" dir="auto">{h.kind === "skill" || h.kind === "manual" ? h.label : h.kind === "spend" ? `${L("spend")}: ${h.label}` : `${L(h.kind)}${h.label ? " — " + h.label : ""}`}</span><span className="text-xs opacity-60">{date(h.at)}</span><b className={h.amt >= 0 ? "text-emerald-600" : "text-rose-600"}>{h.amt > 0 ? "+" : ""}{h.amt}</b></li>)}
          {!me.history.length && <li className="py-2 opacity-70">{tr("No cards yet — join in, hand in homework and practise your Quran to earn your first cards!", "لا توجد بطاقات بعد — شارك وسلّم واجباتك وتدرّب على القرآن لتكسب أولى بطاقاتك!")}</li>}
        </ul>
      </section>
      {pick && <div className="fixed inset-0 z-[2000] grid place-items-center bg-black/50 p-4" role="dialog" aria-modal="true" data-testid="exc-subject-pick">
        <div className="w-full max-w-md space-y-3 rounded-3xl bg-white p-5 dark:bg-[#13202e]">
          <h3 className="text-lg font-black">{tr("Which subject is this certificate for?", "لأي مادة هذه الشهادة؟")}</h3>
          <div className="flex flex-wrap gap-2">{(me.subjects || []).map((s) => <button key={s} type="button" className={`rounded-full px-3 py-1.5 text-sm font-bold ${pickSub === s ? "bg-[#1b3a57] text-[#f5c542]" : "bg-black/5"}`} onClick={() => setPickSub(s)}>{s}</button>)}</div>
          <div className="flex gap-2"><button type="button" className={gold} style={{ background: GOLD }} disabled={!pickSub} onClick={() => redeem(pick, pickSub)}>{tr("Request certificate", "اطلب الشهادة")}</button><button type="button" className={`${btn} bg-black/5`} onClick={() => setPick(null)}>{tr("Cancel", "إلغاء")}</button></div>
        </div>
      </div>}
    </div>
  );
}

function StaffView() {
  const { tr, lang } = useTr();
  const [d, setD] = useState<Staff | null>(null);
  const [tab, setTab] = useState("stu");
  const [cls, setCls] = useState("");
  const [sel, setSel] = useState<string[]>([]);
  const [amt, setAmt] = useState(2); const [why, setWhy] = useState("");
  const [msg, setMsg] = useState("");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [edit, setEdit] = useState<Partial<Item> | null>(null);
  const [open, setOpen] = useState<{ s: Stu; h: Hist[] } | null>(null);
  const [subDraft, setSubDraft] = useState<Record<string, string>>({});
  const load = useCallback((sync = false) => lmsApi.rc<Staff>("staff", { cls, sync }).then((r) => { setD(r); setPlan(r.plan); }).catch((e) => setMsg(lmsErrorText(e, tr))), [cls, tr]);
  useEffect(() => { load(true); }, [load]);
  const L = (k: string) => (d?.labels[k] ? tr(...d.labels[k]) : k);
  const pending = useMemo(() => (d?.requests || []).filter((r) => r.status === "pending").length, [d]);
  if (!d) return <p className="p-8 text-center opacity-70">{msg || tr("Loading…", "جارٍ التحميل…")}</p>;
  const award = () => lmsApi.rc("award", { students: sel, amt, label: why }).then(() => { setMsg(tr(`Awarded ${amt} cards to ${sel.length} student(s).`, `تم منح ${amt} بطاقة لـ ${sel.length} طالب.`)); setSel([]); setWhy(""); load(); }).catch((e) => setMsg(lmsErrorText(e, tr)));
  const decide = (id: string, status: string, subject?: string) => lmsApi.rc("decide", { id, status, ...(subject ? { subject } : {}) }).then(() => load()).catch((e) => setMsg(lmsErrorText(e, tr)));
  const savePlan = () => plan && lmsApi.rc<{ plan: Plan }>("plan-save", { plan }).then((r) => { setPlan(r.plan); setMsg(tr("Plan saved.", "تم حفظ الخطة.")); load(); }).catch((e) => setMsg(lmsErrorText(e, tr)));
  const saveItem = () => edit && lmsApi.rc("shop-save", edit as Record<string, unknown>).then(() => { setEdit(null); load(); }).catch((e) => setMsg(lmsErrorText(e, tr)));
  const canPlan = d.admin || !!d.acc.plan;
  const tabs: [string, string, string, boolean][] = [["stu", "Students", "الطلاب", true], ["req", `Requests${pending ? ` (${pending})` : ""}`, `الطلبات${pending ? ` (${pending})` : ""}`, true], ["plan", "Plan", "الخطة", canPlan], ["shop", "Shop items", "عناصر المتجر", canPlan], ["cert", "Certificate", "الشهادة", !!d.design]];
  const ST: Record<string, string> = { pending: "bg-amber-100 text-amber-900", approved: "bg-emerald-100 text-emerald-900", fulfilled: "bg-sky-100 text-sky-900", rejected: "bg-rose-100 text-rose-900", cancelled: "bg-slate-100 text-slate-700" };
  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center gap-3 rounded-3xl p-4 text-white" style={{ background: `linear-gradient(135deg, ${NAVY}, #24507a)` }}>
        <CardStack n={d.students.reduce((n, s) => n + s.balance, 0)} size={44} />
        <div className="flex-1"><h2 className="text-xl font-black" style={{ color: GOLD }}>{tr("Reward Cards", "بطاقات المكافآت")}</h2><p className="text-sm opacity-85">{tr("Effort-based cards for every learner, FS2 – Y13. Classes / Spin points go into the same wallet.", "بطاقات للجهد لكل متعلم من FS2 إلى Y13. نقاط الصفوف والعجلة تُضاف للمحفظة نفسها.")}</p></div>
        {!d.plan.on && <span className="rounded-full bg-rose-500 px-3 py-1 text-xs font-bold">{tr("OFF", "متوقف")}</span>}
      </header>
      <nav className="flex flex-wrap gap-2">{tabs.filter((t) => t[3]).map(([k, en, ar]) => <button key={k} type="button" onClick={() => setTab(k)} className={btn} style={tab === k ? { background: GOLD, color: NAVY } : { background: "rgba(27,58,87,.08)" }} data-testid={`rc-tab-${k}`}>{tr(en, ar)}</button>)}</nav>
      {msg && <p className="rounded-2xl bg-sky-100 px-4 py-2 text-sky-900" role="status">{msg}</p>}
      {tab === "stu" && <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <select className={inp} value={cls} onChange={(e) => { setCls(e.target.value); setSel([]); }} aria-label={tr("Class", "الصف")}><option value="">{tr("All my students", "كل طلابي")}</option>{d.classes.map((c) => <option key={c}>{c}</option>)}</select>
          <button type="button" className={btn} style={{ background: "rgba(27,58,87,.08)" }} onClick={() => setSel(sel.length === d.students.length ? [] : d.students.map((s) => s.id))}>{sel.length === d.students.length && sel.length ? tr("Clear", "مسح") : tr("Select all", "تحديد الكل")}</button>
        </div>
        {d.acc.add && sel.length > 0 && <div className="flex flex-wrap items-center gap-2 rounded-2xl p-3" style={{ background: "rgba(245,197,66,.18)" }}>
          <b>{tr(`${sel.length} selected`, `${sel.length} محدد`)}</b>
          <select className={inp} value={amt} onChange={(e) => setAmt(Number(e.target.value))}>{Array.from({ length: d.plan.manualMax * 2 + (d.plan.deduct ? d.plan.manualMax : 0) }, (_, i) => (d.plan.deduct ? -d.plan.manualMax : 1) + i).filter((n) => n !== 0 && n <= d.plan.manualMax * 2).map((n) => <option key={n} value={n}>{n > 0 ? "+" : ""}{n} 🃏</option>)}</select>
          <input className={inp} placeholder={tr("Reason (e.g. personal best)", "السبب (مثل أفضل إنجاز شخصي)")} value={why} onChange={(e) => setWhy(e.target.value)} maxLength={60} />
          <button type="button" className={gold} style={{ background: GOLD }} onClick={award} data-testid="rc-award">{tr("Award cards", "منح البطاقات")}</button>
        </div>}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">{d.students.map((s) => { const on = sel.includes(s.id); return (
          <div key={s.id} className="rounded-2xl border-2 bg-white p-2 text-sm shadow-sm dark:bg-white/5" style={{ borderColor: on ? GOLD : "transparent" }}>
            <label className="flex cursor-pointer items-start gap-2">{d.acc.add && <input type="checkbox" checked={on} onChange={() => setSel(on ? sel.filter((x) => x !== s.id) : [...sel, s.id])} />}<span className="min-w-0 flex-1"><b className="block truncate" dir="auto">{s.name}</b><span className="text-xs opacity-60">{s.cls}{s.section ? ` ${s.section}` : ""} · {levelOf(s.lifetime).cur[3]}</span></span></label>
            <button type="button" className="mt-1 flex w-full items-center justify-between rounded-xl px-2 py-1 font-black" style={{ background: "rgba(27,58,87,.07)", color: NAVY }} onClick={() => lmsApi.rc<{ history: Hist[] }>("student", { id: s.id }).then((r) => setOpen({ s, h: r.history })).catch(() => undefined)}>🃏 {s.balance}<span className="text-xs font-normal opacity-60">{tr("history", "السجل")}</span></button>
          </div>); })}
          {!d.students.length && <p className="opacity-70">{tr("No students in your scope.", "لا يوجد طلاب.")}</p>}
        </div>
      </section>}
      {open && <div className="fixed inset-0 z-[2000] grid place-items-center bg-black/50 p-4" onMouseDown={(e) => e.target === e.currentTarget && setOpen(null)} role="dialog" aria-modal="true">
        <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-3xl bg-white p-5 dark:bg-[#13202e]"><h3 className="mb-2 text-lg font-black">{open.s.name} · 🃏 {open.s.balance}</h3>
          <ul className="divide-y divide-black/5 text-sm">{open.h.map((h, i) => <li key={i} className="flex gap-2 py-1"><span>{h.icon}</span><span className="flex-1" dir="auto">{h.kind === "skill" || h.kind === "manual" || h.kind === "spend" ? h.label : L(h.kind) + (h.label ? ` — ${h.label}` : "")}{h.by && h.by !== "auto" ? <span className="opacity-50"> · {h.by}</span> : null}</span><span className="opacity-60">{date(h.at)}</span><b className={h.amt >= 0 ? "text-emerald-600" : "text-rose-600"}>{h.amt > 0 ? "+" : ""}{h.amt}</b></li>)}</ul>
          <button type="button" className={`${gold} mt-3`} style={{ background: GOLD }} onClick={() => setOpen(null)}>{tr("Close", "إغلاق")}</button></div></div>}
      {tab === "req" && <section className="space-y-2">{d.requests.map((r) => {
        const cert = isExc(r);
        const subject = subDraft[r.id] ?? r.subject ?? "";
        return (
        <div key={r.id} className="flex flex-wrap items-center gap-2 rounded-2xl bg-white p-3 text-sm shadow-sm dark:bg-white/5"><span className="text-2xl">{r.icon}</span><span className="min-w-0 flex-1"><b dir="auto">{r.sname}</b> <span className="opacity-60">{r.cls}</span><br /><span dir="auto">{r.name}</span> · 🃏 {r.cost} · {date(r.at)}{cert && r.subject ? <span className="block text-xs opacity-70" dir="auto">{r.subject}{r.year ? ` · ${r.year}` : ""}</span> : null}</span>
          {cert && r.status !== "rejected" && r.status !== "cancelled" && <label className="flex items-center gap-1 text-xs font-bold">{tr("Subject", "المادة")}<input className={`${inp} w-40`} list={`rc-sub-${r.id}`} value={subject} onChange={(e) => setSubDraft({ ...subDraft, [r.id]: e.target.value })} aria-label={tr("Awarding subject", "مادة المنح")} /><datalist id={`rc-sub-${r.id}`}>{(r.choices || []).map((c) => <option key={c} value={c} />)}</datalist>{r.status !== "pending" && d.acc.edit && <button type="button" className="underline" onClick={() => subject && lmsApi.rc("subject", { id: r.id, subject }).then(() => load()).catch((e) => setMsg(lmsErrorText(e, tr)))}>{tr("Save", "حفظ")}</button>}</label>}
          <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${ST[r.status] || ""}`}>{r.status}{r.by ? ` · ${r.by}` : ""}</span>
          {d.acc.edit && r.status === "pending" && <><button type="button" className={gold} style={{ background: GOLD }} onClick={() => decide(r.id, "approved", cert ? subject : undefined)}>{tr("Approve", "موافقة")}</button><button type="button" className={`${btn} bg-rose-100 text-rose-900`} onClick={() => decide(r.id, "rejected")}>{tr("Decline (refund)", "رفض (استرجاع)")}</button></>}
          {d.acc.edit && r.status === "approved" && <button type="button" className={`${btn} bg-sky-100 text-sky-900`} onClick={() => decide(r.id, "fulfilled")}>{tr("Mark given", "تم التسليم")}</button>}
        </div>); })}
        {!d.requests.length && <p className="opacity-70">{tr("No requests yet.", "لا توجد طلبات.")}</p>}
        {!d.acc.edit && <p className="text-xs opacity-60">{tr("Approving requests needs the Rewards “Edit” permission.", "الموافقة تحتاج صلاحية التعديل للمكافآت.")}</p>}
      </section>}
      {tab === "plan" && plan && canPlan && <section className="space-y-3 rounded-3xl bg-white p-4 shadow-sm dark:bg-white/5">
        <div className="flex flex-wrap gap-4 text-sm">
          {([["on", "Reward Cards on", "تفعيل البطاقات"], ["deduct", "Allow deductions (−) for behaviour", "السماح بالخصم للسلوك"], ["legacy", "Count Classes / Spin / Behaviour points in the wallet", "احتساب نقاط الصفوف والعجلة والسلوك"]] as const).map(([k, en, ar]) => <label key={k} className="flex items-center gap-2 font-bold"><input type="checkbox" checked={plan[k]} onChange={(e) => setPlan({ ...plan, [k]: e.target.checked })} />{tr(en, ar)}</label>)}
          <label className="flex items-center gap-2 font-bold">{tr("Max manual award", "أقصى منح يدوي")}<input type="number" min={1} max={50} className={`${inp} w-20`} value={plan.manualMax} onChange={(e) => setPlan({ ...plan, manualMax: Number(e.target.value) })} /></label>
        </div>
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr style={{ background: NAVY, color: "#fff" }}><th className="p-2 text-start">{tr("Earn rule (cards)", "قاعدة الكسب")}</th>{BANDS.map(([b, en]) => <th key={b} className="p-2">{en}</th>)}</tr></thead>
          <tbody>{Object.keys(plan.rules).map((k) => <tr key={k} className="border-b border-black/5"><td className="p-2">{L(k)}</td>{BANDS.map(([b]) => <td key={b} className="p-1 text-center"><input type="number" min={0} max={50} className={`${inp} w-16 text-center`} value={plan.rules[k][b]} onChange={(e) => setPlan({ ...plan, rules: { ...plan.rules, [k]: { ...plan.rules[k], [b]: Number(e.target.value) } } })} /></td>)}</tr>)}
            <tr style={{ background: "rgba(245,197,66,.18)" }}><td className="p-2 font-bold">{tr("Daily cap on automatic cards (0 = none)", "الحد اليومي للبطاقات التلقائية (0 = بلا حد)")}</td>{BANDS.map(([b]) => <td key={b} className="p-1 text-center"><input type="number" min={0} max={500} className={`${inp} w-16 text-center`} value={plan.cap[b]} onChange={(e) => setPlan({ ...plan, cap: { ...plan.cap, [b]: Number(e.target.value) } })} /></td>)}</tr></tbody></table></div>
        <p className="text-xs opacity-70">{tr("Teacher Skills (My Classes / Spin) keep their own +/− values and land in the same wallet. Ability-friendly: every band earns for effort (hand-in, joining in, practice), not only top marks.", "مهارات المعلم (صفوفي / العجلة) تحتفظ بقيمها وتضاف للمحفظة نفسها. الكسب مبني على الجهد لكل المستويات.")}</p>
        <div className="flex flex-wrap gap-2"><button type="button" className={gold} style={{ background: GOLD }} onClick={savePlan} data-testid="rc-plan-save">{tr("Save plan", "حفظ الخطة")}</button>
          {d.admin && <button type="button" className={`${btn} bg-rose-100 text-rose-900`} onClick={() => confirm(tr("Start a new term? Every balance goes back to 0 (history is kept).", "بدء فصل جديد؟ ستعود الأرصدة إلى 0 (يبقى السجل).")) && lmsApi.rc("reset").then(() => { setMsg(tr("New term started — balances reset.", "بدأ فصل جديد.")); load(); }).catch(() => undefined)}>{tr("Term reset", "إعادة ضبط الفصل")}</button>}
          {d.plan.resetAt > 0 && <span className="self-center text-xs opacity-60">{tr("Last reset", "آخر إعادة ضبط")}: {new Date(d.plan.resetAt).toLocaleDateString()}</span>}</div>
      </section>}
      {tab === "cert" && d.design && <ExcellenceDesign design={d.design} />}
      {tab === "shop" && canPlan && <section className="space-y-2">
        <button type="button" className={gold} style={{ background: GOLD }} onClick={() => setEdit({ name: "", nameAr: "", icon: "🎁", cost: 20, stock: -1, bands: "abc", on: true, pos: 50 })}>+ {tr("Add item", "إضافة عنصر")}</button>
        {d.shop.map((it) => <div key={it.id} className={`flex flex-wrap items-center gap-2 rounded-2xl bg-white p-3 text-sm shadow-sm dark:bg-white/5 ${it.on ? "" : "opacity-50"}`}><span className="text-2xl">{it.icon}</span><b className="flex-1" dir="auto">{lang === "ar" && it.nameAr ? it.nameAr : it.name}</b>{it.kind === "excellence" && <span className="rounded-full bg-[#1b3a57] px-2 py-0.5 text-xs font-bold text-[#f5c542]">{tr("Certificate", "شهادة")}</span>}{it.kind === "sticker" && <span className="rounded-full bg-[#f5c542] px-2 py-0.5 text-xs font-bold text-[#1b3a57]">{tr("Sticker", "ملصق")}</span>}<span>🃏 {it.cost}</span><span className="opacity-60">{it.stock < 0 ? "∞" : it.stock} · {BANDS.filter(([b]) => it.bands.includes(b)).map((x) => x[1]).join(", ")}</span><button type="button" className="underline" onClick={() => setEdit(it)}>{tr("Edit", "تعديل")}</button><button type="button" className="text-rose-600 underline" onClick={() => confirm(tr("Delete item?", "حذف العنصر؟")) && lmsApi.rc("shop-delete", { id: it.id }).then(() => load())}>{tr("Delete", "حذف")}</button></div>)}
      </section>}
      {edit && canPlan && <div className="fixed inset-0 z-[2000] grid place-items-center bg-black/50 p-4" role="dialog" aria-modal="true"><div className="w-full max-w-md space-y-2 rounded-3xl bg-white p-5 dark:bg-[#13202e]">
        <h3 className="text-lg font-black">{edit.id ? tr("Edit item", "تعديل عنصر") : tr("New item", "عنصر جديد")}</h3>
        <div className="flex gap-2"><input className={`${inp} w-16 text-center`} value={edit.icon || ""} onChange={(e) => setEdit({ ...edit, icon: e.target.value })} aria-label="icon" /><input className={`${inp} flex-1`} placeholder="Name (English)" value={edit.name || ""} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></div>
        <input className={`${inp} w-full`} dir="rtl" placeholder="الاسم بالعربية" value={edit.nameAr || ""} onChange={(e) => setEdit({ ...edit, nameAr: e.target.value })} />
        <div className="flex flex-wrap gap-3 text-sm"><label>{tr("Cost", "السعر")} <input type="number" min={1} className={`${inp} w-20`} value={edit.cost} onChange={(e) => setEdit({ ...edit, cost: Number(e.target.value) })} /></label><label>{tr("Stock (−1 = unlimited)", "المخزون (−1 = غير محدود)")} <input type="number" min={-1} className={`${inp} w-20`} value={edit.stock} onChange={(e) => setEdit({ ...edit, stock: Number(e.target.value) })} /></label><label>{tr("Order", "الترتيب")} <input type="number" className={`${inp} w-16`} value={edit.pos} onChange={(e) => setEdit({ ...edit, pos: Number(e.target.value) })} /></label></div>
        <div className="flex flex-wrap gap-3 text-sm">{BANDS.map(([b, en]) => <label key={b} className="flex items-center gap-1"><input type="checkbox" checked={(edit.bands || "").includes(b)} onChange={(e) => setEdit({ ...edit, bands: e.target.checked ? (edit.bands || "") + b : (edit.bands || "").replace(b, "") })} />{en}</label>)}<label className="flex items-center gap-1"><input type="checkbox" checked={edit.on !== false} onChange={(e) => setEdit({ ...edit, on: e.target.checked })} />{tr("Visible", "ظاهر")}</label></div>
        <label className="block text-sm font-bold">{tr("Reward type", "نوع المكافأة")}<select className={`${inp} mt-1 w-full`} value={edit.kind || ""} onChange={(e) => setEdit({ ...edit, kind: e.target.value })} data-testid="rc-item-excellence"><option value="">{tr("Shop reward", "مكافأة المتجر")}</option><option value="excellence">{tr("Excellence Certificate", "شهادة التميز")}</option><option value="sticker">{tr("Sticker", "ملصق")}</option></select></label>
        <div className="flex gap-2"><button type="button" className={gold} style={{ background: GOLD }} onClick={saveItem}>{tr("Save", "حفظ")}</button><button type="button" className={`${btn} bg-black/5`} onClick={() => setEdit(null)}>{tr("Cancel", "إلغاء")}</button></div>
      </div></div>}
    </div>
  );
}

export function AdminRewards() {
  return (
    <div className="mx-auto w-full max-w-6xl" data-testid="rc-admin">
      <StaffView />
    </div>
  );
}

export function RewardsPage() {
  const { tr } = useTr();
  const { actor, ready, adminElsewhere } = useLmsActor();
  const staff = actor?.role === "admin" || actor?.role === "teacher";
  const asAdmin = !actor && adminElsewhere;
  return (
    <AssessmentShell title={tr("Reward Cards", "بطاقات المكافآت")} exitHref="/lms" wide toolbar={actor ? <LmsStaffToolbar /> : undefined}>
      <div className="mx-auto w-full max-w-6xl flex-1 px-3 py-5 sm:px-6" data-testid="rc-page">
        {!ready ? <p className="p-8 text-center opacity-70">{tr("Loading…", "جارٍ التحميل…")}</p>
          : asAdmin || (staff && (actor!.role === "admin" || actor!.mods?.rw?.view)) ? <StaffView />
          : !actor ? <p className="rounded-2xl bg-amber-100 px-4 py-3 text-amber-900"><a className="font-bold underline" href="/lms/login">{tr("Please sign in", "سجّل الدخول")}</a></p>
          : staff ? <p className="rounded-2xl bg-amber-100 px-4 py-3 text-amber-900">{tr("Reward Cards are not switched on for your account. Ask the admin (Permissions → Rewards).", "بطاقات المكافآت غير مفعّلة لحسابك. اطلب من الإدارة.")}</p>
          : actor.role === "student" ? <StudentView /> : null}
      </div>
    </AssessmentShell>
  );
}
