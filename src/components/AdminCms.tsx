"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  type ContentData, type ContentPage, type ContentVideo, type TeacherProfile,
  CONTENT_PATH, defaultTeacher, extractYouTubeId, GITHUB_BRANCH, GITHUB_CONTENT_PATH,
  GITHUB_FORUM_PATH, GITHUB_REPO, loadContentData, newId, normalizeContentData, slugify,
} from "@/lib/content";
import { isAdminAuthenticated, setAdminAuthenticated } from "@/lib/adminAuth";
import {
  clearStoredGithubToken, downloadContentJson, downloadForumJson, getStoredGithubToken,
  publishContentToGithub, publishForumToGithub, setStoredGithubToken,
} from "@/lib/githubPublish";
import { type ForumData, type ForumThread, emptyForum, loadForumData, loadForumLocal, normalizeForum } from "@/lib/forum";

type Tab = "pages" | "videos" | "teacher" | "forum" | "settings";
const emptyPage = (): ContentPage => ({ id: newId("page"), slug: "", title: "", excerpt: "", body: "", published: true, updatedAt: new Date().toISOString() });
const emptyVideo = (): ContentVideo => ({ id: newId("video"), title: "", youtubeId: "", description: "", published: true, updatedAt: new Date().toISOString() });

export default function AdminCms() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<Tab>("pages");
  const [data, setData] = useState<ContentData>(normalizeContentData(null));
  const [forum, setForum] = useState<ForumData>(emptyForum);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingPage, setEditingPage] = useState<ContentPage | null>(null);
  const [editingVideo, setEditingVideo] = useState<ContentVideo | null>(null);
  const [youtubeInput, setYoutubeInput] = useState("");
  const [tokenInput, setTokenInput] = useState("");
  const [hasToken, setHasToken] = useState(false);
  const [imageUrlDraft, setImageUrlDraft] = useState("");
  const [ytDraft, setYtDraft] = useState("");
  const [editingThread, setEditingThread] = useState<ForumThread | null>(null);
  const refreshTokenFlag = useCallback(() => setHasToken(Boolean(getStoredGithubToken())), []);

  useEffect(() => {
    if (!isAdminAuthenticated()) { router.replace("/admin/login"); return; }
    setReady(true); refreshTokenFlag();
    loadContentData().then(setData).catch(() => setStatus("Could not load data.json"));
    loadForumData().then(setForum).catch(() => setForum(emptyForum));
  }, [router, refreshTokenFlag]);

  const sortedPages = useMemo(() => [...data.pages].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [data.pages]);
  const sortedVideos = useMemo(() => [...data.videos].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [data.videos]);

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
    if (!token) { setStatus("No GitHub token. Open Settings."); setTab("settings"); return; }
    setBusy(true); setStatus("Publishing data.json…");
    const result = await publishContentToGithub(data, token);
    setBusy(false);
    setStatus(result.ok ? `Published ${GITHUB_CONTENT_PATH}. ${result.htmlUrl || ""}` : result.error);
  }

  async function publishForum() {
    const token = getStoredGithubToken();
    if (!token) { setStatus("No GitHub token."); setTab("settings"); return; }
    setBusy(true); setStatus("Publishing forum.json…");
    const result = await publishForumToGithub(normalizeForum(forum), token);
    setBusy(false);
    setStatus(result.ok ? `Published ${GITHUB_FORUM_PATH}. ${result.htmlUrl || ""}` : result.error);
  }

  function importLocalForum() {
    const local = loadForumLocal();
    if (!local.threads.length) { setStatus("No local student posts in this browser."); return; }
    const byId = new Map(forum.threads.map((t) => [t.id, t]));
    for (const t of local.threads) {
      const existing = byId.get(t.id);
      if (!existing) { byId.set(t.id, t); continue; }
      const ids = new Set(existing.replies.map((r) => r.id));
      for (const r of t.replies) if (!ids.has(r.id)) existing.replies.push(r);
    }
    setForum({ threads: Array.from(byId.values()) });
    setStatus("Merged local posts. Review then Publish forum.");
  }

  function updateTeacher<K extends keyof TeacherProfile>(key: K, value: TeacherProfile[K]) {
    setData((prev) => ({ ...prev, teacher: { ...prev.teacher, [key]: value } }));
  }

  if (!ready) return <div className="flex min-h-[50vh] items-center justify-center text-sm text-muted">Checking admin session…</div>;

  const input = "mt-1.5 w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";
  const btn = "rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground";
  const btnGhost = "rounded-full border border-card-border px-3 py-1.5 text-sm";

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-card-border bg-card">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div><p className="text-xs font-semibold uppercase tracking-wider text-primary">CMS</p><h1 className="text-lg font-semibold">Learning content admin</h1></div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => downloadContentJson(data)} className={btnGhost}>Download data.json</button>
            <button type="button" disabled={busy} onClick={publishContent} className={btn}>{busy ? "Publishing…" : "Publish content"}</button>
            <Link href="/" className="rounded-full px-3 py-1.5 text-sm text-primary hover:underline">View site</Link>
            <button type="button" onClick={() => { setAdminAuthenticated(false); router.replace("/admin/login"); }} className="rounded-full px-3 py-1.5 text-sm text-muted">Log out</button>
          </div>
        </div>
        <div className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-4 pb-3 sm:px-6">
          {(["pages","videos","teacher","forum","settings"] as Tab[]).map((id) => (
            <button key={id} type="button" onClick={() => setTab(id)} className={`rounded-full px-3 py-1.5 text-sm capitalize ${tab===id?"bg-accent-soft font-medium text-primary":"text-muted hover:bg-accent-soft/60"}`}>{id}</button>
          ))}
        </div>
      </header>
      {status && <div className="mx-auto max-w-5xl px-4 pt-4 sm:px-6"><p className="rounded-lg border border-card-border bg-accent-soft/60 px-3 py-2 text-sm">{status}</p></div>}
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">
        {tab==="pages" && (
          <section className="space-y-4">
            <div className="flex justify-between"><h2 className="text-xl font-semibold">Learning pages</h2><button type="button" className={btn} onClick={() => setEditingPage(emptyPage())}>+ New page</button></div>
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
          <section className="space-y-4">
            <div className="flex justify-between"><h2 className="text-xl font-semibold">YouTube videos</h2><button type="button" className={btn} onClick={()=>{setEditingVideo(emptyVideo());setYoutubeInput("");}}>+ New video</button></div>
            {editingVideo && (
              <form onSubmit={saveVideo} className="space-y-3 rounded-2xl border border-card-border bg-card p-5">
                <Field label="Title"><input className={input} value={editingVideo.title} onChange={(e)=>setEditingVideo({...editingVideo,title:e.target.value})} required /></Field>
                <Field label="YouTube URL or ID"><input className={input} value={youtubeInput||editingVideo.youtubeId} onChange={(e)=>setYoutubeInput(e.target.value)} required /></Field>
                <Field label="Description"><textarea className={input+" min-h-20"} value={editingVideo.description} onChange={(e)=>setEditingVideo({...editingVideo,description:e.target.value})} /></Field>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editingVideo.published} onChange={(e)=>setEditingVideo({...editingVideo,published:e.target.checked})} /> Published</label>
                <div className="flex gap-2"><button type="submit" className={btn}>Save video</button><button type="button" className="text-sm text-muted" onClick={()=>{setEditingVideo(null);setYoutubeInput("");}}>Cancel</button></div>
              </form>
            )}
            <ul className="divide-y divide-card-border rounded-2xl border border-card-border bg-card">
              {sortedVideos.map((video)=>(
                <li key={video.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div><p className="font-medium">{video.title}</p><p className="text-xs text-muted">{video.youtubeId}</p></div>
                  <div className="flex gap-2">
                    <button type="button" className="text-sm text-primary" onClick={()=>{setEditingVideo({...video});setYoutubeInput(video.youtubeId);}}>Edit</button>
                    <button type="button" className="text-sm text-red-600" onClick={()=>{if(confirm(`Delete "${video.title}"?`)) setData((prev)=>({...prev,videos:prev.videos.filter((v)=>v.id!==video.id)}));}}>Delete</button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
        {tab==="teacher" && (
          <form onSubmit={saveTeacher} className="space-y-3 rounded-2xl border border-card-border bg-card p-5">
            <h2 className="text-xl font-semibold">Teacher profile</h2>
            <Field label="Name"><input className={input} value={data.teacher.name} onChange={(e)=>updateTeacher("name",e.target.value)} /></Field>
            <Field label="Title"><input className={input} value={data.teacher.title} onChange={(e)=>updateTeacher("title",e.target.value)} /></Field>
            <Field label="Location"><input className={input} value={data.teacher.location} onChange={(e)=>updateTeacher("location",e.target.value)} /></Field>
            <Field label="Photo URL"><input className={input} value={data.teacher.photoUrl} onChange={(e)=>updateTeacher("photoUrl",e.target.value)} /></Field>
            <Field label="Subjects (comma-separated)"><input className={input} value={data.teacher.subjects.join(", ")} onChange={(e)=>updateTeacher("subjects",e.target.value.split(",").map((s)=>s.trim()).filter(Boolean))} /></Field>
            <Field label="Bio"><textarea className={input+" min-h-28"} value={data.teacher.bio} onChange={(e)=>updateTeacher("bio",e.target.value)} /></Field>
            <button type="submit" className={btn}>Save teacher profile</button>
          </form>
        )}
        {tab==="forum" && (
          <section className="space-y-4">
            <div className="flex flex-wrap justify-between gap-2">
              <h2 className="text-xl font-semibold">Kids forum moderation</h2>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={btnGhost} onClick={importLocalForum}>Import local posts</button>
                <button type="button" className={btnGhost} onClick={()=>downloadForumJson(forum)}>Download forum.json</button>
                <button type="button" disabled={busy} className={btn} onClick={publishForum}>Publish forum</button>
                <button type="button" className={btn} onClick={()=>setEditingThread({id:newId("thread"),title:"",author:"Shaiq Muhammad",body:"",createdAt:new Date().toISOString(),hidden:false,replies:[]})}>+ Thread</button>
              </div>
            </div>
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
          <section className="space-y-4">
            <h2 className="text-xl font-semibold">Publish settings</h2>
            <p className="text-sm text-muted">PAT with Contents: Read/Write on {GITHUB_REPO}. Publishes {GITHUB_CONTENT_PATH} and {GITHUB_FORUM_PATH} on {GITHUB_BRANCH}.</p>
            <form onSubmit={(e)=>{e.preventDefault(); if(!tokenInput.trim()){setStatus("Paste a token first.");return;} setStoredGithubToken(tokenInput); setTokenInput(""); refreshTokenFlag(); setStatus("Token saved in sessionStorage.");}} className="space-y-3 rounded-2xl border border-card-border bg-card p-5">
              <p className="text-sm">Token: <span className={hasToken?"text-primary font-medium":"text-muted"}>{hasToken?"Stored":"Not set"}</span></p>
              <Field label="GitHub Personal Access Token"><input className={input+" font-mono text-xs"} type="password" value={tokenInput} onChange={(e)=>setTokenInput(e.target.value)} placeholder="github_pat_…" /></Field>
              <div className="flex gap-2"><button type="submit" className={btn}>Save token</button>{hasToken && <button type="button" className={btnGhost} onClick={()=>{clearStoredGithubToken();refreshTokenFlag();}}>Clear</button>}</div>
            </form>
            <div className="rounded-2xl border border-card-border bg-accent-soft/50 p-5 text-sm">
              <p className="font-semibold">Admin login</p>
              <p className="mt-2 text-muted">URL: <code>/admin/login</code> · Password: <code>ShaiqAdmin2026!</code> (set NEXT_PUBLIC_ADMIN_PASSWORD in Cloudflare too)</p>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block text-sm font-medium">{label}{children}</label>;
}
