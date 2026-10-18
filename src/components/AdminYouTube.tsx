"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { thumb, ytAdmin, type PageRow, type PlCfg, type YtAdminConfig } from "@/lib/yt";

const input = "mt-1 w-full rounded-xl border border-card-border bg-card-solid px-3 py-2 text-sm outline-none focus:border-sun-border focus:ring-2 focus:ring-sun/40";
const btn = "btn-glass px-3 py-1.5 text-sm disabled:opacity-60";
const cta = "btn-cta px-5 py-2 disabled:opacity-60";
const errText = (e: unknown) => (e instanceof Error ? e.message : "error");

/** Admin → YouTube: playlist pages (show/hide/rename/order) and upload to the channel. */
export function AdminYouTube() {
  const { lang } = useI18n();
  const tr = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const [cfg, setCfg] = useState<YtAdminConfig | null>(null);
  const [rows, setRows] = useState<PlCfg[]>([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [hiddenPl, setHiddenPl] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState("");
  const [q, setQ] = useState("");

  const load = useCallback(() => {
    ytAdmin.config().then((c) => {
      setCfg(c);
      setHidden(new Set(c.hidden || [])); setHiddenPl(new Set(c.hiddenPlaylists || [])); setSaved(JSON.stringify([[...(c.hidden || [])].sort(), [...(c.hiddenPlaylists || [])].sort()]));
      // One row per channel playlist, merged with the saved settings (order: saved first).
      const saved = new Map(c.config.map((x) => [x.id, x]));
      const merged = c.playlists.map((p, i) => saved.get(p.id) || { id: p.id, title: p.title, slug: "", order: 100 + i, visible: false });
      setRows(merged.sort((a, b) => a.order - b.order));
    }).catch((e) => setMsg(errText(e) === "unauthorized" ? tr("Sign in to the admin again.", "سجّل الدخول إلى الإدارة مجددًا.") : errText(e)));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    load();
    if (/yt=connected/.test(window.location.hash)) setTimeout(() => setMsg(tr("YouTube connected ✔", "تم ربط يوتيوب ✔")), 0); // eslint-disable-line react-hooks/exhaustive-deps
  }, [load]); // eslint-disable-line react-hooks/exhaustive-deps

  const move = (i: number, d: number) => setRows((r) => { const a = [...r]; const j = i + d; if (j < 0 || j >= a.length) return r; [a[i], a[j]] = [a[j], a[i]]; return a.map((x, k) => ({ ...x, order: k })); });
  const shownVids = (cfg?.videoList || []).filter((v) => !q || v.title.toLowerCase().includes(q.toLowerCase()));
  const setMany = (ids: string[], hide: boolean) => setHidden((h) => { const n = new Set(h); ids.forEach((i) => (hide ? n.add(i) : n.delete(i))); return n; });
  const setManyPl = (ids: string[], hide: boolean) => setHiddenPl((h) => { const n = new Set(h); ids.forEach((i) => (hide ? n.add(i) : n.delete(i))); return n; });
  const dirty = JSON.stringify([[...hidden].sort(), [...hiddenPl].sort()]) !== saved;
  const saveHidden = async () => {
    setBusy(true);
    try { await ytAdmin.saveHidden([...hidden], [...hiddenPl]); setMsg(tr("Saved. The Videos page, playlist pages and homepage update within a minute.", "تم الحفظ. تتحدث صفحة الفيديوهات وقوائم التشغيل والصفحة الرئيسية خلال دقيقة.")); load(); } catch (e) { setMsg(errText(e)); }
    setBusy(false);
  };
  const save = async () => {
    setBusy(true);
    try { await ytAdmin.savePlaylists(rows.map((r, i) => ({ ...r, order: i }))); setMsg(tr("Saved. The menu updates within a minute.", "تم الحفظ. تتحدث القائمة خلال دقيقة.")); load(); } catch (e) { setMsg(errText(e)); }
    setBusy(false);
  };

  return (
    <div className="space-y-6" data-testid="admin-youtube">
      <section className="glass rounded-3xl p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="me-auto text-xl font-bold">{tr("YouTube channel @shaiqmuhammad", "قناة يوتيوب @shaiqmuhammad")}</h2>
          <button type="button" className={btn} onClick={async () => { await ytAdmin.refresh().catch(() => undefined); load(); }} data-testid="yt-refresh">⟳ {tr("Refresh from YouTube", "تحديث من يوتيوب")}</button>
        </div>
        <p className="mt-1 text-sm opacity-80">{cfg ? (cfg.channelOk ? tr(`${cfg.videos} videos and ${cfg.playlists.length} playlists found. The Videos page lists them automatically (refreshed every 30 minutes).`, `${cfg.videos} مقطعًا و${cfg.playlists.length} قائمة تشغيل. تظهر تلقائيًا في صفحة الفيديوهات (تحديث كل 30 دقيقة).`) : tr("Couldn't read the channel right now.", "تعذرت قراءة القناة الآن.")) : tr("Loading…", "جارٍ التحميل…")}</p>
        {msg && <p className="mt-2 rounded-xl bg-sun/30 px-3 py-2 text-sm font-semibold" role="status">{msg}</p>}
      </section>

      <section className="glass rounded-3xl p-5" data-testid="yt-visibility">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="me-auto text-lg font-bold">{tr("Videos shown on the site", "المقاطع المعروضة في الموقع")}{cfg ? ` (${(cfg.videoList.length - cfg.videoList.filter((v) => hidden.has(v.id)).length)}/${cfg.videoList.length})` : ""}</h3>
          <button type="button" className={cta} onClick={saveHidden} disabled={busy || !dirty} data-testid="yt-vis-save">{tr("Save visibility", "حفظ الظهور")}{dirty ? " •" : ""}</button>
        </div>
        <p className="mt-1 text-sm opacity-80">{tr("Untick a video to hide it from the Videos page, every playlist page and the homepage. New uploads are shown by default.", "ألغِ تحديد المقطع لإخفائه من صفحة الفيديوهات وكل قوائم التشغيل والصفحة الرئيسية. تظهر المقاطع الجديدة افتراضيًا.")}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input className={input + " !mt-0 min-w-[10rem] flex-1"} placeholder={tr("Search videos…", "ابحث في المقاطع…")} value={q} onChange={(e) => setQ(e.target.value)} dir="auto" data-testid="yt-vis-search" />
          <button type="button" className={btn} onClick={() => { setMany(shownVids.map((v) => v.id), false); if (!q) setManyPl((cfg?.playlists || []).map((p) => p.id), false); }} data-testid="yt-vis-showall">{tr(q ? "Show matching" : "Show all (videos + playlists)", q ? "إظهار النتائج" : "إظهار الكل")}</button>
          <button type="button" className={btn} onClick={() => { setMany(shownVids.map((v) => v.id), true); if (!q) setManyPl((cfg?.playlists || []).map((p) => p.id), true); }} data-testid="yt-vis-hideall">{tr(q ? "Hide matching" : "Hide all (videos + playlists)", q ? "إخفاء النتائج" : "إخفاء الكل")}</button>
        </div>
        {!!cfg?.playlists.length && (
          <div className="mt-3" data-testid="yt-vis-playlists">
            <p className="text-sm font-bold">{tr("Playlists", "قوائم التشغيل")} <span className="font-normal opacity-70">{tr("(hidden playlists disappear from the Videos page cards, their pages and the Students Resources menu)", "(القوائم المخفية تختفي من بطاقات صفحة الفيديوهات وصفحاتها وقائمة موارد الطلاب)")}</span></p>
            <ul className="mt-1 flex flex-wrap gap-2">
              {cfg.playlists.map((p) => (
                <li key={p.id}><label className={"inline-flex items-center gap-2 rounded-full border border-card-border px-3 py-1 text-sm font-semibold " + (hiddenPl.has(p.id) ? "opacity-50" : "")}><input type="checkbox" checked={!hiddenPl.has(p.id)} onChange={(e) => setManyPl([p.id], !e.target.checked)} data-testid="yt-vis-pl-toggle" /><span dir="auto">{p.title}</span></label></li>
              ))}
            </ul>
          </div>
        )}
        <ul className="mt-3 max-h-[28rem] divide-y divide-card-border overflow-y-auto" data-testid="yt-vis-rows">
          {shownVids.map((v) => (
            <li key={v.id} className="flex items-center gap-3 py-2" data-testid="yt-vis-row">
              <input type="checkbox" className="h-5 w-5 shrink-0" checked={!hidden.has(v.id)} onChange={(e) => setMany([v.id], !e.target.checked)} aria-label={tr("Show on site", "إظهار في الموقع")} data-testid="yt-vis-toggle" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={thumb(v.id)} alt="" loading="lazy" className="h-12 w-20 shrink-0 rounded-lg object-cover" />
              <span className="min-w-0 flex-1"><span className={"line-clamp-2 text-sm font-semibold " + (hidden.has(v.id) ? "opacity-50" : "")} dir="auto">{v.title}</span><span className="text-xs opacity-60">{v.published}{v.duration ? ` · ${v.duration}` : ""}</span></span>
              {hidden.has(v.id) && <span className="rounded-full bg-black/10 px-2 py-0.5 text-xs font-bold">{tr("Hidden", "مخفي")}</span>}
            </li>
          ))}
          {cfg && !shownVids.length && <li className="py-3 text-sm opacity-70">{tr("No videos found.", "لا توجد مقاطع.")}</li>}
        </ul>
      </section>

      <section className="glass rounded-3xl p-5">
        <h3 className="text-lg font-bold">{tr("Playlist pages under “Students Resources”", "صفحات قوائم التشغيل ضمن «موارد الطلاب»")}</h3>
        <p className="mt-1 text-sm opacity-80">{tr("Tick “Show” to give a playlist its own page and menu entry. Rename it or change the order.", "فعّل «إظهار» لمنح القائمة صفحة وعنصر قائمة خاصًا بها. يمكنك تغيير الاسم والترتيب.")}</p>
        <ul className="mt-3 divide-y divide-card-border" data-testid="yt-pl-rows">
          {rows.map((r, i) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2 py-2" data-testid="yt-pl-row">
              <label className="inline-flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={r.visible} onChange={(e) => setRows(rows.map((x) => (x.id === r.id ? { ...x, visible: e.target.checked } : x)))} data-testid="yt-pl-show" />{tr("Show", "إظهار")}</label>
              <input className={input + " !mt-0 min-w-[12rem] flex-1"} value={r.title} onChange={(e) => setRows(rows.map((x) => (x.id === r.id ? { ...x, title: e.target.value } : x)))} dir="auto" aria-label={tr("Menu name", "اسم القائمة")} data-testid="yt-pl-title" />
              <button type="button" className={btn} onClick={() => move(i, -1)} disabled={i === 0} aria-label={tr("Move up", "أعلى")}>↑</button>
              <button type="button" className={btn} onClick={() => move(i, 1)} disabled={i === rows.length - 1} aria-label={tr("Move down", "أسفل")}>↓</button>
            </li>
          ))}
          {cfg && !rows.length && <li className="py-3 text-sm opacity-70">{tr("No playlists found.", "لا توجد قوائم تشغيل.")}</li>}
        </ul>
        <button type="button" className={cta + " mt-3"} onClick={save} disabled={busy || !rows.length} data-testid="yt-pl-save">{tr("Save playlist pages", "حفظ صفحات القوائم")}</button>
      </section>

      <Upload cfg={cfg} reload={load} />
    </div>
  );
}

function Upload({ cfg, reload }: { cfg: YtAdminConfig | null; reload: () => void }) {
  const { lang } = useI18n();
  const tr = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [pl, setPl] = useState("");
  const [privacy, setPrivacy] = useState("private");
  const [kids, setKids] = useState(false);
  const [pct, setPct] = useState<number | null>(null);
  const [msg, setMsg] = useState("");
  const xhr = useRef<XMLHttpRequest | null>(null);

  const connect = async () => { try { window.location.href = (await ytAdmin.authUrl()).url; } catch (e) { setMsg(errText(e) === "oauth_not_configured" ? tr("Google keys are not set on the server yet — see the steps below.", "مفاتيح جوجل غير مضبوطة على الخادم بعد — راجع الخطوات أدناه.") : errText(e)); } };
  const upload = async () => {
    if (!file || !title.trim()) return;
    setMsg(""); setPct(0);
    try {
      const { uploadUrl } = await ytAdmin.uploadInit({ title, description: desc, privacy, size: file.size, mime: file.type || "video/*", madeForKids: kids });
      const res = await new Promise<{ id?: string }>((resolve, reject) => {
        const x = new XMLHttpRequest(); xhr.current = x;
        x.open("PUT", uploadUrl);
        x.setRequestHeader("Content-Type", file.type || "video/*");
        x.upload.onprogress = (e) => e.lengthComputable && setPct(Math.round((e.loaded / e.total) * 100));
        x.onload = () => (x.status >= 200 && x.status < 300 ? resolve(JSON.parse(x.responseText || "{}")) : reject(new Error(`upload_${x.status}`)));
        x.onerror = () => reject(new Error("upload_network"));
        x.send(file);
      });
      if (!res.id) throw new Error("no_video_id");
      await ytAdmin.finish(res.id, pl);
      setPct(null); setFile(null); setTitle(""); setDesc("");
      setMsg(tr(`Uploaded ✔ (${privacy}). It appears on the Videos page within 30 minutes.`, `تم الرفع ✔ (${privacy}). يظهر في صفحة الفيديوهات خلال 30 دقيقة.`));
      reload();
    } catch (e) { setPct(null); setMsg(tr("Upload failed: ", "فشل الرفع: ") + errText(e)); }
  };
  const o = cfg?.oauth;
  return (
    <section className="glass rounded-3xl p-5" data-testid="yt-upload">
      <h3 className="text-lg font-bold">{tr("Upload a video to YouTube", "رفع فيديو إلى يوتيوب")}</h3>
      {!o?.configured ? (
        <div className="mt-2 space-y-2 text-sm">
          <p className="rounded-xl bg-amber-100 px-3 py-2 text-amber-900">{tr("One-time setup needed before uploading from here:", "مطلوب إعداد لمرة واحدة قبل الرفع من هنا:")}</p>
          <ol className="list-decimal space-y-1 ps-5">
            <li>{tr("In Google Cloud Console create a project and enable “YouTube Data API v3”.", "في Google Cloud Console أنشئ مشروعًا وفعّل «YouTube Data API v3».")}</li>
            <li>{tr("OAuth consent screen: type External, add yourself as a Test user (the Google account that owns the channel).", "شاشة الموافقة: النوع External وأضف حسابك كمستخدم تجريبي (حساب مالك القناة).")}</li>
            <li>{tr("Credentials → Create OAuth client ID → Web application. Authorised redirect URI:", "Credentials ← Create OAuth client ID ← Web application. عنوان إعادة التوجيه:")} <code className="break-all rounded bg-black/10 px-1" dir="ltr">{o?.redirectUri || "https://assessment-session.hidden-wildflower-498c.workers.dev/api/yt/oauth-callback"}</code></li>
            <li>{tr("Send the Client ID and Client secret to your assistant (or run: npx wrangler secret put GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET in workers/assessment-session).", "أرسل Client ID وClient secret إلى مساعدك (أو نفّذ wrangler secret put لكل منهما).")}</li>
            <li>{tr("Come back here and press “Connect YouTube” once.", "ارجع إلى هنا واضغط «ربط يوتيوب» مرة واحدة.")}</li>
          </ol>
          <p className="opacity-80">{tr("Limits: 10,000 API units per day; each upload costs about 1,600 → roughly 6 uploads a day. Until Google audits the project, videos uploaded through an unverified project are forced to Private (you can switch them to Public in YouTube Studio, or request the audit).", "الحدود: 10,000 وحدة يوميًا والرفع الواحد نحو 1,600 → قرابة 6 مقاطع يوميًا. قبل مراجعة جوجل للمشروع تُرفع المقاطع كـ «خاص» إجباريًا (يمكن تحويلها إلى عام من YouTube Studio أو طلب المراجعة).")}</p>
        </div>
      ) : !o.connected ? (
        <div className="mt-2"><p className="text-sm opacity-80">{tr("Approve access once with the Google account that owns the channel.", "وافق على الوصول مرة واحدة بحساب مالك القناة.")}</p><button type="button" className={cta + " mt-3"} onClick={connect} data-testid="yt-connect">{tr("Connect YouTube", "ربط يوتيوب")}</button></div>
      ) : (
        <div className="mt-3 space-y-3">
          <p className="text-sm font-semibold text-emerald-700">✔ {tr("YouTube is connected.", "يوتيوب متصل.")} <button type="button" className="ms-2 underline" onClick={async () => { await ytAdmin.disconnect(); reload(); }}>{tr("Disconnect", "فصل")}</button></p>
          <input type="file" accept="video/*" onChange={(e) => { const f = e.target.files?.[0] || null; setFile(f); if (f && !title) setTitle(f.name.replace(/\.[^.]+$/, "")); }} className="block text-sm" data-testid="yt-file" />
          <label className="block text-sm font-semibold">{tr("Title", "العنوان")}<input className={input} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} dir="auto" data-testid="yt-title" /></label>
          <label className="block text-sm font-semibold">{tr("Description", "الوصف")}<textarea className={input + " min-h-24"} value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={4900} dir="auto" /></label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-semibold">{tr("Add to playlist", "إضافة إلى قائمة")}<select className={input} value={pl} onChange={(e) => setPl(e.target.value)}><option value="">{tr("— none —", "— لا شيء —")}</option>{(cfg?.playlists || []).map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select></label>
            <label className="block text-sm font-semibold">{tr("Privacy", "الخصوصية")}<select className={input} value={privacy} onChange={(e) => setPrivacy(e.target.value)}><option value="private">{tr("Private", "خاص")}</option><option value="unlisted">{tr("Unlisted", "غير مدرج")}</option><option value="public">{tr("Public", "عام")}</option></select></label>
          </div>
          <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={kids} onChange={(e) => setKids(e.target.checked)} />{tr("Made for kids", "موجّه للأطفال")}</label>
          {pct !== null && <div className="h-2 overflow-hidden rounded-full bg-black/10"><div className="h-full bg-sun transition-all" style={{ width: `${pct}%` }} /></div>}
          <div className="flex gap-2"><button type="button" className={cta} onClick={upload} disabled={!file || !title.trim() || pct !== null} data-testid="yt-upload-go">{pct !== null ? `${pct}%` : tr("Upload", "رفع")}</button>{pct !== null && <button type="button" className={btn} onClick={() => { xhr.current?.abort(); setPct(null); }}>{tr("Cancel", "إلغاء")}</button>}</div>
        </div>
      )}
      {msg && <p className="mt-3 rounded-xl bg-sun/30 px-3 py-2 text-sm font-semibold" role="status">{msg}</p>}
    </section>
  );
}

