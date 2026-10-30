import type { Metadata } from "next";
import { LmsQaPage } from "@/components/qa/LmsQaPage";

export const metadata: Metadata = { title: "Progress Check QA", robots: { index: false, follow: false } };

export default function Page() {
  return <LmsQaPage />;
}
