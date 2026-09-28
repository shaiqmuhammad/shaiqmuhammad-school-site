export const portalRoles = [
  {
    role: "Student",
    description:
      "Students view timetables, homework, grades, and school notices in the portal.",
  },
  {
    role: "Teacher",
    description:
      "Teachers mark attendance, enter assessments, share resources, and communicate with families.",
  },
  {
    role: "Parent",
    description:
      "Parents follow progress, attendance, and school communications for their children.",
  },
  {
    role: "Admin / SLT",
    description:
      "School administrators and senior leaders manage users, settings, and oversight reports.",
  },
] as const;

export function getPortalUrl(): string {
  return (
    process.env.NEXT_PUBLIC_PORTAL_URL?.trim() || "http://localhost:8080"
  );
}
