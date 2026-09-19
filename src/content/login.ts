export const portalRoles = [
  {
    role: "Admin",
    description:
      "School administrators manage users, settings, calendars, and institutional records.",
  },
  {
    role: "SLT",
    description:
      "Senior Leadership Team members access oversight dashboards, reports, and pastoral summaries.",
  },
  {
    role: "Teacher",
    description:
      "Teachers mark attendance, enter assessments, share resources, and communicate with families.",
  },
  {
    role: "Student",
    description:
      "Students view timetables, homework, grades, and school notices.",
  },
  {
    role: "Parent",
    description:
      "Parents follow progress, attendance, fees, and school communications for their children.",
  },
] as const;

export function getPortalUrl(): string {
  return (
    process.env.NEXT_PUBLIC_PORTAL_URL?.trim() || "http://localhost:8080"
  );
}
