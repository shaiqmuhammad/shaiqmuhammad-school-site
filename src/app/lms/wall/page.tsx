import type { Metadata } from "next";
import { LmsWallPage } from "@/components/lms/LmsWall";

export const metadata: Metadata = { title: "Class Wall", robots: { index: false, follow: false } };

export default function Page() {
  return <LmsWallPage />;
}
