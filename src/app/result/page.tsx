import type { Metadata } from "next";
import { PublicResultPage } from "@/components/lms/SavedActivities";

export const metadata: Metadata = { title: "Activity results", robots: { index: false, follow: false } };

export default function Page() {
  return <PublicResultPage />;
}
