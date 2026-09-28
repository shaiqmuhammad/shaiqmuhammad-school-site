"use client";

import { type FormEvent } from "react";
import { extractYouTubeId, type ContentVideo } from "@/lib/content";
import { useI18n } from "@/lib/i18n";

type Props = {
  videos: ContentVideo[];
  editingVideo: ContentVideo | null;
  youtubeInput: string;
  busy: boolean;
  input: string;
  btn: string;
  btnGhost: string;
  onNew: () => void;
  onEdit: (v: ContentVideo) => void;
  onDelete: (v: ContentVideo) => void;
  onCancel: () => void;
  onSave: (e: FormEvent) => void;
  onYoutubeInput: (v: string) => void;
  onChangeVideo: (v: ContentVideo) => void;
  onPublish: () => void;
};

export function AdminVideosTab(props: Props) {
  const { t } = useI18n();
  const {
    videos, editingVideo, youtubeInput, busy, input, btn, btnGhost,
    onNew, onEdit, onDelete, onCancel, onSave, onYoutubeInput, onChangeVideo, onPublish,
  } = props;
  const sorted = [...videos].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold">{t("admin.videos.heading")}</h2>
        <button type="button" className={btn} onClick={onNew}>{t("admin.videos.new")}</button>
      </div>
      <p className="rounded-lg border border-card-border bg-accent-soft/50 px-3 py-2 text-sm text-muted">{t("admin.videos.hint")}</p>
      {editingVideo && (() => {
        const detected = extractYouTubeId(youtubeInput || editingVideo.youtubeId);
        return (
          <form onSubmit={onSave} className="space-y-3 rounded-2xl border border-card-border bg-card p-5">
            <label className="block text-sm font-medium">{t("admin.field.title")}
              <input className={input} value={editingVideo.title} onChange={(e)=>onChangeVideo({...editingVideo,title:e.target.value})} required />
            </label>
            <label className="block text-sm font-medium">{t("admin.videos.url")}
              <input className={input} value={youtubeInput||editingVideo.youtubeId} onChange={(e)=>onYoutubeInput(e.target.value)} placeholder="https://www.youtube.com/watch?v=…  ·  youtu.be/…  ·  shorts/…  ·  ID" required />
              <p className={`mt-1 text-xs ${detected ? "text-primary" : "text-red-600"}`}>
                {detected ? `${t("admin.videos.detected")}: ${detected}` : t("admin.videos.invalid")}
              </p>
              {detected && (
                <div className="mt-3 aspect-video max-w-md overflow-hidden rounded-xl border border-card-border bg-accent-soft">
                  <iframe title="preview" src={`https://www.youtube.com/embed/${detected}`} className="h-full w-full border-0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen loading="lazy" />
                </div>
              )}
            </label>
            <label className="block text-sm font-medium">{t("admin.field.description")}
              <textarea className={input+" min-h-20"} value={editingVideo.description} onChange={(e)=>onChangeVideo({...editingVideo,description:e.target.value})} />
            </label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editingVideo.published} onChange={(e)=>onChangeVideo({...editingVideo,published:e.target.checked})} /> {t("admin.published")}</label>
            <div className="flex flex-wrap gap-2">
              <button type="submit" className={btn}>{t("admin.videos.save")}</button>
              <button type="button" disabled={busy} onClick={onPublish} className={btnGhost}>{busy ? "…" : t("admin.publishContent")}</button>
              <button type="button" className="text-sm text-muted" onClick={onCancel}>{t("admin.cancel")}</button>
            </div>
          </form>
        );
      })()}
      <ul className="divide-y divide-card-border rounded-2xl border border-card-border bg-card">
        {sorted.length === 0 && <li className="px-4 py-6 text-sm text-muted">{t("admin.videos.empty")}</li>}
        {sorted.map((video)=>{
          const id = extractYouTubeId(video.youtubeId) || video.youtubeId;
          return (
            <li key={video.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {id && <img src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`} alt="" className="h-14 w-24 shrink-0 rounded-md border border-card-border object-cover" />}
                <div className="min-w-0">
                  <p className="font-medium">{video.title}</p>
                  <p className="text-xs text-muted truncate">{id} · {video.published ? t("admin.published") : t("admin.draft")}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button type="button" className="text-sm text-primary" onClick={()=>onEdit(video)}>{t("admin.edit")}</button>
                <button type="button" className="text-sm text-red-600" onClick={()=>onDelete(video)}>{t("admin.delete")}</button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
