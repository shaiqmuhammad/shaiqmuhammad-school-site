import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center px-4 py-24 text-center">
      <p className="text-sm font-semibold uppercase tracking-wide text-primary">404</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Page not found</h1>
      <p className="mt-3 text-muted">
        The page you requested does not exist or may have moved.
      </p>
      <Link
        href="/"
        className="mt-8 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground"
      >
        Back to home
      </Link>
    </div>
  );
}
