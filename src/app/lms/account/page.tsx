import type { Metadata } from "next";
import { AccountPage } from "@/components/lms/LmsAccountPages";

export const metadata: Metadata = { title: "My account", robots: { index: false, follow: false } };

export default function Page() {
  return <AccountPage />;
}
