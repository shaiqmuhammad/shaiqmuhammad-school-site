// Browser/Node globals referenced by client-only helpers in the shared src/lib/*.ts files.
// They are never called inside the Worker; these declarations only keep `tsc` quiet.
declare const window: unknown;
declare const localStorage: { getItem(key: string): string | null; setItem(key: string, value: string): void };
declare const process: { env: Record<string, string | undefined> };
interface RequestInit {
  cache?: string;
}