const PLACES: [PageRow["place"], string, string][] = [["none", "Not in a menu", "خارج القوائم"], ["top", "Top menu", "القائمة العليا"], ["resources", "Students Resources dropdown", "قائمة موارد الطلاب"], ["footer", "Footer links", "روابط التذييل"]];
const blank = (): Partial<PageRow> => ({ title: "", titleAr: "", slug: "", body: "", bodyAr: "", place: "resources", order: 50, visible: true });

/** Admin → Pages & menu: add / edit / delete website pages and choose where they appear in the menus. */
export function AdminPageManager() {
  const { lang } = useI18n();
  const tr = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const [pages, setPages] = useState<PageRow[] | null>(null);
  const [ed, setEd] = useState<Partial<PageRow> | null>(null);
  const [msg, setMsg] = useState("");
  const load = useCallback(() => { ytAdmin.config().then((c) => setPages(c.pages)).catch((e) => setMsg(errText(e))); }, []);
  useEffect(() => { // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);
  const save = async () => {
    if (!ed) return;
    try { await ytAdmin.savePage(ed); setEd(null); setMsg(tr("Saved. Menus update within a minute.", "تم الحفظ. تتحدث القوائم خلال دقيقة.")); load(); } catch (e) { setMsg(errText(e) === "title_required" ? tr("Title is required.", "العنوان مطلوب.") : errText(e)); }
  };
  return (
    <div className="space-y-5" data-testid="admin-page-manager">
      <section className="glass rounded-3xl p-5">
        <div className="flex items-center gap-2"><h2 className="me-auto text-xl font-bold">{tr("Pages & menu", "الصفحات والقوائم")}</h2><button type="button" className={cta} onClick={() => setEd(blank())} data-testid="page-new">＋ {tr("New page", "صفحة جديدة")}</button></div>
        <p className="mt-1 text-sm opacity-80">{tr("Create pages (text, headings, lists, images, YouTube links in the body play inside the page) and choose the menu where they appear. Playlist pages are managed under YouTube.", "أنشئ صفحات (نصوص وعناوين وقوائم وصور، وروابط يوتيوب في المحتوى تُعرض داخل الصفحة) واختر القائمة التي تظهر فيها. صفحات قوائم التشغيل تُدار من قسم YouTube.")}</p>
        {msg && <p className="mt-2 rounded-xl bg-sun/30 px-3 py-2 text-sm font-semibold" role="status">{msg}</p>}
      </section>
      {ed && (
        <section className="glass space-y-3 rounded-3xl p-5" data-testid="page-editor">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-semibold">{tr("Title (English)", "العنوان (إنجليزي)")}<input className={input} value={ed.title || ""} onChange={(e) => setEd({ ...ed, title: e.target.value })} data-testid="page-title" /></label>
            <label className="block text-sm font-semibold">{tr("Title (Arabic, optional)", "العنوان (عربي، اختياري)")}<input className={input} dir="rtl" value={ed.titleAr || ""} onChange={(e) => setEd({ ...ed, titleAr: e.target.value })} /></label>
            <label className="block text-sm font-semibold">{tr("Address (optional)", "العنوان في الرابط (اختياري)")}<input className={input} dir="ltr" value={ed.slug || ""} onChange={(e) => setEd({ ...ed, slug: e.target.value })} placeholder="my-page" /></label>
            <label className="block text-sm font-semibold">{tr("Show in", "يظهر في")}<select className={input} value={ed.place} onChange={(e) => setEd({ ...ed, place: e.target.value as PageRow["place"] })} data-testid="page-place">{PLACES.map(([v, en, ar]) => <option key={v} value={v}>{tr(en, ar)}</option>)}</select></label>
            <label className="block text-sm font-semibold">{tr("Menu order (small first)", "ترتيب القائمة (الأصغر أولًا)")}<input type="number" className={input} value={ed.order ?? 50} onChange={(e) => setEd({ ...ed, order: Number(e.target.value) })} /></label>
            <label className="inline-flex items-center gap-2 self-end text-sm font-semibold"><input type="checkbox" checked={ed.visible !== false} onChange={(e) => setEd({ ...ed, visible: e.target.checked })} />{tr("Published", "منشورة")}</label>
          </div>
          <label className="block text-sm font-semibold">{tr("Content (English) — # heading, - list, **bold**, [text](link), ![image](url)", "المحتوى (إنجليزي) — # عنوان، - قائمة، **غامق**")}<textarea className={input + " min-h-48 font-mono"} value={ed.body || ""} onChange={(e) => setEd({ ...ed, body: e.target.value })} data-testid="page-body" /></label>
          <label className="block text-sm font-semibold">{tr("Content (Arabic, optional)", "المحتوى (عربي، اختياري)")}<textarea className={input + " min-h-32"} dir="rtl" value={ed.bodyAr || ""} onChange={(e) => setEd({ ...ed, bodyAr: e.target.value })} /></label>
          <div className="flex gap-2"><button type="button" className={cta} onClick={save} data-testid="page-save">{tr("Save page", "حفظ الصفحة")}</button><button type="button" className={btn} onClick={() => setEd(null)}>{tr("Cancel", "إلغاء")}</button></div>
        </section>
      )}
      <section className="glass rounded-3xl p-5">
        {pages === null ? <p className="text-sm opacity-70">{tr("Loading…", "جارٍ التحميل…")}</p> : !pages.length ? <p className="text-sm opacity-70">{tr("No custom pages yet.", "لا توجد صفحات مخصصة بعد.")}</p> : (
          <ul className="divide-y divide-card-border" data-testid="page-rows">
            {pages.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 py-2.5" data-testid="page-row">
                <span className="min-w-0 flex-1"><b className="block truncate" dir="auto">{p.title}</b><span className="text-xs opacity-70" dir="ltr">/p?s={p.slug} · {PLACES.find((x) => x[0] === p.place)?.[1]} · {p.visible ? "published" : "hidden"}</span></span>
                <a className={btn} href={`/p?s=${p.slug}`} target="_blank" rel="noopener">{tr("Open", "فتح")}</a>
                <button type="button" className={btn} onClick={() => setEd(p)} data-testid="page-edit">{tr("Edit", "تعديل")}</button>
                <button type="button" className={btn + " text-rose-600"} onClick={async () => { if (!confirm(tr(`Delete “${p.title}”?`, `حذف «${p.title}»؟`))) return; await ytAdmin.deletePage(p.id).catch(() => undefined); load(); }} data-testid="page-delete">{tr("Delete", "حذف")}</button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
