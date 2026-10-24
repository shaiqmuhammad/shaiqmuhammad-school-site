/**
 * t320: Learning Material lesson pages, stored in the LMS (no longer in the public data.json).
 * Readable by signed-in admin / teachers / students only (never parents or logged-out visitors).
 * Admin: full control. Teachers: Learning Material ("lp") permissions — add, edit/delete own pages, subject limited to their own subjects.
 * Students: published pages only.
 */
type Json = Record<string, unknown>;
type Sql = { exec: (q: string, ...b: unknown[]) => { toArray: () => Record<string, unknown>[]; one: () => Record<string, unknown> } };
type Actor = { id: string; role: string; name: string; viewAs?: boolean };
type Acc = { show: boolean; view: boolean; add: boolean; edit: boolean; delete: boolean };
export type PageCtx = { sql: Sql; acc: (a: Actor) => Acc; subjectsOf: (uid: string) => string[] };
const str = (v: unknown, max: number) => String(v ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, " ").slice(0, max);
const rid = () => `pg_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 9)}`;
const slugify = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 90);
const no = (e = "forbidden") => ({ status: 403, body: { error: e } });

export function pagesInit(sql: Sql) {
  sql.exec(`CREATE TABLE IF NOT EXISTS lpage (id TEXT PRIMARY KEY, slug TEXT UNIQUE, title TEXT, excerpt TEXT, body TEXT, subject TEXT, published INTEGER, owner TEXT, owner_name TEXT, created INTEGER, updated INTEGER)`);
}
const out = (r: Record<string, unknown>, body: boolean) => ({ id: String(r.id), slug: String(r.slug), title: String(r.title), excerpt: String(r.excerpt || ""), subject: String(r.subject || ""), published: Boolean(r.published), owner: String(r.owner || ""), ownerName: String(r.owner_name || ""), updatedAt: new Date(Number(r.updated)).toISOString(), ...(body ? { body: String(r.body || "") } : {}) });

export function pageHandle(c: PageCtx, a: Actor, action: string, input: Json) {
  const { sql } = c;
  if (!["admin", "teacher", "student"].includes(a.role)) return no();
  const admin = a.role === "admin" && !a.viewAs;
  const acc = a.role === "teacher" ? c.acc(a) : { show: true, view: true, add: admin, edit: admin, delete: admin };
  if (a.role === "teacher" && !acc.show) return no("module_hidden");
  const visible = (r: Record<string, unknown>) => admin || Boolean(r.published) || (a.role === "teacher" && String(r.owner) === a.id);
  const mayEdit = (r: Record<string, unknown>, k: "edit" | "delete") => admin || (a.role === "teacher" && !a.viewAs && acc[k] && String(r.owner) === a.id);
  switch (action) {
    case "pg-list": {
      const rows = sql.exec(`SELECT id, slug, title, excerpt, subject, published, owner, owner_name, updated FROM lpage ORDER BY updated DESC`).toArray().filter(visible);
      return { status: 200, body: { items: rows.map((r) => ({ ...out(r, false), canEdit: mayEdit(r, "edit"), canDelete: mayEdit(r, "delete") })), canAdd: admin || (a.role === "teacher" && acc.add && !a.viewAs), subjects: a.role === "teacher" ? c.subjectsOf(a.id) : [] } };
    }
    case "pg-get": {
      const r = sql.exec(`SELECT * FROM lpage WHERE slug=? OR id=?`, str(input.slug, 100), str(input.id, 40)).toArray()[0];
      if (!r || !visible(r)) return { status: 404, body: { error: "not_found" } };
      return { status: 200, body: { page: { ...out(r, true), canEdit: mayEdit(r, "edit") } } };
    }
    case "pg-save": {
      const id = str(input.id, 40);
      const old = id ? sql.exec(`SELECT * FROM lpage WHERE id=?`, id).toArray()[0] : undefined;
      if (old ? !mayEdit(old, "edit") : !(admin || (a.role === "teacher" && acc.add && !a.viewAs))) return no();
      const title = str(input.title, 200).trim(), slug = slugify(str(input.slug, 100) || title);
      if (!title || !slug) return { status: 400, body: { error: "title_slug" } };
      const clash = sql.exec(`SELECT id FROM lpage WHERE slug=?`, slug).toArray()[0];
      if (clash && String(clash.id) !== id) return { status: 409, body: { error: "slug_taken" } };
      const subject = str(input.subject, 80);
      if (a.role === "teacher" && subject && !c.subjectsOf(a.id).includes(subject)) return no("subject_not_yours");
      const body = str(input.body, 900_000), now = Date.now(), nid = old ? id : id && admin ? id : rid();
      if (old) sql.exec(`UPDATE lpage SET slug=?, title=?, excerpt=?, body=?, subject=?, published=?, updated=? WHERE id=?`, slug, title, str(input.excerpt, 600), body, subject, input.published ? 1 : 0, now, id);
      else sql.exec(`INSERT INTO lpage (id, slug, title, excerpt, body, subject, published, owner, owner_name, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, nid, slug, title, str(input.excerpt, 600), body, subject, input.published ? 1 : 0, admin ? "" : a.id, admin ? "Admin" : a.name, now, now);
      return { status: 200, body: { ok: true, id: nid, slug } };
    }
    case "pg-delete": {
      const r = sql.exec(`SELECT * FROM lpage WHERE id=?`, str(input.id, 40)).toArray()[0];
      if (!r) return { status: 404, body: { error: "not_found" } };
      if (!mayEdit(r, "delete")) return no();
      sql.exec(`DELETE FROM lpage WHERE id=?`, String(r.id));
      return { status: 200, body: { ok: true } };
    }
    case "pg-import": {
      // One-off migration from the old public data.json (admin only). Upsert by id, keeps dates.
      if (!admin) return no("admin_only");
      const list = (Array.isArray(input.pages) ? (input.pages as Json[]) : []).slice(0, 2000);
      let n = 0;
      for (const p of list) {
        const id = str(p.id, 40) || rid(), slug = slugify(str(p.slug, 100) || str(p.title, 200)), t = Date.parse(String(p.updatedAt)) || Date.now();
        if (!slug) continue;
        sql.exec(`DELETE FROM lpage WHERE slug=? AND id<>?`, slug, id);
        sql.exec(`INSERT INTO lpage (id, slug, title, excerpt, body, subject, published, owner, owner_name, created, updated) VALUES (?, ?, ?, ?, ?, '', ?, '', 'Admin', ?, ?) ON CONFLICT(id) DO UPDATE SET slug=excluded.slug, title=excluded.title, excerpt=excluded.excerpt, body=excluded.body, published=excluded.published, updated=excluded.updated`, id, slug, str(p.title, 200), str(p.excerpt, 600), str(p.body, 900_000), p.published ? 1 : 0, t, t);
        n++;
      }
      return { status: 200, body: { ok: true, n, total: Number(sql.exec(`SELECT COUNT(*) AS n FROM lpage`).one().n) } };
    }
  }
  return { status: 404, body: { error: "unknown" } };
}
