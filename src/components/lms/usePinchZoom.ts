"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

function isField(t: EventTarget | null) {
  const el = t as HTMLElement | null;
  return !!el?.closest?.("input, textarea, select, [contenteditable='true'], [contenteditable='']");
}

/** Pinch and ctrl+wheel zoom for a student slide. Off while a writing tool is active, and while the pointer is in a text field. */
export function usePinchZoom(active: boolean) {
  const [zoom, setZoom] = useState(1);
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch0 = useRef(0);
  const zoom0 = useRef(1);
  const zoomRef = useRef(1);
  const activeRef = useRef(active);
  zoomRef.current = zoom;
  activeRef.current = active;
  useEffect(() => {
    if (!node) return;
    const wheel = (e: WheelEvent) => {
      if (!activeRef.current || !e.ctrlKey || isField(e.target)) return;
      e.preventDefault();
      setZoom((z) => Math.min(3, Math.max(0.6, +(z * (e.deltaY > 0 ? 0.92 : 1.08)).toFixed(2))));
    };
    const touch = (e: TouchEvent) => {
      if (!activeRef.current || e.touches.length < 2 || isField(e.target)) return;
      e.preventDefault();
    };
    node.addEventListener("wheel", wheel, { passive: false });
    node.addEventListener("touchmove", touch, { passive: false });
    return () => {
      node.removeEventListener("wheel", wheel);
      node.removeEventListener("touchmove", touch);
    };
  }, [node]);
  const down = (ev: ReactPointerEvent) => {
    if (!activeRef.current || isField(ev.target)) return false;
    pointers.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch0.current = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      zoom0.current = zoomRef.current;
      return true;
    }
    return false;
  };
  const move = (ev: ReactPointerEvent) => {
    if (!activeRef.current || !pointers.current.has(ev.pointerId)) return;
    pointers.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (pointers.current.size === 2 && pinch0.current) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      setZoom(Math.min(3, Math.max(0.6, +(zoom0.current * (d / pinch0.current)).toFixed(2))));
    }
  };
  const up = (ev: ReactPointerEvent) => {
    const wasPinch = pointers.current.size >= 2;
    pointers.current.delete(ev.pointerId);
    if (pointers.current.size < 2) pinch0.current = 0;
    return wasPinch;
  };
  return { zoom, setZoom, ref: setNode, down, move, up };
}
