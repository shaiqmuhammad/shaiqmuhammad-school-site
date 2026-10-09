import type { Metadata } from "next";
import { Suspense } from "react";
import { LmsHomework } from "@/components/lms/LmsHomework";

export const metadata: Metadata = {
  title: "Homework",
  robots: { index: false, follow: false },
};

export default function Page() {
  return (
    <Suspense fallback={null}>
      <LmsHomework />
    </Suspense>
  );
}
