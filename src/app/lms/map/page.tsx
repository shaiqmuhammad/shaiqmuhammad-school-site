import type { Metadata } from "next";
import { Suspense } from "react";
import { LmsMapPage } from "@/components/lms/LmsExtraPages";

export const metadata: Metadata = { title: "Class Quran map", robots: { index: false, follow: false } };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <LmsMapPage />
    </Suspense>
  );
}
