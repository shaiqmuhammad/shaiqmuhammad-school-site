import type { Metadata } from "next";
import { Suspense } from "react";
import { ActivityHost } from "@/components/activity/ActivityHost";

export const metadata: Metadata = {
  title: "Host a class activity",
  robots: { index: false, follow: false },
};

export default function ActivityHostPage() {
  return (
    <Suspense fallback={null}>
      <ActivityHost />
    </Suspense>
  );
}
