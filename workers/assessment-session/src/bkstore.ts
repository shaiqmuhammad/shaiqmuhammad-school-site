/**
 * Durable Object side of Admin → Backup (see ./backup.ts). Each store exposes `bk(op, input)`, which calls this.
 * Reads SQLite tables in size-limited pages and writes them back on restore. Never touches env secrets.
 */
type Json = Record<string, unknown>;

const cellOut = (v: unknown) => {
  if (v instanceof ArrayBuffer || ArrayBuffer.isView(v)) {
    const u = v instanceof ArrayBuffer ? new Uint8Array(v) : new Uint8Array((v as ArrayBufferView).buffer, (v as ArrayBufferView).byteOffset, (v as ArrayBufferView).byteLength);
    let s = "";
    for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
    return { $b64: btoa(s) };
  }
  return v;
};
const cellIn = (v: unknown) => (v && typeof v === "object" && "$b64" in (v as Json) ? Uint8Array.from(atob(String((v as Json).$b64 || "")), (c) => c.charCodeAt(0)) : v);
const isName = (n: string) => /^\w{1,80}$/.test(n);

function tableList(sql: SqlStorage) {
  return sql.exec(`SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'`).toArray()
    .map((r) => ({ name: String(r.name), schema: String(r.sql || "") })).filter((t) => isName(t.name));
}

export async function bkOp(storage: DurableObjectStorage, op: string, input: Json): Promise<Json> {
  const sql = storage.sql;
  if (op === "tables") {
    return { tables: tableList(sql).map((t) => ({ ...t, count: Number(sql.exec(`SELECT COUNT(*) AS c FROM "${t.name}"`).one().c) })) };
  }
  if (op === "page") {
    // Rows from one table, starting at `offset`, until about `maxBytes` of JSON (always at least one row).
    const table = String(input.table || "");
    if (!isName(table) || !tableList(sql).some((t) => t.name === table)) return { error: "unknown_table" };
    const maxBytes = Math.min(8_000_000, Math.max(100_000, Number(input.maxBytes) || 3_000_000));
    let offset = Math.max(0, Math.floor(Number(input.offset) || 0));
    const rows: Json[] = [];
    let bytes = 0;
    let done = false;
    while (bytes < maxBytes) {
      const batch = sql.exec(`SELECT * FROM "${table}" LIMIT 25 OFFSET ?`, offset).toArray();
      for (const row of batch) {
        const o: Json = {};
        for (const [k, v] of Object.entries(row)) o[k] = cellOut(v);
        bytes += JSON.stringify(o).length;
        rows.push(o);
        offset++;
        if (bytes >= maxBytes) break;
      }
      if (batch.length < 25 && bytes < maxBytes) { done = true; break; }
    }
    if (!done) done = sql.exec(`SELECT 1 AS x FROM "${table}" LIMIT 1 OFFSET ?`, offset).toArray().length === 0;
    return { rows, next: offset, done, bytes };
  }
  if (op === "kv") {
    const all = [...(await storage.list()).entries()];
    return { kv: all.map(([k, v]) => ({ k, v })) };
  }
  if (op === "load") {
    // mode "replace": empty the table first (only on the first batch). mode "merge": insert or replace by primary key.
    const table = String(input.table || "");
    if (!isName(table)) return { error: "bad_table" };
    if (!tableList(sql).some((t) => t.name === table)) {
      const schema = String(input.schema || "");
      if (!new RegExp(`^CREATE TABLE\\s+"?${table}"?\\s*\\(`, "i").test(schema)) return { skipped: "missing_table" };
      sql.exec(schema.replace(/^CREATE TABLE/i, "CREATE TABLE IF NOT EXISTS"));
    }
    const cols = new Set(sql.exec(`PRAGMA table_info("${table}")`).toArray().map((r) => String(r.name)));
    if (input.clear === true) sql.exec(`DELETE FROM "${table}"`);
    const rows = Array.isArray(input.rows) ? (input.rows as Json[]) : [];
    let n = 0;
    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      const keys = Object.keys(row).filter((c) => isName(c) && cols.has(c));
      if (!keys.length) continue;
      sql.exec(`INSERT OR REPLACE INTO "${table}" (${keys.map((c) => `"${c}"`).join(",")}) VALUES (${keys.map(() => "?").join(",")})`, ...keys.map((c) => cellIn(row[c])));
      n++;
    }
    return { inserted: n };
  }
  if (op === "kv-load") {
    if (input.clear === true) {
      const keys = [...(await storage.list()).keys()];
      for (let i = 0; i < keys.length; i += 128) await storage.delete(keys.slice(i, i + 128));
    }
    const items = Array.isArray(input.kv) ? (input.kv as { k: string; v: unknown }[]) : [];
    for (const it of items) if (it && typeof it.k === "string") await storage.put(it.k, it.v);
    return { inserted: items.length };
  }
  return { error: "bad_op" };
}
