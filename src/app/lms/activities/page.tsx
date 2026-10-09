import type { Metadata } from "next";
import { LmsActivitiesPage } from "@/components/lms/LmsActivities";

export const metadata: Metadata = { title: "Classroom", robots: { index: false, follow: false } };

export default function Page() {
  return <LmsActivitiesPage />;
}
