import type { Metadata } from "next";
import { Suspense } from "react";
import { QrPage } from "@/components/lms/QrPage";

export const metadata: Metadata = { title: "Homework", robots: { index: false, follow: false, nocache: true }, referrer: "no-referrer" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <QrPage />
    </Suspense>
  );
}
