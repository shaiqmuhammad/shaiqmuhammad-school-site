/** Key-gated account migration helpers (X-Migrate-Key). Restore only works when env MIGRATE_RESTORE === "1". */
type Json = Record<string, unknown>;
const cellOut = (v: unknown) => {
  if (v instanceof ArrayBuffer || ArrayBuffer.isView(v)) {
    const u = v instanceof ArrayBuffer ? new Uint8Array(v) : new Uint8Array((v as ArrayBufferView).buffer, (v as ArrayBufferView).byteOffset, (v as ArrayBufferView).byteLength);
    let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
    return { $b64: btoa(s) };
  }
  return v;
};
const cellIn = (v: unknown) => (v && typeof v === "object" && "$b64" in (v as Json) ? Uint8Array.from(atob(String((v as Json).$b64 || "")), (c) => c.charCodeAt(0)) : v);

export async function sysOp(storage: DurableObjectStorage, op: string, input: Json): Promise<Json> {
  const sql = storage.sql;
  const tables = sql.exec(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'`).toArray().map((r) => String(r.name)).filter((n) => /^\w+$/.test(n));
  const table = String(input.table || "");
  if (op === "dump") {
    if (input.kv) {
      const all = [...(await storage.list()).entries()];
      return { kv: all.map(([k, v]) => ({ k, v })), done: true };
    }
    if (!table) return { tables };
    if (!tables.includes(table)) return { error: "unknown_table" };
    const offset = Math.max(0, Math.floor(Number(input.offset) || 0));
    const limit = Math.min(200, Math.max(1, Math.floor(Number(input.limit) || 50)));
    const rows = sql.exec(`SELECT * FROM "${table}" LIMIT ? OFFSET ?`, limit, offset).toArray().map((row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, cellOut(v)])));
    return { table, offset, limit, rows, done: rows.length < limit };
  }
  if (op === "load") {
    if (input.kv) {
      const items = Array.isArray(input.kv) ? (input.kv as { k: string; v: unknown }[]) : [];
      for (const it of items) if (it && typeof it.k === "string") await storage.put(it.k, it.v);
      return { inserted: items.length };
    }
    if (!/^\w+$/.test(table) || !tables.includes(table)) return { error: "unknown_table" };
    const rows = Array.isArray(input.rows) ? (input.rows as Json[]) : [];
    if (input.replace === true || Number(input.offset || 0) === 0) sql.exec(`DELETE FROM "${table}"`);
    let n = 0;
    for (const row of rows) {
      const cols = Object.keys(row || {}).filter((c) => /^\w+$/.test(c));
      if (!cols.length) continue;
      sql.exec(`INSERT INTO "${table}" (${cols.map((c) => `"${c}"`).join(",")}) VALUES (${cols.map(() => "?").join(",")})`, ...cols.map((c) => cellIn(row[c])));
      n++;
    }
    return { table, inserted: n };
  }
  if (op === "merge") {
    // Insert-if-missing (never deletes or overwrites existing rows). Used to copy records that are missing on this account.
    if (!/^\w+$/.test(table) || !tables.includes(table)) return { error: "unknown_table" };
    const rows = Array.isArray(input.rows) ? (input.rows as Json[]) : [];
    let n = 0;
    for (const row of rows) {
      const cols = Object.keys(row || {}).filter((c) => /^\w+$/.test(c));
      if (!cols.length) continue;
      sql.exec(`INSERT OR IGNORE INTO "${table}" (${cols.map((c) => `"${c}"`).join(",")}) VALUES (${cols.map(() => "?").join(",")})`, ...cols.map((c) => cellIn(row[c])));
      n += Number(sql.exec(`SELECT changes() AS c`).one().c) > 0 ? 1 : 0;
    }
    return { table, inserted: n, sent: rows.length };
  }
  if (op === "count") {
    const out: Json = {};
    for (const t of tables) out[t] = Number(sql.exec(`SELECT COUNT(*) AS c FROM "${t}"`).one().c);
    return { counts: out };
  }
  return { error: "bad_op" };
}
