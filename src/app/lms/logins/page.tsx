import type { Metadata } from "next";
import { LoginsPage } from "@/components/lms/LmsAccountPages";

export const metadata: Metadata = { title: "Student Logins", robots: { index: false, follow: false } };

export default function Page() {
  return <LoginsPage />;
}
