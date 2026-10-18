import { jsPDF } from "jspdf";
import { dlGrant } from "@/lib/dl";
import type { CertificateTemplate, QuizResult } from "@/lib/quiz";
import { designFor, loadCertCollection, PAGE_H, PAGE_W, renderCertificate, type CertDesign } from "@/lib/certificateDesign";

export type CertificatePayload = {
  /** Legacy template (kept for callers; the chosen design on the server is used instead). */
  template?: CertificateTemplate;
  result: QuizResult;
  quizTitle: string;
  /** Rank string e.g. "3 of 12" or empty to hide */
  positionLabel?: string;
  /** Which assessment mode this certificate is for (decides which design is used). */
  kind?: "individual" | "group";
  /** Use this design instead of the one chosen for the assessment (admin preview). */
  design?: CertDesign;
};

/** Draws the chosen design on a canvas and places it on an A4 landscape PDF page. */
export async function buildCertificatePdf(payload: CertificatePayload): Promise<{ doc: jsPDF; fileName: string }> {
  const { result, quizTitle, positionLabel } = payload;
  const design = payload.design || designFor(await loadCertCollection(), result.quizId, payload.kind || "individual");
  const canvas = document.createElement("canvas");
  await renderCertificate(canvas, design, { name: result.name || "Student", quizTitle, score: result.score, maxScore: result.maxScore, percentage: result.percentage, finishedAt: result.finishedAt, positionLabel }, 2.4);
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  doc.addImage(canvas.toDataURL("image/jpeg", 0.93), "JPEG", 0, 0, doc.internal.pageSize.getWidth() || PAGE_W, doc.internal.pageSize.getHeight() || PAGE_H);
  const safeName = (result.name || "student").replace(/[^\p{L}\p{N}\s-]/gu, "").trim().replace(/\s+/g, "-") || "student";
  return { doc, fileName: `certificate-${safeName}.pdf` };
}

export async function downloadCertificatePdf(payload: CertificatePayload): Promise<void> {
  if (!(await dlGrant("export"))) return;
  const { doc, fileName } = await buildCertificatePdf(payload);
  doc.save(fileName);
}
