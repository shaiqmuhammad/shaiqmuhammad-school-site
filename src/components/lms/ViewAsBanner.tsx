"use client";

import { useEffect, useState } from "react";
import { exitViewAs, viewAs, type ViewAs } from "@/lib/lms";
import { useTr } from "@/components/lms/useLms";

/** Shown on every /lms page while an admin is viewing as a student/teacher (read-only, this tab only). */
export function ViewAsBanner() {
  const { tr } = useTr();
  const [va, setVa] = useState<ViewAs | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setVa(viewAs()), 50); // after useLmsActor stored ?viewAs=
    return () => clearTimeout(t);
  }, []);
  // t329: no writing as the student — composers are disabled and any form submit/Enter-to-send is swallowed (the server rejects it too).
  useEffect(() => {
    if (!va) return;
    const note = tr("Read-only while viewing as a student", "للعرض فقط أثناء العرض كطالب");
    const lock = () => document.querySelectorAll<HTMLTextAreaElement | HTMLInputElement>("main textarea, main input[type=text], main input:not([type]), [contenteditable=true]").forEach((el) => {
      if (el.dataset.vaLocked) return;
      el.dataset.vaLocked = "1";
      if ("disabled" in el) { el.disabled = true; el.placeholder = note; } else (el as HTMLElement).contentEditable = "false";
    });
    const stop = (e: Event) => { e.preventDefault(); e.stopPropagation(); };
    const key = (e: KeyboardEvent) => { if (e.key === "Enter" && (e.target as HTMLElement)?.tagName === "TEXTAREA") stop(e); };
    lock();
    const mo = new MutationObserver(lock);
    mo.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("submit", stop, true);
    document.addEventListener("keydown", key, true);
    return () => { mo.disconnect(); document.removeEventListener("submit", stop, true); document.removeEventListener("keydown", key, true); };
  }, [va, tr]);
  if (!va) return null;
  return (
    <div role="status" className="sticky top-0 z-[60] flex flex-wrap items-center justify-center gap-3 bg-sun px-4 py-2 text-center text-sm font-bold text-header shadow" data-testid="viewas-banner">
      <span>👁 {tr(`Viewing as ${va.name} (read-only — you can't send messages or post as them)`, `عرض كـ ${va.name} (للعرض فقط — لا يمكنك المراسلة أو النشر باسمه)`)}</span>
      <button type="button" className="rounded-full bg-header px-3 py-1 text-white" onClick={() => { exitViewAs(); window.close(); window.location.href = va.by === "t" ? "/lms/students" : "/admin#students"; }} data-testid="viewas-exit">{tr("Exit", "خروج")}</button>
    </div>
  );
}
