import { getServerSession } from "@/lib/adminServer";
import { ASSESSMENT_API_BASE } from "@/lib/groupSession";
import { viewAs } from "@/lib/lms";

/** Admin → Backup (worker: workers/assessment-session/src/backup.ts). Admin session only. */
const API = `${ASSESSMENT_API_BASE}/api/backup`;

export type BackupFreq = "off" | "daily" | "weekly" | "monthly";
export type BackupKind = "manual" | "daily" | "weekly" | "monthly" | "before-restore";
export type BackupRun = { at: number; ok: boolean; kind: BackupKind; includeData: boolean; key?: string; size?: number; rows?: number; error?: string };
export type BackupStatus = { ready: boolean; cfg: { freq: BackupFreq; includeData: boolean; savedAt?: number }; status: { last?: BackupRun; lastAuto?: BackupRun }; nextRun: number | null; now: number; keep: Record<BackupKind, number> };
export type BackupItem = { key: string; kind: BackupKind; includeData: boolean; created: number; size: number; rows?: number; fileName: string };
export type RestoreResult = { ok: true; tables: number; rows: number; skipped: string[]; safetyKey?: string };

export class BackupError extends Error {
  constructor(message: string, readonly status = 0) { super(message); }
}

function headers(json = false): Record<string, string> {
  const s = getServerSession();
  if (!s) throw new BackupError("unauthorized", 401);
  const h: Record<string, string> = { Authorization: `Bearer ${s.token}` };
  const va = viewAs();
  if (va && va.by !== "t") h["X-View-As"] = va.id; // the server refuses backups while viewing as someone
  if (json) h["Content-Type"] = "application/json";
  return h;
}

async function call<T>(path: string, body?: unknown, raw?: Blob): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API}/${path}`, {
      method: body === undefined && !raw ? "GET" : "POST",
      headers: headers(body !== undefined || !!raw),
      body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
      cache: "no-store",
    });
  } catch {
    throw new BackupError("network");
  }
  const data = (await res.json().catch(() => ({}))) as T & { error?: string; detail?: string };
  if (!res.ok) throw new BackupError(data.error || `http_${res.status}`, res.status);
  return data;
}

export const backupApi = {
  status: () => call<BackupStatus>("status"),
  list: () => call<{ items: BackupItem[] }>("list").then((r) => r.items),
  saveSchedule: (freq: BackupFreq, includeData: boolean) => call<{ cfg: BackupStatus["cfg"]; nextRun: number | null }>("settings", { freq, includeData }),
  run: (includeData: boolean) => call<{ item: BackupItem }>("run", { includeData }).then((r) => r.item),
  remove: (key: string) => call<{ ok: boolean }>("delete", { key }),
  restore: (file: Blob) => call<RestoreResult>("restore?confirm=RESTORE", undefined, file),
  /** Fetch the file with the admin session and save it on this computer as a normal download. */
  async download(item: Pick<BackupItem, "key" | "fileName">) {
    let res: Response;
    try {
      res = await fetch(`${API}/download?key=${encodeURIComponent(item.key)}`, { headers: headers(), cache: "no-store" });
    } catch {
      throw new BackupError("network");
    }
    if (!res.ok) throw new BackupError((((await res.json().catch(() => ({}))) as { error?: string }).error) || `http_${res.status}`, res.status);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = item.fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
    return blob.size;
  },
};

export const BACKUP_FORMAT = "shaiqmuhammad-school-backup";
