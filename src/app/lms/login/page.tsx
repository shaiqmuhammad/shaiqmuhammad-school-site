import type { Metadata } from "next";
import { Suspense } from "react";
import { LmsLogin } from "@/components/lms/LmsLogin";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

export default function Page() {
  return (
    <Suspense fallback={null}>
      <LmsLogin />
    </Suspense>
  );
}
