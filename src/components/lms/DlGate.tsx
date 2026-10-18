"use client";

import type { ReactNode } from "react";
import { useDl } from "@/lib/dl";

/** Renders its children only while the admin allows this kind of download for the signed-in person. */
export function DlGate({ kind, children }: { kind: "audio" | "export"; children: ReactNode }) {
  const p = useDl();
  return p[kind] ? <>{children}</> : null;
}
