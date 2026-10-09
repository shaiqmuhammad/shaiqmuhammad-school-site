import type { Metadata } from "next";
import { SpinningWheel } from "@/components/activity/SpinningWheel";

export const metadata: Metadata = {
  title: "Spinning wheel",
  robots: { index: false, follow: false },
};

export default function WheelPage() {
  return <SpinningWheel />;
}
