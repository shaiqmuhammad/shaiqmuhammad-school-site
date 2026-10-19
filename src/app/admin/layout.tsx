import type { ReactNode } from "react";
import { OriginMark } from "@/components/OriginMark";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <OriginMark area="admin" />
      {children}
    </>
  );
}
