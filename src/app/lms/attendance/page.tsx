import type { Metadata } from "next";
import { AttendancePage } from "@/components/lms/mods/Attendance";

export const metadata: Metadata = { title: "Attendance", robots: { index: false, follow: false } };

export default function Page() {
  return <AttendancePage />;
}
