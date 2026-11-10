/**
 * Admin → Backup: whole-system backups of the live school data. Files are kept on the server in a separate
 * SiteKV Durable Object instance named "backups" (chunked SQLite; R2 is not enabled on the school account).
 *
 *   GET  /api/backup/status                 schedule, last run, next run (Asia/Dubai), storage ready?
 *   GET  /api/backup/list                   saved backups (newest first)
 *   POST /api/backup/settings  {freq, includeData}   freq: off | daily | weekly | monthly
 *   POST /api/backup/run       {includeData}         make a backup now (saved on the server, then downloaded)
 *   GET  /api/backup/download?key=          the backup file (JSON)
 *   POST /api/backup/delete    {key}
 *   POST /api/backup/restore?confirm=RESTORE   body = a backup file. Saves a safety backup first, then replaces matching data.
 *
 * Admin session only (Bearer admin token, never while "viewing as" someone). Teachers/students get 403.
 * Backups never contain env secrets (passwords, signing keys, migrate key, OAuth tokens).
 * Scheduled runs: one cron a day at 22:15 UTC (= 02:15 Asia/Dubai). Daily runs every day, weekly on Sunday, monthly on the 1st.
 */
import { corsHeaders, verifyToken, type AdminEnv } from "./admin";

type Json = Record<string, unknown>;
type BkStub = { bk(op: string, input: Json): Promise<Json> };
type KvStub = { get(k: string): Promise<string | null>; set(k: string, v: string): Promise<void> };
export type Freq = "off" | "daily" | "weekly" | "monthly";
type Kind = "manual" | "daily" | "weekly" | "monthly" | "before-restore";
type Cfg = { freq: Freq; includeData: boolean; savedAt?: number };
type RunInfo = { at: number; ok: boolean; kind: Kind; includeData: boolean; key?: string; size?: number; rows?: number; error?: string };
type Status = { last?: RunInfo; lastAuto?: RunInfo };

type Vault = {
  vaultPut(key: string, i: number, bytes: Uint8Array): Promise<void>;
  vaultFinish(key: string, m: { kind: string; data: boolean; created: number; size: number; rows: number; chunks: number }): Promise<void>;
  vaultList(): Promise<{ key: string; kind: string; data: boolean; created: number; size: number; rows: number; chunks: number }[]>;
  vaultChunk(key: string, i: number): Promise<ArrayBuffer | null>;
  vaultDelete(key: string): Promise<void>;
};
export type BackupEnv = AdminEnv;

export const FORMAT = "shaiqmuhammad-school-backup";
const DUBAI_MS = 4 * 3600_000;
const KEEP: Record<Kind, number> = { daily: 14, weekly: 8, monthly: 12, manual: 20, "before-restore": 5 };
const CHUNK = 1_500_000; // under the 2 MB SQLite value limit
const enc = new TextEncoder();

// ---------- what goes in a backup ----------
type Store = { id: "lms" | "site" | "results" | "forum" | "activity"; binding: string; name: string; dataOnly?: boolean; kv?: boolean };
const BASE_STORES: Store[] = [
  { id: "lms", binding: "LMS", name: "main" },
  { id: "site", binding: "SITE", name: "main" },
  { id: "results", binding: "RESULTS", name: "main", dataOnly: true },
  { id: "forum", binding: "FORUM_QUEUE", name: "queue", dataOnly: true, kv: true },
];
/** LMS tables kept in a "settings only" backup: school setup, never people, work, messages, results or files. */
const LMS_SETUP = new Set(["catalog", "settings", "push_kind", "rcshop", "isams_tpl", "pcat", "trk_link"]);
/** Rate-limit / failed-login scratch tables: never backed up. */
const SKIP = new Set(["rl", "fails", "bk_files", "bk_chunks"]);
type Plan = { mode: "replace" | "merge"; keep?: (row: Json) => boolean };
const siteRowOk = (r: Json) => { const k = String(r.k || ""); return !k.startsWith("oauth-") && !k.startsWith("backup:"); };
const setupSettingOk = (r: Json) => { const k = String(r.k || ""); return k !== "push:vapid" && k !== "seen:admin" && !k.startsWith("mig:") && !k.startsWith("ttlead:"); };

