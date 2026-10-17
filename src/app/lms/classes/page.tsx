import type { Metadata } from "next";
import { LmsClassesPage } from "@/components/lms/LmsClasses";

export const metadata: Metadata = { title: "My classes", robots: { index: false, follow: false } };

export default function Page() {
  return <LmsClassesPage />;
}
