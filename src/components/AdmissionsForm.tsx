"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";

export function AdmissionsForm() {
  const [status, setStatus] = useState<"idle" | "success">("idle");

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("success");
    e.currentTarget.reset();
  }

  if (status === "success") {
    return (
      <div
        role="status"
        className="rounded-2xl border border-primary/30 bg-accent-soft p-8 text-center"
      >
        <p className="text-lg font-semibold text-foreground">Enquiry received</p>
        <p className="mt-2 text-sm text-muted">
          Thank you. This demonstration form confirms your enquiry locally only.
          Full applications and document upload are completed through the{" "}
          <Link href="/login" className="font-medium text-primary underline">
            Login Portal
          </Link>
          .
        </p>
        <button
          type="button"
          onClick={() => setStatus("idle")}
          className="mt-6 rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground"
        >
          Submit another enquiry
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-2xl border border-card-border bg-card p-6 shadow-sm"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="parent-name" className="block text-sm font-medium">
            Parent / guardian name
          </label>
          <input
            id="parent-name"
            name="parentName"
            required
            className="mt-1 w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="parent-email" className="block text-sm font-medium">
            Email
          </label>
          <input
            id="parent-email"
            name="email"
            type="email"
            required
            className="mt-1 w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm"
          />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="child-name" className="block text-sm font-medium">
            Child&apos;s name
          </label>
          <input
            id="child-name"
            name="childName"
            required
            className="mt-1 w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="year-group" className="block text-sm font-medium">
            Requested year group
          </label>
          <select
            id="year-group"
            name="yearGroup"
            required
            className="mt-1 w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm"
            defaultValue=""
          >
            <option value="" disabled>
              Select…
            </option>
            <option>FS1</option>
            <option>FS2</option>
            <option>Year 1</option>
            <option>Year 2</option>
            <option>Year 3</option>
            <option>Year 4</option>
            <option>Year 5</option>
            <option>Year 6</option>
            <option>Year 7</option>
            <option>Year 8</option>
            <option>Year 9</option>
            <option>Year 10</option>
            <option>Year 11</option>
            <option>Year 12</option>
            <option>Year 13</option>
          </select>
        </div>
      </div>
      <div>
        <label htmlFor="phone" className="block text-sm font-medium">
          Phone
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          className="mt-1 w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label htmlFor="notes" className="block text-sm font-medium">
          Additional notes
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={4}
          className="mt-1 w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm"
        />
      </div>
      <button
        type="submit"
        className="w-full rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition hover:opacity-90"
      >
        Submit enquiry
      </button>
      <p className="text-xs text-muted">
        Full applications also go through the Login Portal after an offer is made.
      </p>
    </form>
  );
}
