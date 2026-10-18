import type { Metadata } from "next";
import { CurriculumPage } from "@/components/lms/mods/Curriculum";

export const metadata: Metadata = { title: "Curriculum", robots: { index: false, follow: false } };

export default function Page() {
  return <CurriculumPage />;
}
