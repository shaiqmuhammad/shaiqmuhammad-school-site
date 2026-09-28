"use client";

import { useState, type ReactNode } from "react";
import { downloadCertificatePdf } from "@/lib/certificatePdf";
import { downloadJson, getStoredGithubToken, publishJsonToGithub } from "@/lib/githubPublish";
import {
  GITHUB_CERTIFICATE_PATH, normalizeCertificate,
  type CertificateTemplate,
} from "@/lib/quiz";

type Props = {
  setStatus: (s: string) => void;
  onNeedToken: () => void;
  tpl: CertificateTemplate;
  setTpl: React.Dispatch<React.SetStateAction<CertificateTemplate>>;
};

const input = "mt-1.5 w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";
const btn = "rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60";
const btnGhost = "rounded-full border border-card-border px-3 py-1.5 text-sm";

export default function AdminCertificate({ setStatus, onNeedToken, tpl, setTpl }: Props) {
  const [busy, setBusy] = useState(false);

  function set<K extends keyof CertificateTemplate>(key: K, value: CertificateTemplate[K]) {
    setTpl((prev) => ({ ...prev, [key]: value }));
  }

  async function publish() {
    const token = getStoredGithubToken();
    if (!token) { setStatus("No GitHub token. Open Settings."); onNeedToken(); return; }
    setBusy(true); setStatus("Publishing certificate.json…");
    const r = await publishJsonToGithub(GITHUB_CERTIFICATE_PATH, normalizeCertificate(tpl), token, "chore(quiz): update certificate design via admin");
    setBusy(false);
    setStatus(r.ok ? `Published ${GITHUB_CERTIFICATE_PATH}. ${r.htmlUrl || ""}` : r.error);
  }

  function preview() {
    downloadCertificatePdf({
      template: normalizeCertificate(tpl),
      quizTitle: "Sample Quiz",
      positionLabel: "1 of 10",
      result: { id: "preview", quizId: "preview", quizSlug: "preview", name: "Sample Student", score: 18, maxScore: 20, percentage: 90, finishedAt: new Date().toISOString() },
    });
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap justify-between gap-2">
        <h2 className="text-xl font-semibold">Certificate design</h2>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btnGhost} onClick={preview}>Preview PDF</button>
          <button type="button" className={btnGhost} onClick={() => downloadJson(normalizeCertificate(tpl), "certificate.json")}>Download JSON</button>
          <button type="button" disabled={busy} className={btn} onClick={publish}>Publish certificate</button>
        </div>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-3 rounded-2xl border border-card-border bg-card p-5">
          <Field label="Certificate title"><input className={input} value={tpl.title} onChange={(e) => set("title", e.target.value)} /></Field>
          <Field label="Subtitle"><textarea className={input + " min-h-16"} value={tpl.subtitle} onChange={(e) => set("subtitle", e.target.value)} /></Field>
          <Field label="School / teacher name"><input className={input} value={tpl.schoolName} onChange={(e) => set("schoolName", e.target.value)} /></Field>
          <Field label="Footer text"><input className={input} value={tpl.footerText} onChange={(e) => set("footerText", e.target.value)} /></Field>
          <Field label="Logo URL (optional, shown on screen preview)"><input className={input} value={tpl.logoUrl} onChange={(e) => set("logoUrl", e.target.value)} /></Field>
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm font-medium">Border colour <input type="color" value={tpl.borderColor} onChange={(e) => set("borderColor", e.target.value)} /></label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={tpl.showPosition} onChange={(e) => set("showPosition", e.target.checked)} /> Show position</label>
          </div>
        </div>
        <div className="rounded-2xl bg-white p-3 text-center text-neutral-800 shadow-sm">
          <div className="flex h-full flex-col items-center justify-center gap-2 border-4 p-6" style={{ borderColor: tpl.borderColor }}>
            {tpl.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={tpl.logoUrl} alt="Logo" className="h-12 w-auto" />
            )}
            <p className="text-xl font-bold">{tpl.title}</p>
            <p className="text-xs text-neutral-500">{tpl.subtitle}</p>
            <p className="mt-2 text-2xl font-bold" style={{ color: tpl.borderColor }}>Sample Student</p>
            <p className="text-sm">Quiz: Sample Quiz</p>
            <p className="font-semibold">Marks obtained: 18/20 (90%)</p>
            {tpl.showPosition && <p className="text-sm text-neutral-600">Position: 1 of 10</p>}
            <p className="mt-3 text-sm font-semibold" style={{ color: tpl.borderColor }}>{tpl.schoolName}</p>
            <p className="text-xs italic text-neutral-500">{tpl.footerText}</p>
          </div>
        </div>
      </div>
      <p className="text-xs text-muted">Changes apply to every certificate students download after you publish (site rebuilds in ~1–2 minutes).</p>
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block text-sm font-medium">{label}{children}</label>;
}
