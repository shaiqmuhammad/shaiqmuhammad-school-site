import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { academicYear, badgeOf, rcHandle, rcInit, stickerOk, type RcCtx } from "../src/rewards.ts";

const student = { id: "stu1", role: "student", name: "Sample", cls: "Year 4", perms: [], viewAs: false };
const teacher = { id: "t1", role: "teacher", name: "Teacher", cls: "", perms: [], viewAs: false };

function db() {
  const sql = new DatabaseSync(":memory:");
  sql.exec(`CREATE TABLE settings (k TEXT PRIMARY KEY, v TEXT)`);
  sql.exec(`CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT, name TEXT, name_ar TEXT DEFAULT '', role TEXT, cls TEXT DEFAULT '', section TEXT DEFAULT '', subject TEXT DEFAULT '', badge TEXT DEFAULT '')`);
  sql.exec(`CREATE TABLE pts (student TEXT, pts INTEGER, at INTEGER)`);
  sql.exec(`CREATE TABLE grp (subject TEXT, students TEXT, classes TEXT)`);
  const exec = (q: string, ...b: unknown[]) => {
    const stmt = sql.prepare(q);
    const rows = /^\s*(select|pragma)/i.test(q) ? stmt.all(...(b as never[])) : (stmt.run(...(b as never[])), []);
    return { toArray: () => rows as Record<string, unknown>[] };
  };
  return { sql: { exec }, raw: sql };
}

function ctx(sql: RcCtx["sql"]): RcCtx {
  return { sql, acc: () => ({ show: true, view: true, add: true, edit: true }), inScope: () => true };
}

test("academic year opens in August, Gulf time", () => {
  assert.equal(academicYear(Date.UTC(2026, 10, 12)), "2026–2027");
  assert.equal(academicYear(Date.UTC(2026, 0, 15)), "2025–2026");
  assert.equal(academicYear(Date.UTC(2026, 6, 31, 18)), "2025–2026");
  assert.equal(academicYear(Date.UTC(2026, 7, 1)), "2026–2027");
  assert.equal(stickerOk("k3"), true);
  assert.equal(stickerOk("k9"), false);
  assert.equal(badgeOf("nope"), "");
});

test("certificate and sticker unlock after approval, and earlier stickers stay", async () => {
  const { sql, raw } = db();
  rcInit(sql);
  raw.prepare(`INSERT INTO users (id, username, name, role, cls, section, subject) VALUES ('stu1','sample','Sample','student','Year 4','A','Science, Art')`).run();
  raw.prepare(`INSERT INTO rc (id, student, kind, ref, amt, label, by, at) VALUES ('rc1','stu1','manual','m1',80,'award','t',?)`).run(Date.now());
  const c = ctx(sql);
  const shop = (await rcHandle(c, student, "rc-me", { sync: false })).body as { shop: { id: string; name: string; kind: string }[]; subjects: string[] };
  const cert = shop.shop.find((x) => x.kind === "excellence");
  const sticker = shop.shop.find((x) => x.kind === "sticker");
  assert.ok(cert && sticker);
  assert.deepEqual(shop.subjects, ["Science", "Art"]);
  assert.equal((await rcHandle(c, student, "rc-redeem", { item: cert!.id })).status, 400);

  assert.equal((await rcHandle(c, student, "rc-redeem", { item: cert!.id, subject: "Science" })).status, 200);
  assert.equal((await rcHandle(c, student, "rc-redeem", { item: sticker!.id })).status, 200);
  assert.equal((await rcHandle(c, student, "rc-redeem", { item: sticker!.id })).status, 200);
  const pending = (await rcHandle(c, student, "rc-me", { sync: false })).body as { requests: { id: string; kind: string; status: string; subject: string; year: string; cls: string; section: string }[]; badge: string };
  const certReq = pending.requests.find((r) => r.kind === "excellence")!;
  const stickReqs = pending.requests.filter((r) => r.kind === "sticker");
  assert.equal(certReq.subject, "Science");
  assert.equal(certReq.cls, "Year 4");
  assert.equal(certReq.section, "A");
  assert.match(certReq.year, /^\d{4}–\d{4}$/);
  assert.equal(certReq.status, "pending");
  assert.equal((await rcHandle(c, student, "rc-sticker", { id: stickReqs[0].id, code: "k1" })).status, 409);

  assert.equal((await rcHandle(c, teacher, "rc-decide", { id: certReq.id, status: "approved", subject: "Art" })).status, 200);
  assert.equal((await rcHandle(c, teacher, "rc-decide", { id: stickReqs[0].id, status: "approved" })).status, 200);
  assert.equal((await rcHandle(c, teacher, "rc-decide", { id: stickReqs[1].id, status: "approved" })).status, 200);
  const pick1 = await rcHandle(c, student, "rc-sticker", { id: stickReqs[0].id, code: "k1" });
  assert.equal((pick1.body as { badge: string }).badge, "k1");
  await rcHandle(c, student, "rc-sticker", { id: stickReqs[1].id, code: "k4", show: false });
  const worn = await rcHandle(c, student, "rc-badge", { code: "k4" });
  assert.equal((worn.body as { badge: string }).badge, "k4");
  const after = (await rcHandle(c, student, "rc-me", { sync: false })).body as { requests: { id: string; kind: string; sticker: string; subject: string; status: string }[]; badge: string };
  const saved = after.requests.filter((r) => r.kind === "sticker").map((r) => r.sticker).sort();
  assert.deepEqual(saved, ["k1", "k4"]);
  assert.equal(after.badge, "k4");
  assert.equal(after.requests.find((r) => r.kind === "excellence")?.subject, "Art");
  assert.equal(after.requests.find((r) => r.kind === "excellence")?.status, "approved");

  const design = await rcHandle(c, teacher, "rc-cert-save", { design: { layout: "panel", subjEn: "In", closeEn: "" } });
  assert.equal(design.status, 403);
  const admin = { ...teacher, role: "admin" };
  const savedDesign = await rcHandle(c, admin, "rc-cert-save", { design: { layout: "panel", subjEn: "In the subject", closeEn: "" } });
  const body = savedDesign.body as { design: { layout: string; subjEn: string; closeEn: string; titleEn: string } };
  assert.equal(body.design.layout, "panel");
  assert.equal(body.design.subjEn, "In the subject");
  assert.equal(body.design.closeEn, "for excellent effort, care for others, and a love of learning.");
  assert.equal(body.design.titleEn, "Certificate of Excellence");
});
