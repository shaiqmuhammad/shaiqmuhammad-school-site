"use client";

import { FormEvent, useState } from "react";
import { siteConfig } from "@/content/site";
import { ASSESSMENT_API_BASE } from "@/lib/groupSession";
import { useTr } from "@/components/lms/useLms";

type Status = "idle" | "sending" | "success" | "error";
const field = "mt-1 w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm";

/** Sends to the site Worker: stored in Admin and emailed to contact@ (Reply-To = sender); sender gets an acknowledgement. */
export function ContactForm() {
  const { tr } = useTr();
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const form = e.currentTarget;
    const fd = new FormData(form);
    const payload = Object.fromEntries(["name", "email", "subject", "message", "website"].map((k) => [k, String(fd.get(k) || "").trim()]));
    if (!payload.name || !payload.email || !payload.message) return;
    setStatus("sending");
    try {
      const res = await fetch(`${ASSESSMENT_API_BASE}/api/contact`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (res.status === 429) throw new Error(tr("Too many messages — please try again later.", "رسائل كثيرة — حاول لاحقًا."));
      if (res.status === 400) throw new Error(tr("Please check your email address and message.", "يرجى التحقق من البريد والرسالة."));
      if (!res.ok) throw new Error(tr("Could not send right now.", "تعذر الإرسال الآن."));
      setStatus("success");
      form.reset();
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : tr("Send failed", "فشل الإرسال"));
    }
  }

  if (status === "success") {
    return (
      <div role="status" className="rounded-2xl border border-primary/30 bg-accent-soft p-8 text-center" data-testid="contact-success">
        <p className="text-lg font-semibold text-foreground">{tr("Thank you", "شكرًا لك")}</p>
        <p className="mt-2 text-sm text-muted">{tr("Your message was sent. We will reply soon, in shaa Allah.", "تم إرسال رسالتك. سنرد قريبًا إن شاء الله.")}</p>
        <button type="button" onClick={() => setStatus("idle")} className="mt-6 rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground">{tr("Send another message", "أرسل رسالة أخرى")}</button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-card-border bg-card p-6 shadow-sm" data-testid="contact-form">
      <div>
        <label htmlFor="contact-name" className="block text-sm font-medium">{tr("Full name", "الاسم الكامل")}</label>
        <input id="contact-name" name="name" required maxLength={80} autoComplete="name" className={field} />
      </div>
      <div>
        <label htmlFor="contact-email" className="block text-sm font-medium">{tr("Email", "البريد الإلكتروني")}</label>
        <input id="contact-email" name="email" type="email" required maxLength={120} autoComplete="email" className={field} dir="ltr" />
      </div>
      <div>
        <label htmlFor="contact-subject" className="block text-sm font-medium">{tr("Subject", "الموضوع")}</label>
        <input id="contact-subject" name="subject" maxLength={150} className={field} />
      </div>
      <div>
        <label htmlFor="contact-message" className="block text-sm font-medium">{tr("Message", "الرسالة")}</label>
        <textarea id="contact-message" name="message" required minLength={5} maxLength={5000} rows={5} className={field} />
      </div>
      {/* Honeypot: hidden from people, bots fill it in. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="contact-website">Website</label>
        <input id="contact-website" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      {status === "error" && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300" role="alert">
          {error} {tr("You can also email", "يمكنك أيضًا المراسلة على")} <a className="underline" href={`mailto:${siteConfig.email}`}>{siteConfig.email}</a>
        </p>
      )}
      <button type="submit" disabled={status === "sending"} className="w-full rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-60" data-testid="contact-send">
        {status === "sending" ? tr("Sending…", "جارٍ الإرسال…") : tr("Send message", "إرسال الرسالة")}
      </button>
    </form>
  );
}
