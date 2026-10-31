import type { Metadata } from "next";
import { SavedActivitiesPage } from "@/components/lms/SavedActivities";

export const metadata: Metadata = { title: "Saved activity results", robots: { index: false, follow: false } };

export default function Page() {
  return <SavedActivitiesPage />;
}