function tablePlan(store: Store["id"], table: string, includeData: boolean): Plan | null {
  if (!/^\w{1,80}$/.test(table) || SKIP.has(table)) return null;
  if (store === "site") return table === "kv" ? { mode: "merge", keep: siteRowOk } : includeData ? { mode: "replace" } : null;
  if (store === "lms") {
    if (includeData) return { mode: "replace" };
    if (!LMS_SETUP.has(table)) return null;
    return table === "settings" ? { mode: "merge", keep: setupSettingOk } : { mode: "replace" };
  }
  return includeData ? { mode: "replace" } : null;
}

const ns = (env: BackupEnv, binding: string) => (env as unknown as Record<string, DurableObjectNamespace>)[binding];
const stubOf = (env: BackupEnv, st: Store) => { const n = ns(env, st.binding); return n.get(n.idFromName(st.name)) as unknown as BkStub; };
const siteKv = (env: BackupEnv) => stubOf(env, BASE_STORES[1]) as unknown as KvStub;
const vault = (env: BackupEnv) => stubOf(env, { id: "site", binding: "SITE", name: "backups" }) as unknown as Vault;

// ---------- vault writer (fixed-size chunks) ----------
class VaultWriter {
  private chunks: Uint8Array[] = [];
  private pending = 0;
  private text: string[] = [];
  private textLen = 0;
  n = 0;
  size = 0;
  constructor(private v: Vault, readonly key: string) {}
  async write(s: string) {
    this.text.push(s);
    this.textLen += s.length;
    if (this.textLen >= 500_000) await this.drain(false);
  }
  private concat() {
    const out = new Uint8Array(this.pending);
    let o = 0;
    for (const c of this.chunks) { out.set(c, o); o += c.length; }
    return out;
  }
  private async drain(final: boolean) {
    if (this.textLen) {
      const u = enc.encode(this.text.join(""));
      this.text = []; this.textLen = 0;
      this.chunks.push(u); this.pending += u.length; this.size += u.length;
    }
    while (this.pending >= CHUNK || (final && this.pending > 0)) {
      const all = this.concat();
      const take = Math.min(CHUNK, all.length);
      await this.v.vaultPut(this.key, this.n++, all.slice(0, take));
      const rest = all.slice(take);
      this.chunks = rest.length ? [rest] : []; this.pending = rest.length;
    }
  }
  async finish(m: { kind: Kind; data: boolean; created: number; rows: number }) {
    await this.drain(true);
    await this.v.vaultFinish(this.key, { ...m, size: this.size, chunks: this.n });
  }
  async abort() { try { await this.v.vaultDelete(this.key); } catch { /* ignore */ } }
}

