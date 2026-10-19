import type { Metadata } from "next";
import { CorrectedHomeworkPage } from "@/components/lms/mods/CorrectedHomework";

export const metadata: Metadata = { title: "Corrected homework", robots: { index: false, follow: false } };

export default function Page() {
  return <CorrectedHomeworkPage />;
}
