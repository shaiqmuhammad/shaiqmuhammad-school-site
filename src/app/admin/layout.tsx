import type { Metadata } from "next";
import type { ReactNode } from "react";

// The admin area installs as its own app ("Shaiq Admin", scope /admin).
export const metadata: Metadata = {
  manifest: "/admin.webmanifest",
  applicationName: "Shaiq Admin",
  appleWebApp: { capable: true, title: "Shaiq Admin", statusBarStyle: "default" },
};
import { OriginMark } from "@/components/OriginMark";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <OriginMark area="admin" />
      {children}
    </>
  );
}
