import type { Metadata } from "next";
import { StandardsBook } from "@/components/lms/StandardsBook";

export const metadata: Metadata = { title: "Standards book", robots: { index: false, follow: false } };

export default function Page() {
  return <StandardsBook />;
}
