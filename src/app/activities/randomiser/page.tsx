import type { Metadata } from "next";
import { Randomiser } from "@/components/activity/Randomiser";

export const metadata: Metadata = {
  title: "Randomiser",
  robots: { index: false, follow: false },
};

export default function RandomiserPage() {
  return <Randomiser />;
}