// ---------- create ----------
export async function createBackup(env: BackupEnv, includeData: boolean, kind: Kind): Promise<RunInfo> {
  const v = vault(env);
  const now = Date.now();
  const iso = new Date(now).toISOString();
  const key = `backups/${iso.replace(/[:.]/g, "-")}_${includeData ? "full" : "settings"}_${kind}.json`;
  const w = new VaultWriter(v, key);
  let rows = 0;
  const counts: Record<string, number> = {};
  try {
    await w.write(`{"format":${JSON.stringify(FORMAT)},"version":1,"createdAt":${JSON.stringify(iso)},"includeData":${includeData},"kind":${JSON.stringify(kind)},` +
      `"note":"Live school system backup from shaiqmuhammad.com Admin. The website code itself is kept in GitHub.","stores":[`);
    const stores: Store[] = BASE_STORES.filter((s) => includeData || !s.dataOnly);
    if (includeData) {
      const lms = stubOf(env, BASE_STORES[0]) as unknown as { bkActCodes(): Promise<string[]> };
      for (const code of await lms.bkActCodes().catch(() => [] as string[])) stores.push({ id: "activity", binding: "ACTIVITIES", name: code });
    }
    let firstStore = true;
    for (const st of stores) {
      const stub = stubOf(env, st);
      const { tables } = (await stub.bk("tables", {})) as { tables: { name: string; schema: string; count: number }[] };
      if (st.id === "activity" && !tables.some((t) => t.name === "meta" && t.count > 0)) continue; // expired activity
      await w.write(`${firstStore ? "" : ","}{"store":${JSON.stringify(st.id)},"name":${JSON.stringify(st.name)},"tables":[`);
      firstStore = false;
      let firstT = true;
      for (const t of tables) {
        const plan = tablePlan(st.id, t.name, includeData);
        if (!plan) continue;
        await w.write(`${firstT ? "" : ","}{"name":${JSON.stringify(t.name)},"schema":${JSON.stringify(t.schema)},"mode":"${plan.mode}","rows":[`);
        firstT = false;
        let n = 0;
        let offset = 0;
        while (t.count > 0) {
          const p = (await stub.bk("page", { table: t.name, offset, maxBytes: 3_000_000 })) as { rows?: Json[]; next?: number; done?: boolean; error?: string };
          if (p.error || !p.rows) throw new Error(`read_failed:${st.id}.${t.name}`);
          const keep = plan.keep ? p.rows.filter(plan.keep) : p.rows;
          if (keep.length) { await w.write((n ? "," : "") + keep.map((r) => JSON.stringify(r)).join(",")); n += keep.length; }
          if (p.done || !p.rows.length) break;
          offset = Number(p.next) || offset + p.rows.length;
        }
        await w.write(`],"count":${n}}`);
        rows += n;
        counts[st.id] = (counts[st.id] || 0) + n;
      }
      await w.write("]");
      if (st.kv && includeData) {
        const { kv } = (await stub.bk("kv", {})) as { kv: unknown[] };
        await w.write(`,"kv":${JSON.stringify(kv || [])}`);
        rows += (kv || []).length;
        counts[st.id] = (counts[st.id] || 0) + (kv || []).length;
      }
      await w.write("}");
    }
    await w.write(`],"summary":${JSON.stringify({ rows, perStore: counts })}}`);
    await w.finish({ kind, data: includeData, created: now, rows });
  } catch (e) {
    await w.abort();
    throw e;
  }
  await prune(v).catch(() => undefined);
  return { at: now, ok: true, kind, includeData, key, size: w.size, rows };
}

// ---------- list / prune ----------
type Item = { key: string; kind: Kind; includeData: boolean; created: number; size: number; rows: number };
async function listAll(v: Vault): Promise<Item[]> {
  return (await v.vaultList()).map((r) => ({ key: r.key, kind: (r.kind as Kind) || "manual", includeData: r.data, created: r.created, size: r.size, rows: r.rows }));
}
async function prune(v: Vault) {
  const seen: Record<string, number> = {};
  for (const it of await listAll(v)) {
    seen[it.kind] = (seen[it.kind] || 0) + 1;
    if (seen[it.kind] > (KEEP[it.kind] ?? 20)) await v.vaultDelete(it.key);
  }
}

// ---------- restore ----------
const STORE_BY_ID: Record<string, Store> = Object.fromEntries(BASE_STORES.map((s) => [s.id, s]));
export async function restoreBackup(env: BackupEnv, doc: Json): Promise<{ tables: number; rows: number; skipped: string[] }> {
  const includeData = doc.includeData === true;
  const stores = Array.isArray(doc.stores) ? (doc.stores as Json[]) : [];
  let tables = 0, rows = 0;
  const skipped: string[] = [];
  for (const s of stores) {
    const id = String(s.store || "");
    const name = String(s.name || "");
    let st: Store | undefined;
    if (id === "activity") { if (includeData && /^[A-Z0-9]{5}$/.test(name)) st = { id: "activity", binding: "ACTIVITIES", name }; }
    else if (STORE_BY_ID[id] && STORE_BY_ID[id].name === name && (includeData || !STORE_BY_ID[id].dataOnly)) st = STORE_BY_ID[id];
    if (!st) { skipped.push(id); continue; }
    const stub = stubOf(env, st);
    for (const t of (Array.isArray(s.tables) ? (s.tables as Json[]) : [])) {
      const tname = String(t.name || "");
      const plan = tablePlan(st.id, tname, includeData);
      if (!plan) { skipped.push(`${id}.${tname}`); continue; }
      let list = Array.isArray(t.rows) ? (t.rows as Json[]) : [];
      if (plan.keep) list = list.filter(plan.keep);
      let first = true;
      let i = 0;
      do {
        const batch: Json[] = [];
        let bytes = 0;
        while (i < list.length && (batch.length === 0 || bytes < 2_000_000)) { bytes += JSON.stringify(list[i]).length; batch.push(list[i]); i++; }
        const r = (await stub.bk("load", { table: tname, schema: String(t.schema || ""), rows: batch, clear: first && plan.mode === "replace" })) as { inserted?: number; skipped?: string; error?: string };
        if (r.error) throw new Error(`restore_failed:${id}.${tname}`);
        if (r.skipped) { skipped.push(`${id}.${tname}`); break; }
        rows += r.inserted || 0;
        first = false;
      } while (i < list.length);
      tables++;
    }
    if (st.kv && includeData && Array.isArray(s.kv)) {
      await stub.bk("kv-load", { kv: s.kv, clear: true });
      rows += (s.kv as unknown[]).length;
    }
  }
  return { tables, rows, skipped };
}

