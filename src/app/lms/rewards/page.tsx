import type { Metadata } from "next";
import { RewardsPage } from "@/components/lms/Rewards";

export const metadata: Metadata = { title: "Reward Cards", robots: { index: false, follow: false } };

export default function Page() {
  return <RewardsPage />;
}
