import type { Metadata } from "next";
import { QrLoginPage } from "@/components/lms/LmsAccountPages";

export const metadata: Metadata = { title: "Signing in", robots: { index: false, follow: false } };

export default function Page() {
  return <QrLoginPage />;
}
