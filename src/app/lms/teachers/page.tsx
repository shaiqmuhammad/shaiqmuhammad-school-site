import type { Metadata } from "next";
import { ToAdmin } from "@/components/lms/ToAdmin";

export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };

export default function Page() {
  return <ToAdmin tab="teachers" />;
}
