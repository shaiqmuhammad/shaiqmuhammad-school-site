/**
 * t441: Reward Cards (بطاقات المكافآت) — one spendable wallet per student.
 * Earn: legacy ClassDojo `pts` (Classes / Spin / Behaviour) + auto-earn ledger `rc` (homework, Quran, activities, assessments, streaks, manual).
 * Collect: balance + history. Redeem: Reward Shop (`rcshop`) -> request (`rcred`) -> teacher/admin approve.
 * Admin plan in settings 'rc_plan'. Teacher access = ModulePerms "rw" (view / add / edit).
 */
type Row = Record<string, unknown>;
type Sql = { exec: (q: string, ...b: unknown[]) => { toArray: () => Row[] } };
type Act = { id: string; role: string; name: string; cls?: string; perms: string[]; viewAs?: boolean; subj?: string[] };
type Acc = { show: boolean; view: boolean; add: boolean; edit: boolean };
export type RcCtx = {
  sql: Sql;
  acc: (a: Act) => Acc;
  inScope: (a: Act, sid: string) => boolean;
  results?: (sid: string) => Promise<Row[]>;
};
type Res = { status: number; body: unknown };
export type Band = "a" | "b" | "c";
export const RC_RULES = ["activity", "hw_in", "hw_green", "hw_yellow", "q_in", "q_green", "q_yellow", "as_try", "as_good", "as_top", "streak3", "streak7"] as const;
type Rule = (typeof RC_RULES)[number];
export type Plan = { on: boolean; deduct: boolean; legacy: boolean; since: number; resetAt: number; cap: Record<Band, number>; rules: Record<Rule, Record<Band, number>>; manualMax: number };
const B3 = (a: number, b: number, c: number) => ({ a, b, c });
const DEF_RULES: Plan["rules"] = {
  activity: B3(2, 2, 2), hw_in: B3(3, 2, 2), hw_green: B3(2, 2, 3), hw_yellow: B3(2, 1, 1), q_in: B3(3, 2, 2), q_green: B3(2, 2, 3), q_yellow: B3(2, 1, 1),
  as_try: B3(3, 2, 2), as_good: B3(1, 2, 2), as_top: B3(2, 3, 3), streak3: B3(3, 3, 3), streak7: B3(7, 7, 7),
};
export const RC_LABEL: Record<Rule | "manual" | "spend" | "refund", [string, string]> = {
  activity: ["Joined a class activity", "شارك في نشاط الصف"], hw_in: ["Homework handed in", "تسليم الواجب"], hw_green: ["Excellent homework (green)", "واجب ممتاز (أخضر)"], hw_yellow: ["Good homework (yellow)", "واجب جيد (أصفر)"],
  q_in: ["Quran homework submitted", "تسليم واجب القرآن"], q_green: ["Quran recitation green", "تلاوة ممتازة (أخضر)"], q_yellow: ["Quran recitation yellow", "تلاوة جيدة (أصفر)"],
  as_try: ["Assessment completed", "إكمال التقييم"], as_good: ["Strong assessment result (70%+)", "نتيجة قوية (70%+)"], as_top: ["Top assessment result (90%+)", "نتيجة متميزة (90%+)"],
  streak3: ["3-day learning streak", "مواظبة 3 أيام"], streak7: ["7-day learning streak", "مواظبة 7 أيام"], manual: ["Teacher award", "مكافأة المعلم"], spend: ["Reward Shop", "متجر المكافآت"], refund: ["Refund", "استرجاع"],
};
const DEF_SHOP: [string, string, string, number][] = [
  ["Sticker", "ملصق", "⭐", 10], ["Certificate of Excellence", "شهادة تميز", "📜", 25], ["Front-of-line pass", "تذكرة أول الصف", "🎟️", 30],
  ["Choose your seat for a day", "اختر مقعدك ليوم", "💺", 40], ["Homework pass", "إعفاء من واجب", "📝", 60], ["Class helper for a week", "مساعد الصف لأسبوع", "🧑‍🏫", 80], ["Small prize", "جائزة صغيرة", "🎁", 120],
];
const num = (v: unknown, lo: number, hi: number, d: number) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };
const s = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);
const rid = (p: string) => `${p}_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
const dayOf = (t: number) => new Date(t + 4 * 3600e3).toISOString().slice(0, 10);

export function rcInit(sql: Sql) {
  sql.exec(`CREATE TABLE IF NOT EXISTS rc (id TEXT PRIMARY KEY, student TEXT, kind TEXT, ref TEXT, amt INTEGER, label TEXT, by TEXT, at INTEGER, UNIQUE (student, kind, ref))`);
  sql.exec(`CREATE INDEX IF NOT EXISTS rc_student ON rc(student, at)`);
  sql.exec(`CREATE TABLE IF NOT EXISTS rcshop (id TEXT PRIMARY KEY, name TEXT, name_ar TEXT, icon TEXT, cost INTEGER, stock INTEGER DEFAULT -1, bands TEXT DEFAULT 'abc', on_ INTEGER DEFAULT 1, pos INTEGER DEFAULT 0)`);
  sql.exec(`CREATE TABLE IF NOT EXISTS rcred (id TEXT PRIMARY KEY, student TEXT, item TEXT, name TEXT, icon TEXT, cost INTEGER, status TEXT, by TEXT, note TEXT DEFAULT '', at INTEGER, decided INTEGER DEFAULT 0)`);
  if (!sql.exec(`SELECT 1 FROM settings WHERE k='rc_shop_seeded'`).toArray().length) {
    DEF_SHOP.forEach(([n, ar, ic, c], i) => sql.exec(`INSERT INTO rcshop (id, name, name_ar, icon, cost, stock, bands, on_, pos) VALUES (?, ?, ?, ?, ?, -1, 'abc', 1, ?)`, rid("rs"), n, ar, ic, c, i));
    sql.exec(`INSERT OR REPLACE INTO settings (k, v) VALUES ('rc_shop_seeded', '1')`);
  }
}

export function planOf(sql: Sql): Plan {
  let v: Partial<Plan> = {};
  try { v = JSON.parse(String(sql.exec(`SELECT v FROM settings WHERE k='rc_plan'`).toArray()[0]?.v || "{}")); } catch { /* defaults */ }
  if (!v.since) { v.since = Date.now(); sql.exec(`INSERT OR REPLACE INTO settings (k, v) VALUES ('rc_plan', ?)`, JSON.stringify(v)); }
  const rules = {} as Plan["rules"];
  for (const r of RC_RULES) { const x = (v.rules?.[r] || {}) as Partial<Record<Band, number>>; rules[r] = { a: num(x.a, 0, 50, DEF_RULES[r].a), b: num(x.b, 0, 50, DEF_RULES[r].b), c: num(x.c, 0, 50, DEF_RULES[r].c) }; }
  const cap = (v.cap || {}) as Partial<Record<Band, number>>;
  return { on: v.on !== false, deduct: v.deduct !== false, legacy: v.legacy !== false, since: Number(v.since), resetAt: Number(v.resetAt) || 0, cap: { a: num(cap.a, 0, 500, 20), b: num(cap.b, 0, 500, 25), c: num(cap.c, 0, 500, 30) }, rules, manualMax: num(v.manualMax, 1, 50, 5) };
}
export const bandOf = (cls: string): Band => {
  const c = cls.trim();
  if (/^(fs|eyfs|foundation|reception|nursery|kg|pre)/i.test(c)) return "a";
  const y = Number((c.match(/\d+/) || ["0"])[0]);
  return y <= 2 ? "a" : y <= 6 ? "b" : "c";
};

function clsOf(sql: Sql, sid: string) { return String(sql.exec(`SELECT cls FROM users WHERE id=?`, sid).toArray()[0]?.cls || ""); }

/** Insert one auto-earn (idempotent per student/kind/ref), clipped to the band's daily cap. */
function earn(sql: Sql, p: Plan, sid: string, band: Band, kind: Rule, ref: string, at: number, label = "") {
  if (sql.exec(`SELECT 1 FROM rc WHERE student=? AND kind=? AND ref=?`, sid, kind, ref).toArray().length) return;
  let amt = p.rules[kind][band];
  if (p.cap[band] > 0) {
    const d = dayOf(at), lo = Date.parse(d + "T00:00:00Z") - 4 * 3600e3;
    const used = Number(sql.exec(`SELECT COALESCE(SUM(amt),0) AS n FROM rc WHERE student=? AND at>=? AND at<? AND kind NOT IN ('manual','spend','refund')`, sid, lo, lo + 86400e3).toArray()[0]?.n || 0);
    amt = Math.max(0, Math.min(amt, p.cap[band] - used));
  }
  sql.exec(`INSERT OR IGNORE INTO rc (id, student, kind, ref, amt, label, by, at) VALUES (?, ?, ?, ?, ?, ?, 'auto', ?)`, rid("rc"), sid, kind, ref, amt, label, at);
}

/** Lazy, idempotent sync from homework / Quran / login streak (and assessments when a results reader is given). */
export async function rcSync(c: RcCtx, sid: string, withResults = false) {
  const p = planOf(c.sql);
  if (!p.on) return;
  const band = bandOf(clsOf(c.sql, sid));
  for (const r of c.sql.exec(`SELECT s.hw, s.status, s.grade, s.updated, s.submitted_at, h.kind, h.title FROM subs s JOIN homework h ON h.id=s.hw WHERE s.student=? AND s.updated>=?`, sid, p.since).toArray()) {
    const q = r.kind === "quran", at = Number(r.submitted_at || r.updated) || Date.now(), hw = String(r.hw), t = String(r.title || "");
    if (r.status === "submitted" || r.status === "approved" || r.grade) earn(c.sql, p, sid, band, q ? "q_in" : "hw_in", hw, at, t);
    if (r.grade === "green") earn(c.sql, p, sid, band, q ? "q_green" : "hw_green", hw, Number(r.updated) || at, t);
    else if (r.grade === "yellow") earn(c.sql, p, sid, band, q ? "q_yellow" : "hw_yellow", hw, Number(r.updated) || at, t);
  }
  const days = new Set(c.sql.exec(`SELECT day FROM activity WHERE student=?`, sid).toArray().map((r) => String(r.day)));
  for (const d of days) {
    const t = Date.parse(d + "T08:00:00Z");
    if (t < p.since - 86400e3) continue;
    let n = 1; const x = new Date(d + "T00:00:00Z");
    while (n < 7) { x.setUTCDate(x.getUTCDate() - 1); if (!days.has(x.toISOString().slice(0, 10))) break; n++; }
    if (n === 3) earn(c.sql, p, sid, band, "streak3", d, t);
    if (n === 7) earn(c.sql, p, sid, band, "streak7", d, t);
  }
  if (withResults && c.results) {
    let rs: Row[] = [];
    try { rs = await c.results(sid); } catch { /* results offline */ }
    for (const r of rs) {
      const at = Number(r.finishedAt || r.finished_at || 0); if (!at || at < p.since) continue;
      const id = String(r.id), t = String(r.quizTitle || ""), pc = Number(r.percentage) || 0;
      earn(c.sql, p, sid, band, "as_try", id, at, t);
      if (pc >= 90) earn(c.sql, p, sid, band, "as_top", id, at, t); else if (pc >= 70) earn(c.sql, p, sid, band, "as_good", id, at, t);
    }
  }
}

export function balanceOf(sql: Sql, sid: string, p = planOf(sql)) {
  const from = p.resetAt;
  const auto = Number(sql.exec(`SELECT COALESCE(SUM(amt),0) AS n FROM rc WHERE student=? AND at>=?`, sid, from).toArray()[0]?.n || 0);
  const legacy = p.legacy ? Number(sql.exec(`SELECT COALESCE(SUM(pts),0) AS n FROM pts WHERE student=? AND at>=? ${p.deduct ? "" : "AND pts>0"}`, sid, from).toArray()[0]?.n || 0) : 0;
  const spent = Number(sql.exec(`SELECT COALESCE(SUM(cost),0) AS n FROM rcred WHERE student=? AND at>=? AND status IN ('pending','approved','fulfilled')`, sid, from).toArray()[0]?.n || 0);
  const earned = Number(sql.exec(`SELECT COALESCE(SUM(amt),0) AS n FROM rc WHERE student=? AND amt>0`, sid).toArray()[0]?.n || 0) + (p.legacy ? Number(sql.exec(`SELECT COALESCE(SUM(pts),0) AS n FROM pts WHERE student=? AND pts>0`, sid).toArray()[0]?.n || 0) : 0);
  return { balance: Math.max(0, auto + legacy - spent), lifetime: earned, spent };
}

function history(sql: Sql, sid: string, p: Plan, limit = 80) {
  const rows: { at: number; amt: number; label: string; kind: string; by: string; icon: string }[] = [];
  for (const r of sql.exec(`SELECT * FROM rc WHERE student=? ORDER BY at DESC LIMIT ?`, sid, limit).toArray()) rows.push({ at: Number(r.at), amt: Number(r.amt), label: String(r.label || ""), kind: String(r.kind), by: String(r.by || ""), icon: "🃏" });
  if (p.legacy) for (const r of sql.exec(`SELECT * FROM pts WHERE student=? ${p.deduct ? "" : "AND pts>0"} ORDER BY at DESC LIMIT ?`, sid, limit).toArray()) rows.push({ at: Number(r.at), amt: Number(r.pts), label: String(r.label || ""), kind: "skill", by: String(r.by || ""), icon: String(r.icon || "⭐") });
  for (const r of sql.exec(`SELECT * FROM rcred WHERE student=? AND status IN ('pending','approved','fulfilled') ORDER BY at DESC LIMIT ?`, sid, limit).toArray()) rows.push({ at: Number(r.at), amt: -Number(r.cost), label: String(r.name), kind: "spend", by: String(r.status), icon: String(r.icon || "🎁") });
  return rows.sort((x, y) => y.at - x.at).slice(0, limit);
}
const shopOut = (r: Row) => ({ id: String(r.id), name: String(r.name), nameAr: String(r.name_ar || ""), icon: String(r.icon || "🎁"), cost: Number(r.cost), stock: Number(r.stock), bands: String(r.bands || "abc"), on: Number(r.on_) === 1, pos: Number(r.pos) });
const redOut = (r: Row) => ({ id: String(r.id), student: String(r.student), sname: String(r.sname || ""), cls: String(r.cls || ""), item: String(r.item), name: String(r.name), icon: String(r.icon || ""), cost: Number(r.cost), status: String(r.status), by: String(r.by || ""), note: String(r.note || ""), at: Number(r.at), decided: Number(r.decided || 0) });

export async function rcHandle(c: RcCtx, a: Act, action: string, input: Record<string, unknown>): Promise<Res> {
  const sql = c.sql;
  const ok = (body: unknown) => ({ status: 200, body });
  const no = (e = "forbidden", st = 403) => ({ status: st, body: { error: e } });
  const staff = a.role === "admin" || a.role === "teacher";
  const acc: Acc = a.role === "admin" ? { show: true, view: true, add: true, edit: true } : staff ? c.acc(a) : { show: false, view: false, add: false, edit: false };
  const p = planOf(sql);
  const write = !a.viewAs;
  switch (action) {
    case "rc-me": {
      if (a.role !== "student") return no("students_only");
      if (write) await rcSync(c, a.id, true);
      const band = bandOf(a.cls || clsOf(sql, a.id));
      const shop = sql.exec(`SELECT * FROM rcshop WHERE on_=1 ORDER BY pos, cost`).toArray().map(shopOut).filter((x) => x.bands.includes(band));
      const reqs = sql.exec(`SELECT * FROM rcred WHERE student=? ORDER BY at DESC LIMIT 50`, a.id).toArray().map(redOut);
      const rules = Object.fromEntries(RC_RULES.map((r) => [r, p.rules[r][band]]));
      return ok({ on: p.on, band, ...balanceOf(sql, a.id, p), history: history(sql, a.id, p), shop, requests: reqs, rules, cap: p.cap[band], labels: RC_LABEL });
    }
    case "rc-act": {
      if (a.role !== "student" || !write || !p.on) return ok({ ok: false });
      const code = s(input.code, 8).toUpperCase();
      const r = sql.exec(`SELECT students, title FROM alive WHERE code=?`, code).toArray()[0];
      if (!r || !(JSON.parse(String(r.students || "[]")) as string[]).includes(a.id)) return ok({ ok: false });
      earn(sql, p, a.id, bandOf(a.cls || clsOf(sql, a.id)), "activity", code + ":" + dayOf(Date.now()), Date.now(), String(r.title || ""));
      return ok({ ok: true });
    }
    case "rc-redeem": {
      if (a.role !== "student" || !write) return no();
      if (!p.on) return no("rewards_off", 409);
      const it = sql.exec(`SELECT * FROM rcshop WHERE id=? AND on_=1`, s(input.item, 40)).toArray()[0];
      if (!it || !String(it.bands || "abc").includes(bandOf(a.cls || clsOf(sql, a.id)))) return no("not_found", 404);
      if (Number(it.stock) === 0) return no("out_of_stock", 409);
      if (balanceOf(sql, a.id, p).balance < Number(it.cost)) return no("not_enough", 409);
      if (Number(sql.exec(`SELECT COUNT(*) AS n FROM rcred WHERE student=? AND status='pending'`, a.id).toArray()[0]?.n) >= 5) return no("too_many_pending", 409);
      if (Number(it.stock) > 0) sql.exec(`UPDATE rcshop SET stock=stock-1 WHERE id=? AND stock>0`, String(it.id));
      sql.exec(`INSERT INTO rcred (id, student, item, name, icon, cost, status, at) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`, rid("rr"), a.id, String(it.id), String(it.name), String(it.icon || ""), Number(it.cost), Date.now());
      return ok({ ok: true, ...balanceOf(sql, a.id, p) });
    }
    case "rc-cancel": {
      if (a.role !== "student" || !write) return no();
      const r = sql.exec(`SELECT * FROM rcred WHERE id=? AND student=? AND status='pending'`, s(input.id, 40), a.id).toArray()[0];
      if (!r) return no("not_found", 404);
      sql.exec(`UPDATE rcred SET status='cancelled', decided=? WHERE id=?`, Date.now(), String(r.id));
      sql.exec(`UPDATE rcshop SET stock=stock+1 WHERE id=? AND stock>=0`, String(r.item));
      return ok({ ok: true });
    }
    case "rc-staff": {
      if (!staff || !acc.view) return no("module_hidden");
      const cls = s(input.cls, 80);
      const studs = sql.exec(`SELECT id, name, cls, section FROM users WHERE role='student' AND COALESCE(disabled,0)=0 ${cls ? "AND cls=?" : ""} ORDER BY cls, section, name`, ...(cls ? [cls] : [])).toArray().filter((r) => c.inScope(a, String(r.id)));
      if (input.sync === true && write) for (const r of studs.slice(0, 400)) await rcSync(c, String(r.id));
      const students = studs.map((r) => ({ id: String(r.id), name: String(r.name), cls: String(r.cls || ""), section: String(r.section || ""), band: bandOf(String(r.cls || "")), ...balanceOf(sql, String(r.id), p) }));
      const ids = new Set(studs.map((r) => String(r.id)));
      const requests = sql.exec(`SELECT r.*, u.name AS sname, u.cls AS cls FROM rcred r LEFT JOIN users u ON u.id=r.student ORDER BY CASE r.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END, r.at DESC LIMIT 300`).toArray().filter((r) => ids.has(String(r.student)) || a.role === "admin").map(redOut);
      const shop = sql.exec(`SELECT * FROM rcshop ORDER BY pos, cost`).toArray().map(shopOut);
      const classes = [...new Set(sql.exec(`SELECT DISTINCT cls FROM users WHERE role='student' AND COALESCE(disabled,0)=0 ORDER BY cls`).toArray().map((r) => String(r.cls || "")).filter(Boolean))];
      return ok({ acc, plan: p, students, requests, shop, classes, labels: RC_LABEL, admin: a.role === "admin" });
    }
    case "rc-student": {
      if (!staff || !acc.view) return no("module_hidden");
      const sid = s(input.id, 40);
      if (!c.inScope(a, sid)) return no();
      return ok({ ...balanceOf(sql, sid, p), history: history(sql, sid, p, 120) });
    }
    case "rc-award": {
      if (!staff || !acc.add || !write) return no();
      const amt = num(input.amt, -p.manualMax, p.manualMax * 2, 0);
      if (!amt || (amt < 0 && !p.deduct)) return no("bad_amount", 400);
      const label = s(input.label, 60) || RC_LABEL.manual[0];
      const ids = (Array.isArray(input.students) ? input.students : []).map((x) => s(x, 40)).filter((x) => x && c.inScope(a, x)).slice(0, 300);
      if (!ids.length) return no("no_students", 400);
      const at = Date.now();
      for (const sid of ids) sql.exec(`INSERT INTO rc (id, student, kind, ref, amt, label, by, at) VALUES (?, ?, 'manual', ?, ?, ?, ?, ?)`, rid("rc"), sid, rid("m"), amt, label, a.name, at);
      return ok({ ok: true, count: ids.length });
    }
    case "rc-decide": {
      if (!staff || !acc.edit || !write) return no();
      const r = sql.exec(`SELECT * FROM rcred WHERE id=?`, s(input.id, 40)).toArray()[0];
      if (!r || !c.inScope(a, String(r.student))) return no("not_found", 404);
      const st = s(input.status, 12);
      if (!["approved", "rejected", "fulfilled"].includes(st)) return no("bad", 400);
      if (["rejected", "cancelled"].includes(String(r.status))) return no("closed", 409);
      sql.exec(`UPDATE rcred SET status=?, by=?, note=?, decided=? WHERE id=?`, st, a.name, s(input.note, 200), Date.now(), String(r.id));
      if (st === "rejected") sql.exec(`UPDATE rcshop SET stock=stock+1 WHERE id=? AND stock>=0`, String(r.item));
      return ok({ ok: true });
    }
    case "rc-plan-save": {
      if (a.role !== "admin" || !write) return no("admin_only");
      const v = (input.plan || {}) as Partial<Plan>;
      const next = { ...p, on: v.on !== false, deduct: v.deduct !== false, legacy: v.legacy !== false, cap: v.cap || p.cap, rules: v.rules || p.rules, manualMax: v.manualMax ?? p.manualMax };
      sql.exec(`INSERT OR REPLACE INTO settings (k, v) VALUES ('rc_plan', ?)`, JSON.stringify(next));
      return ok({ plan: planOf(sql) });
    }
    case "rc-reset": {
      if (a.role !== "admin" || !write) return no("admin_only");
      sql.exec(`INSERT OR REPLACE INTO settings (k, v) VALUES ('rc_plan', ?)`, JSON.stringify({ ...p, resetAt: Date.now() }));
      return ok({ plan: planOf(sql) });
    }
    case "rc-shop-save": {
      if (a.role !== "admin" || !write) return no("admin_only");
      const name = s(input.name, 60); if (!name) return no("name_required", 400);
      const bands = [...new Set(s(input.bands, 3).split("").filter((x) => "abc".includes(x)))].join("") || "abc";
      const vals = [name, s(input.nameAr, 60), s(input.icon, 8) || "🎁", num(input.cost, 1, 10000, 10), num(input.stock, -1, 100000, -1), bands, input.on === false ? 0 : 1, num(input.pos, 0, 999, 50)];
      const id = s(input.id, 40);
      if (id && sql.exec(`SELECT 1 FROM rcshop WHERE id=?`, id).toArray().length) sql.exec(`UPDATE rcshop SET name=?, name_ar=?, icon=?, cost=?, stock=?, bands=?, on_=?, pos=? WHERE id=?`, ...vals, id);
      else sql.exec(`INSERT INTO rcshop (name, name_ar, icon, cost, stock, bands, on_, pos, id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, ...vals, rid("rs"));
      return ok({ ok: true });
    }
    case "rc-shop-delete": {
      if (a.role !== "admin" || !write) return no("admin_only");
      sql.exec(`DELETE FROM rcshop WHERE id=?`, s(input.id, 40));
      return ok({ ok: true });
    }
  }
  return no("unknown_action", 404);
}
