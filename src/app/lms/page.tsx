import type { Metadata } from "next";
import { Suspense } from "react";
import { LmsDashboard } from "@/components/lms/LmsDashboard";

export const metadata: Metadata = {
  title: "Students & teachers",
  robots: { index: false, follow: false },
};

export default function Page() {
  return (
    <Suspense fallback={null}>
      <LmsDashboard />
    </Suspense>
  );
}
