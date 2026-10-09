import type { Metadata } from "next";
import { Suspense } from "react";
import { JoinRouter } from "@/components/activity/JoinRouter";

export const metadata: Metadata = {
  title: "Join a class activity",
  description: "Enter the code your teacher shows to join a live class assessment or activity.",
};

/** Short link for students: www.shaiqmuhammad.com/join (also /join?code=ABC123). 5-character codes open classroom activities. */
export default function ShortJoinPage() {
  return (
    <Suspense fallback={null}>
      <JoinRouter />
    </Suspense>
  );
}
