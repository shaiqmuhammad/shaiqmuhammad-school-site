import type { ReactNode } from "react";

export function Card({
  children,
  className = "",
  id,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <div
      id={id}
      className={`rounded-2xl border border-card-border bg-card p-6 shadow-sm ${className}`}
    >
      {children}
    </div>
  );
}
