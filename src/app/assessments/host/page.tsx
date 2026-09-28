import type { Metadata } from "next";
import { Suspense } from "react";
import { GroupHost } from "@/components/assessment/GroupHost";

export const metadata: Metadata = {
  title: "Host a group assessment",
  robots: { index: false, follow: false },
};

export default function HostPage() {
  return (
    <Suspense fallback={null}>
      <GroupHost />
    </Suspense>
  );
}
