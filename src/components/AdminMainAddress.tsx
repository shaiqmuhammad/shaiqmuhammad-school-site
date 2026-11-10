"use client";

/**
 * Admin → Site & branding → Main address: one-click switch of the address used in QR codes, join links,
 * timetable links, email links and the canonical URL. Each known address shows a live status chip
 * (checked by the server: does it open THIS website, and does the server accept it).
 * Optionally applies a branding preset (name + colours) together with the switch.
 */
import { useCallback, useEffect, useState } from "react";
import { securityCall } from "@/lib/adminServer";
import { useI18n } from "@/lib/i18n";
import { DEFAULT_HOST, IS_SCHOOL, SITE_ADDRESSES } from "@/lib/deployment";
import { allPresets, cacheIdentity, cachedIdentity, emptyIdentity, normalizeIdentity, type SiteIdentity } from "@/lib/siteIdentity";

type HostRow = { host: string; own: boolean; serves: boolean; accepted: boolean };
type Status = { main: string; defaultMain: string; hosts: HostRow[] };

const btn = "rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50";
const btn2 = "rounded-full border border-card-border px-3 py-1.5 text-sm font-semibold hover:bg-black/[0.04] dark:hover:bg-white/10 disabled:opacity-50";

export default function AdminMainAddress({ saved, onSaved }: { saved: SiteIdentity; onSaved: (v: SiteIdentity) => void }) {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const tr = (en: string, a: string) => (ar ? a : en);
  const [st, setSt] = useState<Status | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [preset, setPreset] = useState("");
  const [help, setHelp] = useState("");
  const [extra, setExtra] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const r = await securityCall<Status>("domain-status", {});
    setLoading(false);
    if (r.ok && Array.isArray(r.hosts)) setSt({ main: r.main || "", defaultMain: r.defaultMain || "", hosts: r.hosts });
    else setMsg({ ok: false, text: tr(`Couldn't check the addresses (${r.error || r.status}).`, `تعذّر فحص العناوين (${r.error || r.status}).`) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- live status is fetched after mount
  useEffect(() => { void load(); }, [load]);

  const main = saved.canonical || st?.defaultMain || DEFAULT_HOST;
  const presets = allPresets(saved);
  const known = [...new Set([...(st?.hosts.map((h) => h.host) || []), ...SITE_ADDRESSES])];
  const rowOf = (h: string): HostRow => st?.hosts.find((x) => x.host === h) || { host: h, own: false, serves: false, accepted: false };

  async function makeMain(host: string) {
    const isDefault = host === (st?.defaultMain || DEFAULT_HOST);
    setBusy(host); setMsg(null);
    // 1) Branding preset first (only if chosen), keeping the address.
    const p = presets.find((x) => x.id === preset);
    let cur = saved;
    if (p) {
      const next = { ...saved, nameEn: p.nameEn, nameAr: p.nameAr, taglineEn: p.taglineEn, taglineAr: p.taglineAr, theme: p.theme };
      const b = await securityCall<{ brand: unknown }>("brand-save", { brand: next });
      if (!(b.ok && b.brand)) { setBusy(""); setMsg({ ok: false, text: tr(`Couldn't apply the branding (${b.error || b.status}). Nothing was switched.`, `تعذّر تطبيق الهوية (${b.error || b.status}). لم يتغير شيء.`) }); return; }
      cur = normalizeIdentity(b.brand);
    }
    // 2) The address (the server saves it only if it really opens this website).
    const r = await securityCall<{ brand: unknown; domain: string }>("domain-check", isDefault ? { clear: true } : { domain: host });
    setBusy("");
    if (r.ok && r.brand) {
      const v = normalizeIdentity(r.brand);
      const merged = { ...cur, canonical: v.canonical };
      onSaved(merged); cacheIdentity({ ...(cachedIdentity() || emptyIdentity), ...merged });
      setMsg({ ok: true, text: tr(`Done. ${host} is now the main address: new QR codes, join links, timetable links and email links use it straight away${p ? `, with the "${p.label}" name and colours` : ""}. Printed QR codes with the old address keep working.`, `تم. أصبح ${host} العنوان الرئيسي: رموز QR الجديدة وروابط الانضمام والجدول والبريد تستخدمه فورًا${p ? ` مع اسم وألوان "${p.label}"` : ""}. رموز QR المطبوعة بالعنوان القديم تبقى تعمل.`) });
      void load();
    } else if (r.error === "not_connected") {
      setMsg({ ok: false, text: tr(`${host} doesn't open this website yet, so nothing was switched. Connect it first (steps below).`, `${host} لا يفتح هذا الموقع بعد، فلم يتغير شيء. اربطه أولًا (الخطوات أدناه).`) });
      setHelp(host); void load();
    } else setMsg({ ok: false, text: tr(`Couldn't switch (${r.error || r.status}). Sign in again and retry.`, `تعذّر التبديل (${r.error || r.status}). سجّل الدخول مجددًا وحاول.`) });
  }

  const chip = (r: HostRow) => {
    if (!st) return <span className="rounded-full bg-black/5 px-2 py-0.5 text-xs dark:bg-white/10">{tr("checking…", "جارٍ الفحص…")}</span>;
    if (r.serves && r.accepted) return <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200" data-testid="addr-chip-on">✓ {tr("Connected", "متصل")}</span>;
    if (r.serves) return <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">{tr("Opens the site, not allowed yet", "يفتح الموقع، غير مسموح بعد")}</span>;
    return <span className="rounded-full bg-black/5 px-2 py-0.5 text-xs font-semibold text-muted dark:bg-white/10" data-testid="addr-chip-off">{tr("Not connected yet", "غير متصل بعد")}</span>;
  };

  return (
    <section className="glass rounded-[20px] p-5 sm:p-6" data-testid="brand-domain">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-extrabold text-heading">{tr("Main address", "العنوان الرئيسي")}</h2>
        <button type="button" className={`${btn2} ms-auto`} disabled={loading} onClick={() => void load()} data-testid="addr-refresh">{loading ? tr("Checking…", "جارٍ الفحص…") : tr("Check again", "افحص مجددًا")}</button>
      </div>
      <p className="mt-2 text-sm">{tr("Now:", "الآن:")} <b dir="ltr" data-testid="addr-main">{main}</b></p>
      <p className="mt-1 text-sm text-muted">{tr("The main address goes into student login QR codes, classroom join links, timetable QR codes and links in emails. Every connected address keeps opening the site either way; people sign in once on each address.", "يُستخدم العنوان الرئيسي في رموز QR لدخول الطلاب وروابط الانضمام ورموز الجدول وروابط البريد. كل عنوان متصل يبقى يفتح الموقع، ويسجّل المستخدم الدخول مرة على كل عنوان.")}</p>

      <label className="mt-3 block max-w-sm text-sm font-medium">{tr("Also switch name & colours to", "وغيّر الاسم والألوان أيضًا إلى")}
        <select value={preset} onChange={(e) => setPreset(e.target.value)} className="mt-1 w-full rounded-xl border border-card-border bg-card-solid px-3 py-2 text-sm" data-testid="addr-preset">
          <option value="">{tr("Keep the current name & colours", "إبقاء الاسم والألوان الحالية")}</option>
          {presets.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
      </label>

      <ul className="mt-3 divide-y divide-card-border rounded-xl border border-card-border" data-testid="addr-list">
        {known.map((h) => {
          const r = rowOf(h);
          const isMain = h === main;
          const ready = r.serves && r.accepted;
          return (
            <li key={h} className="flex flex-wrap items-center gap-2 px-3 py-2.5" data-testid={`addr-${h}`}>
              <b dir="ltr" className="text-sm">{h}</b>
              {chip(r)}
              {isMain && <span className="rounded-full bg-sun/40 px-2 py-0.5 text-xs font-bold text-heading">{tr("Main", "رئيسي")}</span>}
              <span className="ms-auto">
                {isMain ? null : ready ? (
                  <button type="button" className={btn} disabled={!!busy} onClick={() => void makeMain(h)} data-testid="addr-make-main">{busy === h ? tr("Switching…", "جارٍ التبديل…") : tr("Make this the main address", "اجعله العنوان الرئيسي")}</button>
                ) : (
                  <button type="button" className={btn2} disabled={!st} onClick={() => setHelp(help === h ? "" : h)} data-testid="addr-connect-first">{tr("Connect first", "اربطه أولًا")}</button>
                )}
              </span>
              {help === h && !ready && (
                <ol className="mt-2 w-full list-decimal space-y-1 rounded-lg bg-black/[0.03] p-3 ps-8 text-sm dark:bg-white/5">
                  <li>{tr("In Cloudflare: Workers & Pages → the website project → Custom domains → Set up a custom domain → type", "في Cloudflare: Workers & Pages ← مشروع الموقع ← Custom domains ← Set up a custom domain ← اكتب")} <b dir="ltr">{h}</b>.</li>
                  <li>{tr("Cloudflare shows one DNS record (a CNAME). Add it where the domain's DNS is managed (for almudarris.com that is Wix → Domains → Manage DNS records). Moving the whole domain to Cloudflare replaces the current website on it.", "يعرض Cloudflare سجل DNS واحدًا (CNAME). أضفه حيث تُدار إعدادات النطاق (لـ almudarris.com هي Wix ← Domains ← Manage DNS records). نقل النطاق كاملًا إلى Cloudflare يستبدل الموقع الحالي عليه.")}</li>
                  <li>{tr("Wait until the address opens this website with a padlock (minutes, sometimes a few hours), then press \"Check again\".", "انتظر حتى يفتح العنوان هذا الموقع بعلامة القفل (دقائق وأحيانًا ساعات)، ثم اضغط \"افحص مجددًا\".")}</li>
                  <li>{tr("When the chip turns green, press \"Make this the main address\". To go back, press it on the old address.", "عندما يصبح المؤشر أخضر، اضغط \"اجعله العنوان الرئيسي\". للعودة، اضغطه على العنوان القديم.")}</li>
                </ol>
              )}
            </li>
          );
        })}
      </ul>

      {saved.canonical && (
        <div className="mt-3"><button type="button" className={btn2} disabled={!!busy} onClick={() => void makeMain(st?.defaultMain || DEFAULT_HOST)} data-testid="addr-switch-back">↩ {tr(`Switch back to ${st?.defaultMain || DEFAULT_HOST}`, `العودة إلى ${st?.defaultMain || DEFAULT_HOST}`)}</button></div>
      )}

      {msg && <p className={`mt-3 rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200" : "bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200"}`} role="status" data-testid="addr-msg">{msg.text}</p>}

      <details className="mt-4 text-sm">
        <summary className="cursor-pointer font-semibold">{tr("Another address", "عنوان آخر")}</summary>
        <div className="mt-2 flex max-w-md flex-wrap gap-2">
          <input dir="ltr" value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="www.myschool.com" className="min-w-0 flex-1 rounded-xl border border-card-border bg-card-solid px-3 py-2 text-sm" data-testid="brand-domain-input" />
          <button type="button" className={btn} disabled={!!busy || !extra.trim()} onClick={() => void makeMain(extra.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, ""))} data-testid="brand-domain-check">{tr("Check & use", "تحقق واستخدم")}</button>
        </div>
        <p className="mt-1 text-xs text-muted">{tr("It is only saved once it already opens this website, so links never break.", "لا يُحفظ إلا بعد أن يفتح هذا الموقع فعلًا، حتى لا تنكسر الروابط.")}{IS_SCHOOL ? "" : ` ${tr("This is a separate copy with its own data.", "هذه نسخة منفصلة ببياناتها الخاصة.")}`}</p>
      </details>
    </section>
  );
}
