"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  type ContentData, type ContentPage, type ContentVideo, type TeacherProfile,
  defaultTeacher, extractYouTubeId, GITHUB_CONTENT_PATH,
  GITHUB_FORUM_PATH, loadContentData, newId, normalizeContentData, slugify,
} from "@/lib/content";
import { isAdminAuthenticated, setAdminAuthenticated } from "@/lib/adminAuth";
import {
  downloadContentJson, downloadForumJson, getStoredGithubToken,
  publishContentToGithub, publishForumToGithub, publishJsonToGithub,
} from "@/lib/githubPublish";
import { type ForumData, type ForumThread, emptyForum, loadForumData, mergeForumLocal, normalizeForum } from "@/lib/forum";
import { AdminForumQueue } from "@/components/AdminForumQueue";
import { AdminResults } from "@/components/AdminResults";
import { forumPendingCount } from "@/lib/adminServer";
import AdminQuizzes from "@/components/AdminQuizzes";
import AdminCertificate from "@/components/AdminCertificate";
import AdminBanners from "@/components/AdminBanners";
import AdminAnnouncements from "@/components/AdminAnnouncements";
import { builtAnnouncements, GITHUB_ANNOUNCEMENTS_PATH, loadAnnouncementsData, normalizeAnnouncements, type AnnouncementsData } from "@/lib/announcements";
import { GITHUB_BANNERS_PATH, loadBannersData, normalizeBanners, type BannersData } from "@/lib/banners";
import {
  GITHUB_CERTIFICATE_PATH, GITHUB_QUIZ_RESULTS_PATH, GITHUB_QUIZZES_PATH,
  defaultCertificate, loadCertificateTemplate, loadQuizResultsData, loadQuizzesData, normalizeCertificate,
  quizzesForPublish, normalizeResults, type CertificateTemplate, type QuizResultsData, type QuizzesData,
} from "@/lib/quiz";
import {
  emptySettings, GITHUB_SETTINGS_PATH, loadSiteSettings, normalizeSettings, type SiteSettings,
} from "@/lib/siteSettings";
import { AdminChrome } from "@/components/AdminChrome";
import { AdminVideosTab } from "@/components/AdminVideosTab";
import { AdminHome } from "@/components/AdminHome";
import AdminSettings from "@/components/AdminSettings";
import { useI18n } from "@/lib/i18n";

type Tab = "home" | "pages" | "videos" | "quizzes" | "certificate" | "banners" | "announcements" | "teacher" | "forum" | "results" | "settings";
const emptyPage = (): ContentPage => ({ id: newId("page"), slug: "", title: "", excerpt: "", body: "", published: true, updatedAt: new Date().toISOString() });
const emptyVideo = (): ContentVideo => ({ id: newId("video"), title: "", youtubeId: "", description: "", published: true, updatedAt: new Date().toISOString() });