// ---------- schedule ----------
const dubai = (t: number) => new Date(t + DUBAI_MS);
function dueOn(freq: Freq, t: number) {
  if (freq === "daily") return true;
  if (freq === "weekly") return dubai(t).getUTCDay() === 0;
  if (freq === "monthly") return dubai(t).getUTCDate() === 1;
  return false;
}
/** Next scheduled run (ms) — cron fires daily at 22:15 UTC = 02:15 Asia/Dubai. */
export function nextRun(freq: Freq, now = Date.now()): number | null {
  if (freq === "off") return null;
  const d = new Date(now);
  for (let i = -1; i < 40; i++) {
    const t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + i, 22, 15);
    if (t > now && dueOn(freq, t)) return t;
  }
  return null;
}
async function readJ<T>(env: BackupEnv, k: string, d: T): Promise<T> { try { const v = await siteKv(env).get(k); return v ? (JSON.parse(v) as T) : d; } catch { return d; } }
const readCfg = (env: BackupEnv) => readJ<Cfg>(env, "backup:cfg", { freq: "off", includeData: true });
async function saveRun(env: BackupEnv, info: RunInfo, auto: boolean) {
  const s = await readJ<Status>(env, "backup:status", {});
  s.last = info;
  if (auto) s.lastAuto = info;
  await siteKv(env).set("backup:status", JSON.stringify(s));
}
async function runLogged(env: BackupEnv, includeData: boolean, kind: Kind, auto: boolean): Promise<RunInfo> {
  try {
    const info = await createBackup(env, includeData, kind);
    await saveRun(env, info, auto);
    return info;
  } catch (e) {
    const info: RunInfo = { at: Date.now(), ok: false, kind, includeData, error: String((e as Error)?.message || e).slice(0, 200) };
    await saveRun(env, info, auto).catch(() => undefined);
    throw e;
  }
}

/** Cron handler: no-op unless an automatic schedule is saved and due today (Asia/Dubai). */
export async function scheduledBackup(env: BackupEnv, scheduledTime: number) {
  const cfg = await readCfg(env);
  if (cfg.freq === "off" || !dueOn(cfg.freq, scheduledTime)) return;
  const st = await readJ<Status>(env, "backup:status", {});
  if (st.lastAuto && scheduledTime - st.lastAuto.at < 20 * 3600_000 && st.lastAuto.ok) return;
  await runLogged(env, cfg.includeData !== false, cfg.freq, true).catch(() => undefined);
}

// ---------- HTTP ----------
function cors(origin: string | null) { return { ...corsHeaders(origin), "Access-Control-Expose-Headers": "Content-Disposition" }; }
function out(origin: string | null, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...cors(origin) } });
}
const keyOk = (k: string) => /^backups\/[\w\-.]{5,120}\.json$/.test(k) && !k.includes("..");
const dubaiDate = (t: number) => dubai(t).toISOString().slice(0, 10);
export function fileName(includeData: boolean, t: number) { return `shaiqmuhammad-backup-${includeData ? "full" : "settings"}-${dubaiDate(t)}.json`; }

