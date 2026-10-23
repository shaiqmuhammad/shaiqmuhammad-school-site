/**
 * Admin data correction: find (dry) or replace a piece of text in every TEXT column of a Durable Object's SQLite store.
 * Used to correct a student's name everywhere it was copied (comments, results, logs…). Logins are never changed:
 * username / password / PIN columns and media blobs are skipped.
 */
type Sql = { exec: (q: string, ...a: unknown[]) => { toArray: () => Record<string, unknown>[] } };
const SKIP = new Set(["username", "salt", "hash", "pin", "token", "parent_token", "image", "audio", "iph"]);
export function textReplaceAll(sql: Sql, from: string, to: string, dry: boolean): { table: string; column: string; rows: number }[] {
  const out: { table: string; column: string; rows: number }[] = [];
  if (!from || from.length < 3) return out;
  const tables = sql.exec(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'`).toArray().map((r) => String(r.name));
  for (const t of tables) {
    const cols = sql.exec(`PRAGMA table_info("${t}")`).toArray().filter((c) => !String(c.type || "").toUpperCase().match(/INT|REAL|BLOB/) && !SKIP.has(String(c.name)));
    for (const c of cols) {
      const col = String(c.name);
      const n = Number(sql.exec(`SELECT COUNT(*) AS n FROM "${t}" WHERE instr("${col}", ?) > 0`, from).toArray()[0]?.n || 0);
      if (!n) continue;
      if (!dry) sql.exec(`UPDATE "${t}" SET "${col}" = replace("${col}", ?, ?) WHERE instr("${col}", ?) > 0`, from, to, from);
      out.push({ table: t, column: col, rows: n });
    }
  }
  return out;
}
