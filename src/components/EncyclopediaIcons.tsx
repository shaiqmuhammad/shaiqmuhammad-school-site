/** Inline SVG icons for the Learning Libraries encyclopedias. */

export function QuranBookIcon({ className = "h-10 w-10" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      fill="none"
      className={className}
      aria-hidden
    >
      <rect x="8" y="10" width="48" height="44" rx="4" stroke="currentColor" strokeWidth="2.5" />
      <path
        d="M32 10v44"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.5"
      />
      <path
        d="M18 22h10M18 30h10M18 38h8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M36 22h10M36 30h10M36 38h8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="32" cy="48" r="3" fill="currentColor" opacity="0.85" />
      <path
        d="M28 16c2.5-3 5.5-3 8 0"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function HadithScrollIcon({ className = "h-10 w-10" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      fill="none"
      className={className}
      aria-hidden
    >
      <path
        d="M14 16c0-3 2.5-5 6-5h24c3.5 0 6 2 6 5v6H14v-6z"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path
        d="M14 22h36v24c0 3-2.5 5-6 5H20c-3.5 0-6-2-6-5V22z"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path
        d="M22 30h20M22 38h16M22 46h12"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="48" cy="18" r="2.5" fill="currentColor" />
    </svg>
  );
}
