import type { Metadata } from "next";
import { Suspense } from "react";
import { LmsAdmin } from "@/components/lms/LmsAdmin";

export const metadata: Metadata = {
  title: "Teachers — admin",
  robots: { index: false, follow: false },
};

export default function Page() {
  return (
    <Suspense fallback={null}>
      <LmsAdmin role="teacher" />
    </Suspense>
  );
}
