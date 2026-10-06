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
      className={`glass rounded-[18px] p-6 ${className}`}
    >
      {children}
    </div>
  );
}
