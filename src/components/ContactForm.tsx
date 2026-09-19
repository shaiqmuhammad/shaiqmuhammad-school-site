"use client";

import { FormEvent, useState } from "react";
import { siteConfig } from "@/content/site";

type Status = "idle" | "sending" | "success" | "error";

export function ContactForm() {
  const endpoint = process.env.NEXT_PUBLIC_CONTACT_FORM_ENDPOINT?.trim() || "";
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const form = e.currentTarget;
    const fd = new FormData(form);
    const name = String(fd.get("name") || "").trim();
    const email = String(fd.get("email") || "").trim();
    const message = String(fd.get("message") || "").trim();
    if (!name || !email || !message) return;

    if (endpoint) {
      setStatus("sending");
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({ name, email, message }),
        });
        if (!res.ok) throw new Error(`Form endpoint returned ${res.status}`);
        setStatus("success");
        form.reset();
      } catch (err) {
        setStatus("error");
        setError(err instanceof Error ? err.message : "Send failed");
      }
      return;
    }

    const subject = encodeURIComponent(`Learning site message from ${name}`);
    const body = encodeURIComponent(`Name: ${name}\nEmail: ${email}\n\n${message}`);
    window.location.href = `mailto:${siteConfig.email}?subject=${subject}&body=${body}`;
    setStatus("success");
    form.reset();
  }

  if (status === "success") {
    return (
      <div role="status" className="rounded-2xl border border-primary/30 bg-accent-soft p-8 text-center">
        <p className="text-lg font-semibold text-foreground">Thank you</p>
        <p className="mt-2 text-sm text-muted">
          {endpoint
            ? "Your message was sent. We will reply soon, inshaAllah."
            : "Your email app should open with the message ready to send. If it did not, email us directly."}
        </p>
        <button
          type="button"
          onClick={() => setStatus("idle")}
          className="mt-6 rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground"
        >
          Send another message
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-card-border bg-card p-6 shadow-sm">
      <div>
        <label htmlFor="contact-name" className="block text-sm font-medium">
          Full name
        </label>
        <input
          id="contact-name"
          name="name"
          required
          autoComplete="name"
          className="mt-1 w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label htmlFor="contact-email" className="block text-sm font-medium">
          Email
        </label>
        <input
          id="contact-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className="mt-1 w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label htmlFor="contact-message" className="block text-sm font-medium">
          Message
        </label>
        <textarea
          id="contact-message"
          name="message"
          required
          rows={5}
          className="mt-1 w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm"
        />
      </div>
      {status === "error" && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error || "Could not send. Try email instead."}{" "}
          <a className="underline" href={`mailto:${siteConfig.email}`}>
            {siteConfig.email}
          </a>
        </p>
      )}
      <button
        type="submit"
        disabled={status === "sending"}
        className="w-full rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
      >
        {status === "sending" ? "Sending…" : endpoint ? "Send message" : "Open email to send"}
      </button>
      <p className="text-xs text-muted">
        {endpoint
          ? "Messages go to the configured form endpoint (e.g. Formspree)."
          : `Static site fallback: opens mailto:${siteConfig.email}. Set NEXT_PUBLIC_CONTACT_FORM_ENDPOINT for Formspree.`}
      </p>
    </form>
  );
}
