"use client";

import { useEffect } from "react";

/** Old /lms management URLs now live in the Admin area (admin session only). */
export function ToAdmin({ tab }: { tab: string }) {
  useEffect(() => {
    window.location.replace(`/admin#${tab}`);
  }, [tab]);
  return <p className="p-10 text-center opacity-70">→ <a className="underline" href={`/admin#${tab}`}>Admin</a></p>;
}
