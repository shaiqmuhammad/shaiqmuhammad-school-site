"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Card } from "@/components/Card";
import { newId } from "@/lib/content";
import {
  type ForumData,
  type ForumThread,
  listVisibleThreads,
  loadForumLocal,
  mergeForumLocal,
  saveForumLocal,
} from "@/lib/forum";

export function ForumClient({ initial }: { initial: ForumData }) {
  const [local, setLocal] = useState<ForumData>({ threads: [] });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    setLocal(loadForumLocal());
    const hash = window.location.hash.replace(/^#/, "");
    if (hash) setSelectedId(hash);
  }, []);

  const merged = useMemo(() => mergeForumLocal(initial, local), [initial, local]);
  const threads = listVisibleThreads(merged);
  const thread = selectedId ? merged.threads.find((t) => t.id === selectedId && !t.hidden) : undefined;

  function persist(nextLocal: ForumData) {
    setLocal(nextLocal);
    saveForumLocal(nextLocal);
  }

  function openThread(id: string) {
    setSelectedId(id);
    setStatus("");
    window.history.replaceState(null, "", `#${id}`);
  }

  function backToList() {
    setSelectedId(null);
    setStatus("");
    window.history.replaceState(null, "", "/forum");
  }

  function onNewThread(e: FormEvent) {
    e.preventDefault();
    const author = name.trim().slice(0, 40);
    const t = title.trim().slice(0, 120);
    const b = body.trim().slice(0, 2000);
    if (!author || !t || !b) {
      setStatus("Please fill display name, title, and message.");
      return;
    }
    const threadNew: ForumThread = {
      id: newId("thread"),
      title: t,
      author,
      body: b,
      createdAt: new Date().toISOString(),
      hidden: false,
      replies: [],
    };
    persist({ threads: [...local.threads, threadNew] });
    setTitle("");
    setBody("");
    setStatus("Posted on this device. Teacher can publish it for everyone via Admin → Forum.");
    openThread(threadNew.id);
  }

  function onReply(e: FormEvent) {
    e.preventDefault();
    if (!selectedId) return;
    const author = name.trim().slice(0, 40);
    const b = body.trim().slice(0, 2000);
    if (!author || !b) {
      setStatus("Please fill display name and reply.");
      return;
    }
    const reply = {
      id: newId("reply"),
      author,
      body: b,
      createdAt: new Date().toISOString(),
      hidden: false,
    };
    const existingLocal = local.threads.find((t) => t.id === selectedId);
    let nextThreads = [...local.threads];
    if (existingLocal) {
      nextThreads = nextThreads.map((t) =>
        t.id === selectedId ? { ...t, replies: [...t.replies, reply] } : t,
      );
    } else {
      const pub = initial.threads.find((t) => t.id === selectedId);
      if (!pub) return;
      nextThreads.push({ ...pub, replies: [reply] });
    }
    persist({ threads: nextThreads });
    setBody("");
    setStatus("Reply saved on this device. Teacher can publish class-wide from Admin → Forum.");
  }

  if (thread) {
    const replies = thread.replies.filter((r) => !r.hidden);
    return (
      <div className="space-y-6">
        <button type="button" onClick={backToList} className="text-sm font-medium text-primary hover:underline">
          ← All threads
        </button>
        <Card>
          <h2 className="text-xl font-semibold">{thread.title}</h2>
          <p className="mt-1 text-xs text-muted">
            {thread.author} ·{" "}
            {new Date(thread.createdAt).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </p>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">{thread.body}</p>
        </Card>
        <div>
          <h3 className="mb-3 text-lg font-semibold">Replies ({replies.length})</h3>
          <ul className="space-y-3">
            {replies.map((r) => (
              <li key={r.id}>
                <Card className="bg-accent-soft/40">
                  <p className="text-xs font-medium text-primary">{r.author}</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{r.body}</p>
                </Card>
              </li>
            ))}
            {replies.length === 0 && (
              <p className="text-sm text-muted">No replies yet — be the first to encourage kindly.</p>
            )}
          </ul>
        </div>
        <form onSubmit={onReply} className="space-y-3 rounded-2xl border border-card-border bg-card p-5">
          <h3 className="font-semibold">Add a reply</h3>
          <input
            className="w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm"
            placeholder="Display name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            required
          />
          <textarea
            className="min-h-24 w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm"
            placeholder="Kind reply…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={2000}
            required
          />
          <button type="submit" className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
            Post reply
          </button>
          {status && <p className="text-sm text-muted">{status}</p>}
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <ul className="space-y-3">
        {threads.map((t) => {
          const replies = t.replies.filter((r) => !r.hidden).length;
          const isLocalOnly = !initial.threads.some((p) => p.id === t.id);
          return (
            <li key={t.id}>
              <button type="button" onClick={() => openThread(t.id)} className="group w-full text-left">
                <Card className="transition group-hover:border-primary/40">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h2 className="text-lg font-semibold group-hover:text-primary">{t.title}</h2>
                    {isLocalOnly && (
                      <span className="rounded-full bg-gold-soft px-2 py-0.5 text-[10px] font-semibold uppercase">
                        On this device
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {t.author} · {replies} {replies === 1 ? "reply" : "replies"}
                  </p>
                  <p className="mt-2 line-clamp-2 text-sm text-muted">{t.body}</p>
                </Card>
              </button>
            </li>
          );
        })}
      </ul>

      <form onSubmit={onNewThread} className="space-y-3 rounded-2xl border border-card-border bg-card p-5">
        <h3 className="font-semibold">Start a new thread</h3>
        <p className="text-xs text-muted">Display name only — no surnames, phones, or addresses.</p>
        <input
          className="w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm"
          placeholder="Display name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={40}
          required
        />
        <input
          className="w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm"
          placeholder="Thread title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
          required
        />
        <textarea
          className="min-h-24 w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm"
          placeholder="Your kind question or note…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={2000}
          required
        />
        <button type="submit" className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
          Post thread
        </button>
        {status && <p className="text-sm text-muted">{status}</p>}
      </form>
    </div>
  );
}
