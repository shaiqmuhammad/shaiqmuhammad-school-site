import type { Metadata } from "next";
import { Suspense } from "react";
import { GroupJoin } from "@/components/assessment/GroupJoin";

export const metadata: Metadata = {
  title: "Join a class assessment",
  description: "Enter the code your teacher shows to join a live class assessment.",
};

/** Short link for students: www.shaiqmuhammad.com/join (also /join?code=ABC123 and /join/ABC123). */
export default function ShortJoinPage() {
  return (
    <Suspense fallback={null}>
      <GroupJoin />
    </Suspense>
  );
}
