import type { Metadata } from "next";
import { Suspense } from "react";
import { LmsSetup } from "@/components/lms/LmsSetup";

export const metadata: Metadata = {
  title: "Classes & subjects — admin",
  robots: { index: false, follow: false },
};

export default function Page() {
  return (
    <Suspense fallback={null}>
      <LmsSetup />
    </Suspense>
  );
}
