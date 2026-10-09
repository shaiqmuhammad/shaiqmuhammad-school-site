import type { Metadata } from "next";
import { Suspense } from "react";
import { LmsParentPage } from "@/components/lms/LmsExtraPages";

export const metadata: Metadata = { title: "Parent view", robots: { index: false, follow: false } };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <LmsParentPage />
    </Suspense>
  );
}