export default function AdminCms() {
  const router = useRouter();
  const { t, lang } = useI18n();
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<Tab>("home");
  const [refreshing, setRefreshing] = useState(false);
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);
  const [data, setData] = useState<ContentData>(normalizeContentData(null));
  const [forum, setForum] = useState<ForumData>(emptyForum);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingPage, setEditingPage] = useState<ContentPage | null>(null);
  const [editingVideo, setEditingVideo] = useState<ContentVideo | null>(null);
  const [youtubeInput, setYoutubeInput] = useState("");
  const [hasToken, setHasToken] = useState(false);
  const [imageUrlDraft, setImageUrlDraft] = useState("");
  const [ytDraft, setYtDraft] = useState("");
  const [editingThread, setEditingThread] = useState<ForumThread | null>(null);
  const [quizzesData, setQuizzesData] = useState<QuizzesData>({ quizzes: [] });
  const [quizResults, setQuizResults] = useState<QuizResultsData>({ results: [] });
  const [certificate, setCertificate] = useState<CertificateTemplate>(defaultCertificate);
  const [loaded, setLoaded] = useState<Record<string, boolean>>({});
  const markLoaded = useCallback((k: string) => setLoaded((prev) => ({ ...prev, [k]: true })), []);
  const [bannersData, setBannersData] = useState<BannersData>({ banners: [] });
  const [announcementsData, setAnnouncementsData] = useState<AnnouncementsData>(builtAnnouncements);
  const [siteSettings, setSiteSettings] = useState<SiteSettings>(emptySettings);
  const [publishedSnapshot, setPublishedSnapshot] = useState<string | null>(null);
  const [otherSnapshots, setOtherSnapshots] = useState<Record<string, string>>({});
  const refreshTokenFlag = useCallback(() => setHasToken(Boolean(getStoredGithubToken())), []);
  const [pendingCount, setPendingCount] = useState(0);
  const [queueKey, setQueueKey] = useState(0);
  const prevPending = useRef<number | null>(null);

  // Forum moderation: poll the queue every 60 s while Admin is open, even in a background tab
  // (bell badge, "(n)" tab title, optional desktop alert).
  useEffect(() => {
    if (!ready) return;
    let stop = false;
    const check = async () => {
      const n = await forumPendingCount();
      if (stop || n === null) return;
      setPendingCount(n);
      if (prevPending.current !== null && n > prevPending.current) {
        setQueueKey((k) => k + 1);
        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          new Notification(lang === "ar" ? "مشاركة جديدة في المنتدى" : "New forum post waiting", {
            body: lang === "ar" ? `${n} بانتظار موافقتك` : `${n} waiting for your approval`,
            icon: "/icon-192.png",
          });
        }
      }
      prevPending.current = n;
    };
    void check();
    const timer = setInterval(check, 60_000);
    const onVisible = () => { if (!document.hidden) void check(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { stop = true; clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [ready, lang]);

  useEffect(() => {
    const base = document.title.replace(/^\(\d+\+?\)\s*/, "");
    document.title = pendingCount > 0 ? `(${pendingCount}) ${base}` : base;
  }, [pendingCount]);

  const onQueueCount = useCallback((n: number) => { setPendingCount(n); prevPending.current = n; }, []);

  /** After approving, the server returns forum.json as published; keep any unpublished local forum edits. */
  function onForumApproved(raw: unknown) {
    const server = normalizeForum(raw as ForumData);
    const dirty = otherSnapshots.forum !== undefined && otherSnapshots.forum !== JSON.stringify(forum);
    setForum(dirty ? mergeForumLocal(forum, server) : server);
    setOtherSnapshots((prev) => ({ ...prev, forum: JSON.stringify(server) }));
  }

  /** (Re)load every published JSON file (fetches use cache: "no-store"). Admin session is untouched. */
  const loadAll = useCallback(async () => {
    setRefreshing(true);
    const snap: Record<string, string> = {};
    await Promise.all([
      loadContentData().then((d) => { setData(d); setPublishedSnapshot(JSON.stringify(d)); markLoaded("data.json"); }).catch(() => setStatus("Could not load data.json")),
      loadForumData().then((d) => { setForum(d); snap.forum = JSON.stringify(d); markLoaded("forum.json"); }).catch(() => setForum(emptyForum)),
      loadQuizzesData().then((d) => { setQuizzesData(d); snap.quizzes = JSON.stringify(d); markLoaded("quizzes.json"); }).catch(() => undefined),
      loadQuizResultsData().then((d) => { setQuizResults(d); snap.results = JSON.stringify(d); markLoaded("quiz-results.json"); }).catch(() => undefined),
      loadCertificateTemplate().then((d) => { setCertificate(d); snap.certificate = JSON.stringify(d); markLoaded("certificate.json"); }).catch(() => undefined),
      loadBannersData().then((d) => { setBannersData(d); snap.banners = JSON.stringify(d); markLoaded("banners.json"); }).catch(() => undefined),
      loadAnnouncementsData().then((d) => { setAnnouncementsData(d); snap.announcements = JSON.stringify(d); markLoaded("announcements.json"); }).catch(() => undefined),
      loadSiteSettings().then((d) => { setSiteSettings(d); snap.settings = JSON.stringify(d); markLoaded("settings.json"); }).catch(() => undefined),
    ]);
    setOtherSnapshots(snap);
    setRefreshedAt(new Date());
    setRefreshing(false);
  }, [markLoaded]);

  useEffect(() => {
    if (!isAdminAuthenticated()) { router.replace("/admin/login"); return; }
    setReady(true); refreshTokenFlag();
    void loadAll();
  }, [router, refreshTokenFlag, loadAll]);

  /** Logo button: back to the dashboard and re-fetch everything that is published. */
  function goHomeAndRefresh() {
    const dirty =
      hasUnpublished || editingPage || editingVideo || editingThread ||
      (otherSnapshots.quizzes !== undefined && otherSnapshots.quizzes !== JSON.stringify(quizzesData)) ||
      (otherSnapshots.forum !== undefined && otherSnapshots.forum !== JSON.stringify(forum)) ||
      (otherSnapshots.banners !== undefined && otherSnapshots.banners !== JSON.stringify(bannersData)) ||
      (otherSnapshots.announcements !== undefined && otherSnapshots.announcements !== JSON.stringify(announcementsData)) ||
      (otherSnapshots.certificate !== undefined && otherSnapshots.certificate !== JSON.stringify(certificate)) ||
      (otherSnapshots.settings !== undefined && otherSnapshots.settings !== JSON.stringify(siteSettings)) ||
      (otherSnapshots.results !== undefined && otherSnapshots.results !== JSON.stringify(quizResults));
    if (dirty && !confirm(lang === "ar" ? "إعادة تحميل أحدث محتوى منشور؟ ستُفقد التغييرات غير المنشورة." : "Reload the latest published content? Changes you haven't published will be lost.")) return;
    setEditingPage(null); setEditingVideo(null); setEditingThread(null); setYoutubeInput("");
    setStatus("");
    setTab("home");
    refreshTokenFlag();
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
    void loadAll();
  }

  const hasUnpublished = publishedSnapshot !== null && JSON.stringify(data) !== publishedSnapshot;
  const sortedPages = useMemo(() => [...data.pages].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [data.pages]);

  function insertIntoBody(snippet: string) {
    if (!editingPage) return;
    const body = editingPage.body;
    setEditingPage({ ...editingPage, body: body ? `${body.trimEnd()}\n\n${snippet}\n` : `${snippet}\n` });
  }

  function savePage(e: FormEvent) {
    e.preventDefault();
    if (!editingPage) return;
    const slug = editingPage.slug.trim() || slugify(editingPage.title);
    if (!editingPage.title.trim() || !slug) { setStatus("Title and slug required."); return; }
    const next = { ...editingPage, slug, title: editingPage.title.trim(), excerpt: editingPage.excerpt.trim(), updatedAt: new Date().toISOString() };
    setData((prev) => ({ ...prev, pages: prev.pages.some((p) => p.id === next.id) ? prev.pages.map((p) => (p.id === next.id ? next : p)) : [...prev.pages, next] }));
    setEditingPage(null);
    setStatus(`Saved page "${next.title}" locally.`);
  }

  function saveVideo(e: FormEvent) {
    e.preventDefault();
    if (!editingVideo) return;
    const idFromInput = extractYouTubeId(youtubeInput || editingVideo.youtubeId);
    if (!editingVideo.title.trim() || !idFromInput) { setStatus("Title and YouTube URL/ID required."); return; }
    const next = { ...editingVideo, title: editingVideo.title.trim(), youtubeId: idFromInput, description: editingVideo.description.trim(), updatedAt: new Date().toISOString() };
    setData((prev) => ({ ...prev, videos: prev.videos.some((v) => v.id === next.id) ? prev.videos.map((v) => (v.id === next.id ? next : v)) : [...prev.videos, next] }));
    setEditingVideo(null); setYoutubeInput("");
    setStatus(`Saved video "${next.title}" locally.`);
  }

  function saveTeacher(e: FormEvent) {
    e.preventDefault();
    const t = data.teacher;
    const subjects = (Array.isArray(t.subjects) ? t.subjects : []).map((s) => s.trim()).filter(Boolean);
    setData((prev) => ({ ...prev, teacher: { ...defaultTeacher, ...t, name: t.name.trim() || defaultTeacher.name, title: t.title.trim() || defaultTeacher.title, bio: t.bio.trim() || defaultTeacher.bio, photoUrl: t.photoUrl.trim() || defaultTeacher.photoUrl, subjects: subjects.length ? subjects : [...defaultTeacher.subjects], location: t.location.trim() || defaultTeacher.location } }));
    setStatus("Teacher profile saved locally.");
  }

  function saveThread(e: FormEvent) {
    e.preventDefault();
    if (!editingThread) return;
    const next = { ...editingThread, title: editingThread.title.trim(), author: editingThread.author.trim() || "Teacher", body: editingThread.body.trim(), createdAt: editingThread.createdAt || new Date().toISOString() };
    if (!next.title || !next.body) { setStatus("Thread title and body required."); return; }
    setForum((prev) => ({ threads: prev.threads.some((t) => t.id === next.id) ? prev.threads.map((t) => (t.id === next.id ? next : t)) : [...prev.threads, next] }));
    setEditingThread(null);
    setStatus(`Saved forum thread "${next.title}".`);
  }

  async function publishContent() {
    const token = getStoredGithubToken();
    if (!token) { setStatus("Publishing isn't connected on this device — open Settings."); setTab("settings"); return; }
    setBusy(true); setStatus("Publishing data.json…");
    const result = await publishContentToGithub(data, token);
    setBusy(false);
    if (result.ok) setPublishedSnapshot(JSON.stringify(data));
    setStatus(result.ok ? `Published ${GITHUB_CONTENT_PATH}. Cloudflare rebuilds in ~1–2 min. ${result.htmlUrl || ""}` : result.error);
  }

  async function publishForum() {
    const token = getStoredGithubToken();
    if (!token) { setStatus("Publishing isn't connected on this device — open Settings."); setTab("settings"); return; }
    setBusy(true); setStatus("Publishing forum.json…");
    const result = await publishForumToGithub(normalizeForum(forum), token);
    setBusy(false);
    setStatus(result.ok ? `Published ${GITHUB_FORUM_PATH}. ${result.htmlUrl || ""}` : result.error);
  }

  async function publishAll() {
    const token = getStoredGithubToken();
    if (!token) { setStatus("Publishing isn't connected on this device — open Settings."); setTab("settings"); return; }
    setBusy(true);
    const jobs: { label: string; run: () => Promise<{ ok: boolean; error?: string; htmlUrl?: string }> }[] = [
      { label: "data.json", run: () => publishContentToGithub(data, token) },
      { label: "forum.json", run: () => publishForumToGithub(normalizeForum(forum), token) },
      { label: "quizzes.json", run: () => publishJsonToGithub(GITHUB_QUIZZES_PATH, quizzesForPublish(quizzesData), token, "chore(quiz): publish quizzes.json") },
      { label: "quiz-results.json", run: () => publishJsonToGithub(GITHUB_QUIZ_RESULTS_PATH, normalizeResults(quizResults), token, "chore(quiz): publish quiz-results.json") },
      { label: "certificate.json", run: () => publishJsonToGithub(GITHUB_CERTIFICATE_PATH, normalizeCertificate(certificate), token, "chore(quiz): publish certificate.json") },
      { label: "banners.json", run: () => publishJsonToGithub(GITHUB_BANNERS_PATH, normalizeBanners(bannersData), token, "chore(banners): publish banners.json") },
      { label: "announcements.json", run: () => publishJsonToGithub(GITHUB_ANNOUNCEMENTS_PATH, normalizeAnnouncements(announcementsData), token, "chore(announcements): publish announcements.json") },
      { label: "settings.json", run: () => publishJsonToGithub(GITHUB_SETTINGS_PATH, normalizeSettings(siteSettings), token, "chore(settings): publish settings.json") },
    ];
    const ok: string[] = [];
    const fail: string[] = [];
    for (const job of jobs) {
      if (!loaded[job.label]) { fail.push(`${job.label}: skipped (not loaded yet)`); continue; }
      setStatus(`Publishing ${job.label}…`);
      const r = await job.run();
      if (r.ok) { ok.push(job.label); if (job.label === "data.json") setPublishedSnapshot(JSON.stringify(data)); }
      else fail.push(`${job.label}: ${r.error || "failed"}`);
    }
    setBusy(false);
    setStatus(fail.length ? `Published ${ok.length}/${jobs.length}. Errors: ${fail.join(" | ")}` : `Published all (${ok.join(", ")}). Cloudflare rebuilds in ~1–2 min.`);
  }

  function updateTeacher<K extends keyof TeacherProfile>(key: K, value: TeacherProfile[K]) {
    setData((prev) => ({ ...prev, teacher: { ...prev.teacher, [key]: value } }));
  }

  if (!ready) return <div className="flex min-h-[50vh] items-center justify-center text-sm text-muted">{t("admin.checking")}</div>;

  const input = "mt-1.5 w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";
  const btn = "rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground";
  const btnGhost = "rounded-full border border-card-border px-3 py-1.5 text-sm";

  return (
    <AdminChrome
      busy={busy}
      tab={tab}
      onTab={setTab}
      onHome={goHomeAndRefresh}
      refreshing={refreshing}
      onPublishAll={publishAll}
      onLogout={() => { setAdminAuthenticated(false); router.replace("/admin/login"); }}
      pendingCount={pendingCount}
      onBell={() => { setTab("forum"); setQueueKey((k) => k + 1); }}
    >
      <div className="space-y-8">
      {hasUnpublished && (
          <p className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-gold-soft px-4 py-3 text-sm" data-testid="unpublished-banner">
            <span>{t("admin.unpublished")}</span>
            <button type="button" disabled={busy} onClick={publishContent} className={btn}>{busy ? "…" : t("admin.publishContent")}</button>
          </p>
      )}
      {status && <p className="rounded-xl bg-accent-soft px-4 py-3 text-sm">{status}</p>}
        {tab==="home" && (
          <AdminHome
            counts={{
              pages: data.pages.length,
              videos: data.videos.length,
              assessments: quizzesData.quizzes.length,
              assessmentsEnabled: quizzesData.quizzes.filter((q) => q.published).length,
              results: quizResults.results.length,
              threads: forum.threads.length,
              banners: bannersData.banners.length,
              announcements: announcementsData.items.length,
            }}
            refreshedAt={refreshedAt}
            refreshing={refreshing}
            hasToken={hasToken}
            onTab={setTab}
          />
        )}
        {tab==="pages" && (
          <section className="space-y-4">
            <div className="flex justify-between"><h2 className="text-xl font-semibold">{t("admin.pages.heading")}</h2><button type="button" className={btn} onClick={() => setEditingPage(emptyPage())}>{t("admin.pages.new")}</button></div>
            {editingPage && (
              <form onSubmit={savePage} className="space-y-3 rounded-2xl border border-card-border bg-card p-5">
                <Field label="Title"><input className={input} value={editingPage.title} onChange={(e)=>{const title=e.target.value;setEditingPage({...editingPage,title,slug:editingPage.slug||slugify(title)});}} required /></Field>
                <Field label="Slug"><input className={input} value={editingPage.slug} onChange={(e)=>setEditingPage({...editingPage,slug:slugify(e.target.value)})} required /></Field>
                <Field label="Excerpt"><textarea className={input+" min-h-20"} value={editingPage.excerpt} onChange={(e)=>setEditingPage({...editingPage,excerpt:e.target.value})} /></Field>
                <div className="rounded-xl border border-dashed border-card-border bg-accent-soft/40 p-3 space-y-2">
                  <p className="text-xs font-semibold uppercase text-muted">Insert rich blocks</p>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className={btnGhost} onClick={()=>insertIntoBody("## Heading\n\nYour paragraph here.")}>+ Heading</button>
                    <button type="button" className={btnGhost} onClick={()=>{insertIntoBody(`![Lesson image](${imageUrlDraft.trim()||"https://picsum.photos/800/450"})`);setImageUrlDraft("");}}>+ Image</button>
                    <button type="button" className={btnGhost} onClick={()=>{insertIntoBody(`:::youtube ${extractYouTubeId(ytDraft)||"jNQXAC9IVRw"}`);setYtDraft("");}}>+ YouTube</button>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <input className={input} placeholder="Image URL or data:image/…;base64,…" value={imageUrlDraft} onChange={(e)=>setImageUrlDraft(e.target.value)} />
                    <input className={input} placeholder="YouTube URL or ID" value={ytDraft} onChange={(e)=>setYtDraft(e.target.value)} />
                  </div>
                </div>
                <Field label="Body"><textarea className={input+" min-h-48 font-mono text-xs"} value={editingPage.body} onChange={(e)=>setEditingPage({...editingPage,body:e.target.value})} /></Field>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editingPage.published} onChange={(e)=>setEditingPage({...editingPage,published:e.target.checked})} /> Published</label>
                <div className="flex gap-2"><button type="submit" className={btn}>Save page</button><button type="button" className="text-sm text-muted" onClick={()=>setEditingPage(null)}>Cancel</button></div>
              </form>
            )}
            <ul className="divide-y divide-card-border rounded-2xl border border-card-border bg-card">
              {sortedPages.map((page)=>(
                <li key={page.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div><p className="font-medium">{page.title}</p><p className="text-xs text-muted">/lessons/{page.slug} · {page.published?"Published":"Draft"}</p></div>
                  <div className="flex gap-2">
                    <button type="button" className="text-sm text-primary" onClick={()=>setEditingPage({...page})}>Edit</button>
                    <button type="button" className="text-sm text-red-600" onClick={()=>{if(confirm(`Delete "${page.title}"?`)){setData((prev)=>({...prev,pages:prev.pages.filter((p)=>p.id!==page.id)}));}}}>Delete</button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
        {tab==="videos" && (
          <AdminVideosTab
            videos={data.videos}
            editingVideo={editingVideo}
            youtubeInput={youtubeInput}
            busy={busy}
            input={input}
            btn={btn}
            btnGhost={btnGhost}
            onNew={()=>{setEditingVideo(emptyVideo());setYoutubeInput("");}}
            onEdit={(video)=>{setEditingVideo({...video});setYoutubeInput(video.youtubeId);}}
            onDelete={(video)=>{if(confirm(`Delete "${video.title}"?`)) setData((prev)=>({...prev,videos:prev.videos.filter((v)=>v.id!==video.id)}));}}
            onCancel={()=>{setEditingVideo(null);setYoutubeInput("");}}
            onSave={saveVideo}
            onYoutubeInput={setYoutubeInput}
            onChangeVideo={setEditingVideo}
            onPublish={publishContent}
          />
        )}
        {tab==="quizzes" && <AdminQuizzes setStatus={setStatus} onNeedToken={()=>setTab("settings")} data={quizzesData} setData={setQuizzesData} results={quizResults} setResults={setQuizResults} />}
        {tab==="certificate" && <AdminCertificate setStatus={setStatus} onNeedToken={()=>setTab("settings")} tpl={certificate} setTpl={setCertificate} />}
        {tab==="announcements" && <AdminAnnouncements setStatus={setStatus} onNeedToken={()=>setTab("settings")} data={announcementsData} setData={setAnnouncementsData} />}
        {tab==="banners" && <AdminBanners setStatus={setStatus} onNeedToken={()=>setTab("settings")} data={bannersData} setData={setBannersData} />}
        {tab==="teacher" && (
          <form onSubmit={saveTeacher} className="space-y-3 rounded-2xl border border-card-border bg-card p-5">
            <h2 className="text-xl font-semibold">{t("admin.teacher.heading")}</h2>
            <Field label="Name"><input className={input} value={data.teacher.name} onChange={(e)=>updateTeacher("name",e.target.value)} /></Field>
            <Field label="Title"><input className={input} value={data.teacher.title} onChange={(e)=>updateTeacher("title",e.target.value)} /></Field>
            <Field label="Location"><input className={input} value={data.teacher.location} onChange={(e)=>updateTeacher("location",e.target.value)} /></Field>
            <Field label="Photo URL"><input className={input} value={data.teacher.photoUrl} onChange={(e)=>updateTeacher("photoUrl",e.target.value)} /></Field>
            <Field label="Subjects (comma-separated)"><input className={input} value={data.teacher.subjects.join(", ")} onChange={(e)=>updateTeacher("subjects",e.target.value.split(",").map((s)=>s.trim()).filter(Boolean))} /></Field>
            <Field label="Bio"><textarea className={input+" min-h-28"} value={data.teacher.bio} onChange={(e)=>updateTeacher("bio",e.target.value)} /></Field>
            <button type="submit" className={btn}>Save teacher profile</button>
          </form>
        )}
        {tab==="results" && <AdminResults quizzes={quizzesData.quizzes} />}
        {tab==="forum" && (
          <section className="space-y-4">
            <div className="flex flex-wrap justify-between gap-2">
              <h2 className="text-xl font-semibold">{t("admin.forum.heading")}</h2>
              <div className="flex flex-wrap gap-2">
                                <button type="button" className={btnGhost} onClick={()=>downloadForumJson(forum)}>Download forum.json</button>
                <button type="button" disabled={busy} className={btn} onClick={publishForum}>Publish forum</button>
                <button type="button" className={btn} onClick={()=>setEditingThread({id:newId("thread"),title:"",author:"Shaiq Muhammad",body:"",createdAt:new Date().toISOString(),hidden:false,replies:[]})}>+ Thread</button>
              </div>
            </div>
            <AdminForumQueue forum={forum} refreshKey={queueKey} onApproved={onForumApproved} onCount={onQueueCount} setStatus={setStatus} />
            {editingThread && (
              <form onSubmit={saveThread} className="space-y-3 rounded-2xl border border-card-border bg-card p-5">
                <Field label="Title"><input className={input} value={editingThread.title} onChange={(e)=>setEditingThread({...editingThread,title:e.target.value})} required /></Field>
                <Field label="Author"><input className={input} value={editingThread.author} onChange={(e)=>setEditingThread({...editingThread,author:e.target.value})} /></Field>
                <Field label="Body"><textarea className={input+" min-h-24"} value={editingThread.body} onChange={(e)=>setEditingThread({...editingThread,body:e.target.value})} required /></Field>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editingThread.hidden} onChange={(e)=>setEditingThread({...editingThread,hidden:e.target.checked})} /> Hidden</label>
                <div className="flex gap-2"><button type="submit" className={btn}>Save thread</button><button type="button" className="text-sm text-muted" onClick={()=>setEditingThread(null)}>Cancel</button></div>
              </form>
            )}
            <ul className="divide-y divide-card-border rounded-2xl border border-card-border bg-card">
              {forum.threads.map((t)=>(
                <li key={t.id} className="px-4 py-3">
                  <div className="flex flex-wrap justify-between gap-2">
                    <div><p className="font-medium">{t.title} {t.hidden && <span className="text-xs text-red-600">(hidden)</span>}</p><p className="text-xs text-muted">{t.author} · {t.replies.length} replies</p></div>
                    <div className="flex gap-2 text-sm">
                      <button type="button" className="text-primary" onClick={()=>setEditingThread({...t,replies:[...t.replies]})}>Edit</button>
                      <button type="button" onClick={()=>setForum((prev)=>({threads:prev.threads.map((x)=>x.id===t.id?{...x,hidden:!x.hidden}:x)}))}>{t.hidden?"Unhide":"Hide"}</button>
                      <button type="button" className="text-red-600" onClick={()=>{if(confirm(`Delete "${t.title}"?`)) setForum((prev)=>({threads:prev.threads.filter((x)=>x.id!==t.id)}));}}>Delete</button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
        {tab==="settings" && (
          <AdminSettings
            siteSettings={siteSettings}
            setSiteSettings={setSiteSettings}
            setStatus={setStatus}
            hasToken={hasToken}
            refreshTokenFlag={refreshTokenFlag}
            onDownloadContent={() => downloadContentJson(data)}
          />
        )}
      </div>
    </AdminChrome>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block text-sm font-medium">{label}{children}</label>;
}
