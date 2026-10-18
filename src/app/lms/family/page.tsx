import type { Metadata } from "next";
import { FamilyPage } from "@/components/lms/Family";

export const metadata: Metadata = { title: "Parent dashboard", robots: { index: false, follow: false } };

export default function Page() {
  return <FamilyPage />;
}
