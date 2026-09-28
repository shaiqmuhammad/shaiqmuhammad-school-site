"use client";

import type { TeacherProfile } from "@/lib/content";
import { defaultTeacher } from "@/lib/content";
import { useLogoUrl } from "@/components/SiteBrand";

export function TeacherProfileCard({
  teacher,
  compact = false,
}: {
  teacher: TeacherProfile;
  compact?: boolean;
}) {
  const logoUrl = useLogoUrl();
  // The default teacher photo is the site logo, so an uploaded logo replaces it too.
  const photo = !teacher.photoUrl || teacher.photoUrl === defaultTeacher.photoUrl ? logoUrl : teacher.photoUrl;
  return (
    <div
      className={`overflow-hidden rounded-2xl border border-card-border bg-card shadow-sm ${
        compact ? "p-5" : "p-6 sm:p-8"
      }`}
    >
      <div className={`flex ${compact ? "flex-row items-center gap-4" : "flex-col gap-5 sm:flex-row sm:items-start"}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photo}
          alt={teacher.name}
          className={`shrink-0 rounded-full border-2 border-primary/20 bg-accent-soft object-cover ${
            compact ? "h-16 w-16" : "h-28 w-28 sm:h-32 sm:w-32"
          }`}
        />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">Your teacher</p>
          <h2 className={`font-semibold tracking-tight text-foreground ${compact ? "text-lg" : "text-2xl"}`}>
            {teacher.name}
          </h2>
          <p className="mt-1 text-sm text-muted">
            {teacher.title} · {teacher.location}
          </p>
          {!compact && (
            <p className="mt-3 text-sm leading-relaxed text-muted">{teacher.bio}</p>
          )}
          <ul className="mt-3 flex flex-wrap gap-2">
            {teacher.subjects.map((s) => (
              <li
                key={s}
                className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-medium text-primary"
              >
                {s}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
