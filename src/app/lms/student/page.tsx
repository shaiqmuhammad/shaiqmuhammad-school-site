import type { Metadata } from "next";
import { Suspense } from "react";
import { LmsStudentPage } from "@/components/lms/LmsExtraPages";

export const metadata: Metadata = { title: "Student progress", robots: { index: false, follow: false } };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <LmsStudentPage />
    </Suspense>
  );
}