export async function handleBackup(request: Request, env: BackupEnv, op: string): Promise<Response> {
  const origin = request.headers.get("Origin");
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  const auth = request.headers.get("Authorization");
  if (!(await verifyToken(env, auth))) return out(origin, { error: auth ? "admin_only" : "unauthorized" }, auth ? 403 : 401);
  if (request.headers.get("X-View-As")) return out(origin, { error: "admin_only" }, 403);
  const v = vault(env);
  const url = new URL(request.url);
  const body = async () => { try { return (await request.json()) as Json; } catch { return {} as Json; } };

  if (op === "status" && request.method === "GET") {
    const cfg = await readCfg(env);
    const status = await readJ<Status>(env, "backup:status", {});
    return out(origin, { ready: true, storage: "server", cfg, status, nextRun: nextRun(cfg.freq), now: Date.now(), keep: KEEP, timeZone: "Asia/Dubai" });
  }
  if (op === "settings" && request.method === "POST") {
    const b = await body();
    const freq = (["off", "daily", "weekly", "monthly"] as Freq[]).includes(b.freq as Freq) ? (b.freq as Freq) : null;
    if (!freq) return out(origin, { error: "bad_freq" }, 400);
    const cfg: Cfg = { freq, includeData: b.includeData !== false, savedAt: Date.now() };
    await siteKv(env).set("backup:cfg", JSON.stringify(cfg));
    return out(origin, { cfg, nextRun: nextRun(freq) });
  }
  if (op === "list" && request.method === "GET") {
    return out(origin, { items: (await listAll(v)).map((it) => ({ ...it, fileName: fileName(it.includeData, it.created) })) });
  }
  if (op === "run" && request.method === "POST") {
    const b = await body();
    try {
      const info = await runLogged(env, b.includeData !== false, "manual", false);
      return out(origin, { item: { key: info.key, kind: "manual", includeData: info.includeData, created: info.at, size: info.size, rows: info.rows, fileName: fileName(info.includeData, info.at) } });
    } catch (e) {
      return out(origin, { error: "backup_failed", detail: String((e as Error)?.message || e).slice(0, 200) }, 500);
    }
  }
  if (op === "download" && request.method === "GET") {
    const key = String(url.searchParams.get("key") || "");
    if (!keyOk(key)) return out(origin, { error: "bad_key" }, 400);
    const it = (await v.vaultList()).find((x) => x.key === key);
    if (!it) return out(origin, { error: "not_found" }, 404);
    let i = 0;
    const stream = new ReadableStream<Uint8Array>({
      async pull(ctrl) {
        if (i >= it.chunks) { ctrl.close(); return; }
        const c = await v.vaultChunk(key, i++);
        if (!c) { ctrl.error(new Error("missing_chunk")); return; }
        ctrl.enqueue(new Uint8Array(c));
      },
    });
    return new Response(stream, { headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="${fileName(it.data, it.created)}"`, "Cache-Control": "no-store", ...cors(origin) } });
  }
  if (op === "delete" && request.method === "POST") {
    const key = String((await body()).key || "");
    if (!keyOk(key)) return out(origin, { error: "bad_key" }, 400);
    await v.vaultDelete(key);
    return out(origin, { ok: true });
  }
  if (op === "restore" && request.method === "POST") {
    if (url.searchParams.get("confirm") !== "RESTORE") return out(origin, { error: "confirm_required" }, 400);
    if (Number(request.headers.get("Content-Length") || 0) > 95_000_000) return out(origin, { error: "too_large" }, 413);
    let doc: Json;
    try { doc = JSON.parse(await request.text()) as Json; } catch { return out(origin, { error: "not_a_backup" }, 400); }
    if (!doc || doc.format !== FORMAT || !Array.isArray(doc.stores)) return out(origin, { error: "not_a_backup" }, 400);
    // Safety copy of the current live system first, so a restore can itself be undone.
    let safety: RunInfo;
    try { safety = await runLogged(env, true, "before-restore", false); } catch (e) { return out(origin, { error: "safety_backup_failed", detail: String((e as Error)?.message || e).slice(0, 200) }, 500); }
    try {
      const r = await restoreBackup(env, doc);
      return out(origin, { ok: true, ...r, safetyKey: safety.key });
    } catch (e) {
      return out(origin, { error: "restore_failed", detail: String((e as Error)?.message || e).slice(0, 200), safetyKey: safety.key }, 500);
    }
  }
  return out(origin, { error: "not_found" }, 404);
}
