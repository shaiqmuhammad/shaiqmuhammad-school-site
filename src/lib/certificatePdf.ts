import { jsPDF } from "jspdf";
import type { CertificateTemplate, QuizResult } from "@/lib/quiz";

export type CertificatePayload = {
  template: CertificateTemplate;
  result: QuizResult;
  quizTitle: string;
  /** Rank string e.g. "3 of 12" or empty to hide */
  positionLabel?: string;
};

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "").trim();
  if (h.length === 3) {
    const r = parseInt(h[0] + h[0], 16);
    const g = parseInt(h[1] + h[1], 16);
    const b = parseInt(h[2] + h[2], 16);
    return [r, g, b];
  }
  if (h.length === 6) {
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  return [15, 118, 110];
}

/** Load an image URL as a PNG data URL (browser only). Returns null on CORS / load failure. */
async function loadLogo(url: string): Promise<string | null> {
  if (!url || typeof window === "undefined") return null;
  if (url.startsWith("data:image/png") || url.startsWith("data:image/jpeg")) return url;
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    const timer = setTimeout(() => resolve(null), 5000);
    img.onload = () => {
      clearTimeout(timer);
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        canvas.getContext("2d")?.drawImage(img, 0, 0);
        resolve(canvas.toDataURL("image/png"));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };
    img.src = url;
  });
}

export async function downloadCertificatePdf(payload: CertificatePayload): Promise<void> {
  const { template, result, quizTitle, positionLabel } = payload;
  const logo = await loadLogo(template.logoUrl);
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const [r, g, b] = hexToRgb(template.borderColor || "#0f766e");

  // Outer border
  doc.setDrawColor(r, g, b);
  doc.setLineWidth(4);
  doc.rect(24, 24, pageW - 48, pageH - 48);
  doc.setLineWidth(1.5);
  doc.rect(34, 34, pageW - 68, pageH - 68);

  // Accent bar
  doc.setFillColor(r, g, b);
  doc.rect(48, 52, pageW - 96, 8, "F");

  // Shift content down when a logo is shown
  const o = logo ? 40 : 20;
  if (logo) {
    try {
      const props = doc.getImageProperties(logo);
      const h = 50;
      const w = Math.min(160, (props.width / props.height) * h);
      doc.addImage(logo, "PNG", pageW / 2 - w / 2, 72, w, h);
    } catch {
      // ignore bad image
    }
  }

  doc.setTextColor(30, 30, 30);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(28);
  doc.text(template.title || "Certificate of Achievement", pageW / 2, 100 + o + 10, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.setTextColor(80, 80, 80);
  const subtitle = doc.splitTextToSize(
    template.subtitle || "This certifies successful completion of the quiz",
    pageW - 140,
  );
  doc.text(subtitle, pageW / 2, 140 + o, { align: "center" });

  doc.setTextColor(r, g, b);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(26);
  doc.text(result.name || "Student", pageW / 2, 215 + o, { align: "center" });

  doc.setDrawColor(r, g, b);
  doc.setLineWidth(0.8);
  doc.line(pageW / 2 - 140, 227 + o, pageW / 2 + 140, 227 + o);

  doc.setTextColor(40, 40, 40);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(13);
  doc.text(`Quiz: ${quizTitle}`, pageW / 2, 262 + o, { align: "center" });

  const marks = `${result.score}/${result.maxScore} (${result.percentage}%)`;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(`Marks obtained: ${marks}`, pageW / 2, 295 + o, { align: "center" });

  if (template.showPosition && positionLabel) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    doc.setTextColor(60, 60, 60);
    doc.text(`Position: ${positionLabel}`, pageW / 2, 322 + o, { align: "center" });
  }

  const dateStr = new Date(result.finishedAt).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  doc.setFontSize(11);
  doc.setTextColor(80, 80, 80);
  doc.text(`Date: ${dateStr}`, pageW / 2, 350 + o, { align: "center" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(r, g, b);
  doc.text(template.schoolName || "Shaiq Muhammad Learning Platform", pageW / 2, pageH - 90, {
    align: "center",
  });

  if (template.footerText) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text(template.footerText, pageW / 2, pageH - 68, { align: "center" });
  }

  const safeName = (result.name || "student").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-") || "student";
  doc.save(`certificate-${safeName}.pdf`);
}
