"use client";

import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  emptyBanner, GITHUB_BANNERS_PATH, normalizeBanners, type Banner, type BannersData,
} from "@/lib/banners";
import { downloadJson, getStoredGithubToken, publishJsonToGithub } from "@/lib/githubPublish";

type Props = {
  setStatus: (s: string) => void;
  onNeedToken: () => void;
  data: BannersData;
  setData: React.Dispatch<React.SetStateAction<BannersData>>;
};

const input = "mt-1.5 w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";
const btn = "rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60";
const btnGhost = "rounded-full border border-card-border px-3 py-1.5 text-sm";

export default function AdminBanners({ setStatus, onNeedToken, data, setData }: Props) {
  const [editing, setEditing] = useState<Banner | null>(null);
  const [busy, setBusy] = useState(false);

  const sorted = useMemo(
    () => [...data.banners].sort((a, b) => a.order - b.order || a.title.localeCompare(b.title)),
    [data.banners],
  );

  function save(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    if (!editing.imageUrl.trim()) { setStatus("Banner image URL (or data URL) is required."); return; }
    const next = { ...editing, title: editing.title.trim(), subtitle: editing.subtitle.trim(), imageUrl: editing.imageUrl.trim() };
    setData((prev) => ({
      banners: prev.banners.some((b) => b.id === next.id)
        ? prev.banners.map((b) => (b.id === next.id ? next : b))
        : [...prev.banners, next],
    }));
    setEditing(null);
    setStatus(`Saved banner "${next.title || next.id}" locally. Publish banners (or Publish all) to go live.`);
  }

  function move(id: string, dir: -1 | 1) {
    const list = [...sorted];
    const i = list.findIndex((b) => b.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    setData({ banners: list.map((b, order) => ({ ...b, order })) });
  }

  async function publish() {
    const token = getStoredGithubToken();
    if (!token) { setStatus("No GitHub token. Open Settings."); onNeedToken(); return; }
    setBusy(true); setStatus("Publishing banners.json…");
    const payload = normalizeBanners({ banners: sorted.map((b, order) => ({ ...b, order })) });
    const r = await publishJsonToGithub(GITHUB_BANNERS_PATH, payload, token, "chore(banners): update banners.json via admin");
    setBusy(false);
    setStatus(r.ok ? `Published ${GITHUB_BANNERS_PATH}. ${r.htmlUrl || ""}` : r.error);
  }

  function onFile(file: File | undefined) {
    if (!file || !editing) return;
    if (!file.type.startsWith("image/")) { setStatus("Please choose an image file."); return; }
    if (file.size > 1_500_000) { setStatus("Image too large for data URL (keep under ~1.5MB). Prefer a hosted URL."); return; }
    const reader = new FileReader();
    reader.onload = () => setEditing({ ...editing, imageUrl: String(reader.result || "") });
    reader.readAsDataURL(file);
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap justify-between gap-2">
        <h2 className="text-xl font-semibold">Home banners</h2>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btnGhost} onClick={() => downloadJson(normalizeBanners(data), "banners.json")}>Download</button>
          <button type="button" disabled={busy} className={btn} onClick={publish}>Publish banners</button>
          <button type="button" className={btn} onClick={() => setEditing({ ...emptyBanner(), order: data.banners.length })}>+ Banner</button>
        </div>
      </div>
      <p className="text-xs text-muted">Auto-sliding carousel at the top of the home page. Only published banners with an image are shown.</p>

      {editing && (
        <form onSubmit={save} className="space-y-3 rounded-2xl border border-card-border bg-card p-5">
          <Field label="Title"><input className={input} value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} /></Field>
          <Field label="Subtitle"><textarea className={input + " min-h-16"} value={editing.subtitle} onChange={(e) => setEditing({ ...editing, subtitle: e.target.value })} /></Field>
          <Field label="Image URL or data:image/…">
            <input className={input} value={editing.imageUrl} onChange={(e) => setEditing({ ...editing, imageUrl: e.target.value })} required />
          </Field>
          <label className="block text-sm font-medium">
            Or upload image
            <input type="file" accept="image/*" className="mt-1.5 block w-full text-sm" onChange={(e) => onFile(e.target.files?.[0])} />
          </label>
          {editing.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={editing.imageUrl} alt="" className="max-h-40 rounded-xl border border-card-border object-cover" />
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Button text (optional)"><input className={input} value={editing.buttonText} onChange={(e) => setEditing({ ...editing, buttonText: e.target.value })} /></Field>
            <Field label="Button link (optional)"><input className={input} value={editing.buttonHref} onChange={(e) => setEditing({ ...editing, buttonHref: e.target.value })} placeholder="/quizzes" /></Field>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editing.published} onChange={(e) => setEditing({ ...editing, published: e.target.checked })} /> Published</label>
          <div className="flex gap-2"><button type="submit" className={btn}>Save banner</button><button type="button" className="text-sm text-muted" onClick={() => setEditing(null)}>Cancel</button></div>
        </form>
      )}

      <ul className="divide-y divide-card-border rounded-2xl border border-card-border bg-card">
        {sorted.length === 0 && <li className="px-4 py-3 text-sm text-muted">No banners yet.</li>}
        {sorted.map((b, i) => (
          <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              {b.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={b.imageUrl} alt="" className="h-12 w-20 shrink-0 rounded-md object-cover border border-card-border" />
              )}
              <div className="min-w-0">
                <p className="truncate font-medium">{b.title || "(untitled)"}</p>
                <p className="text-xs text-muted">{b.published ? "Published" : "Draft"} · order {i + 1}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 text-sm">
              <button type="button" disabled={i === 0} onClick={() => move(b.id, -1)}>↑</button>
              <button type="button" disabled={i === sorted.length - 1} onClick={() => move(b.id, 1)}>↓</button>
              <button type="button" className="text-primary" onClick={() => setEditing({ ...b })}>Edit</button>
              <button type="button" className="text-red-600" onClick={() => { if (confirm("Delete this banner?")) setData((prev) => ({ banners: prev.banners.filter((x) => x.id !== b.id) })); }}>Delete</button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block text-sm font-medium">{label}{children}</label>;
}
