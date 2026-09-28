import type { Metadata } from "next";
import { Suspense } from "react";
import { GroupJoin } from "@/components/assessment/GroupJoin";

export const metadata: Metadata = {
  title: "Join a class assessment",
  description: "Enter the code your teacher shows to join a live class assessment.",
};

export default function JoinPage() {
  return (
    <Suspense fallback={null}>
      <GroupJoin />
    </Suspense>
  );
}
