"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/** t294: renders overlays (side panels, drawers) on <body> so no page stacking context (e.g. the admin top bar) can cover them. */
export function BodyPortal({ children }: { children: React.ReactNode }) {
  const [on, setOn] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- document exists only after mount
  useEffect(() => setOn(true), []);
  return on ? createPortal(children, document.body) : null;
}
