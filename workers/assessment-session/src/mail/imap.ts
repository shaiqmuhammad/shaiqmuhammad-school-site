/**
 * Minimal IMAP4rev1 client (iCloud) on top of net-socket: LOGIN, LIST, SELECT,
 * UID SEARCH/FETCH/STORE/MOVE/COPY/EXPUNGE, APPEND. Includes a parser for
 * FETCH responses (ENVELOPE / BODYSTRUCTURE / literals).
 */
import { latin1ToBytes, latin1ToUtf8, openWire, WireReader, type Wire } from "./socket";

export type ImapAccount = { host: string; port: number; user: string; pass: string };

type Resp = { text: string; literals: string[] };
export type Tok = string | null | Tok[];

const LIT = "\u0000";

function quote(s: string) {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** Modified UTF-7 (RFC 3501 §5.1.3) → UTF-16 string. */
export function decodeMailboxName(s: string) {
  return s.replace(/&([^-]*)-/g, (_m, b64: string) => {
    if (!b64) return "&";
    const bin = atob(b64.replace(/,/g, "/") + "===".slice((b64.length + 3) % 4));
    let out = "";
    for (let i = 0; i + 1 < bin.length; i += 2) out += String.fromCharCode((bin.charCodeAt(i) << 8) | bin.charCodeAt(i + 1));
    return out;
  });
}

/** Tokenize an IMAP response line (literals replaced by LIT markers) into nested lists. */
export function parseTokens(text: string, literals: string[]): Tok[] {
  let i = 0;
  let li = 0;
  const n = text.length;
  function list(): Tok[] {
    const out: Tok[] = [];
    while (i < n) {
      const c = text[i]!;
      if (c === " ") {
        i += 1;
      } else if (c === "(") {
        i += 1;
        out.push(list());
      } else if (c === ")") {
        i += 1;
        return out;
      } else if (c === LIT) {
        i += 1;
        out.push(literals[li++] ?? "");
      } else if (c === '"') {
        i += 1;
        let s = "";
        while (i < n && text[i] !== '"') {
          if (text[i] === "\\" && i + 1 < n) i += 1;
          s += text[i];
          i += 1;
        }
        i += 1;
        out.push(s);
      } else {
        let s = "";
        let depth = 0;
        while (i < n) {
          const ch = text[i]!;
          if (ch === "[") depth += 1;
          if (ch === "]") depth -= 1;
          if (depth <= 0 && (ch === " " || ch === ")" || ch === "(")) {
            // BODY[...]<0> sections keep their bracket contents, incl. parens.
            if (ch === "(" && s.endsWith("[")) {
              /* unreachable: handled by depth */
            }
            break;
          }
          if (depth > 0 && ch === LIT) {
            li += 1; // literal inside a section spec (rare) — skip
          }
          s += ch;
          i += 1;
        }
        out.push(s.toUpperCase() === "NIL" ? null : s);
      }
    }
    return out;
  }
  return list();
}

export class ImapError extends Error {}

export class ImapSession {
  private n = 0;
  caps = new Set<string>();
  selected: { path: string; uidvalidity: string; uidnext: number; exists: number; readOnly: boolean } | null = null;
  private constructor(
    private wire: Wire,
    private r: WireReader,
  ) {}

  static async open(acct: ImapAccount) {
    const wire = await openWire(acct.host, acct.port, "tls");
    const s = new ImapSession(wire, new WireReader(wire));
    const greet = await s.readResp();
    if (!/^\* (OK|PREAUTH)/i.test(greet.text)) {
      await wire.close();
      throw new ImapError("IMAP greeting failed");
    }
    try {
      await s.cmd(`LOGIN ${quote(acct.user)} ${quote(acct.pass)}`, "LOGIN");
      const caps = await s.cmd("CAPABILITY");
      for (const c of caps) {
        const m = c.text.match(/^\* CAPABILITY (.*)$/i);
        if (m) for (const x of m[1]!.split(/\s+/)) s.caps.add(x.toUpperCase());
      }
    } catch (err) {
      await wire.close();
      throw err;
    }
    return s;
  }

  async readResp(): Promise<Resp> {
    const resp: Resp = { text: "", literals: [] };
    for (;;) {
      const line = await this.r.line();
      const m = line.match(/\{(\d+)\}$/);
      if (m) {
        resp.text += line.slice(0, -m[0].length) + LIT;
        resp.literals.push(await this.r.bytes(Number(m[1])));
        continue;
      }
      resp.text += line;
      return resp;
    }
  }

  /** Run a command; returns untagged responses. `label` hides arguments in errors. */
  async cmd(command: string, label?: string): Promise<Resp[]> {
    const tag = `a${++this.n}`;
    await this.wire.write(`${tag} ${command}\r\n`);
    return this.collect(tag, label ?? command.slice(0, 60));
  }

  private async collect(tag: string, label: string) {
    const out: Resp[] = [];
    for (;;) {
      const resp = await this.readResp();
      if (resp.text.startsWith(`${tag} `)) {
        if (!/^\S+ OK/i.test(resp.text)) throw new ImapError(`IMAP ${label} failed: ${resp.text.slice(tag.length + 1, 200)}`);
        out.push(resp);
        return out;
      }
      out.push(resp);
    }
  }

  async list() {
    const res = await this.cmd('LIST "" "*"');
    const out: { path: string; name: string; delimiter: string; flags: string[] }[] = [];
    for (const r of res) {
      if (!/^\* LIST /i.test(r.text)) continue;
      const toks = parseTokens(r.text.replace(/^\* LIST /i, ""), r.literals);
      const flags = (Array.isArray(toks[0]) ? toks[0] : []).map((f) => String(f).toLowerCase());
      const delimiter = typeof toks[1] === "string" ? toks[1] : "/";
      const path = typeof toks[2] === "string" ? toks[2] : "";
      if (!path || flags.includes("\\noselect") || flags.includes("\\nonexistent")) continue;
      const parts = path.split(delimiter || "/");
      out.push({ path, name: decodeMailboxName(parts[parts.length - 1] || path), delimiter, flags });
    }
    return out;
  }

  async select(path: string, readOnly = false) {
    if (this.selected && this.selected.path === path && (readOnly || !this.selected.readOnly)) return this.selected;
    const res = await this.cmd(`${readOnly ? "EXAMINE" : "SELECT"} ${quote(path)}`);
    let uidvalidity = "";
    let uidnext = 0;
    let exists = 0;
    for (const r of res) {
      const v = r.text.match(/UIDVALIDITY (\d+)/i);
      if (v) uidvalidity = v[1]!;
      const nx = r.text.match(/UIDNEXT (\d+)/i);
      if (nx) uidnext = Number(nx[1]);
      const ex = r.text.match(/^\* (\d+) EXISTS/i);
      if (ex) exists = Number(ex[1]);
    }
    this.selected = { path, uidvalidity, uidnext, exists, readOnly };
    return this.selected;
  }

  async uidSearch(criteria = "ALL") {
    const res = await this.cmd(`UID SEARCH ${criteria}`);
    const uids: number[] = [];
    for (const r of res) {
      const m = r.text.match(/^\* SEARCH(.*)$/i);
      if (!m) continue;
      for (const x of m[1]!.trim().split(/\s+/)) {
        const u = Number(x);
        if (Number.isFinite(u) && u > 0) uids.push(u);
      }
    }
    return uids.sort((a, b) => a - b);
  }

  /** UID FETCH → array of { key → value } maps (keys upper-cased). */
  async uidFetch(set: string, items: string) {
    const res = await this.cmd(`UID FETCH ${set} (${items})`);
    const out: Map<string, Tok>[] = [];
    for (const r of res) {
      const m = r.text.match(/^\* \d+ FETCH /i);
      if (!m) continue;
      const toks = parseTokens(r.text.slice(m[0].length), r.literals);
      const arr = Array.isArray(toks[0]) ? toks[0] : [];
      const map = new Map<string, Tok>();
      for (let i = 0; i + 1 < arr.length; i += 2) map.set(String(arr[i]).toUpperCase(), arr[i + 1] ?? null);
      out.push(map);
    }
    return out;
  }

  async store(uids: number[], op: "+" | "-", flags: string[]) {
    if (!uids.length) return;
    await this.cmd(`UID STORE ${uids.join(",")} ${op}FLAGS.SILENT (${flags.join(" ")})`);
  }

  async move(uids: number[], target: string) {
    if (!uids.length) return;
    if (this.caps.has("MOVE")) {
      await this.cmd(`UID MOVE ${uids.join(",")} ${quote(target)}`);
      return;
    }
    await this.cmd(`UID COPY ${uids.join(",")} ${quote(target)}`);
    await this.expungeUids(uids);
  }

  async expungeUids(uids: number[]) {
    if (!uids.length) return;
    await this.store(uids, "+", ["\\Deleted"]);
    if (this.caps.has("UIDPLUS")) await this.cmd(`UID EXPUNGE ${uids.join(",")}`);
    else await this.cmd("EXPUNGE");
  }

  /** APPEND a raw RFC 5322 message (ASCII/latin1 string) to a mailbox. */
  async append(path: string, raw: string, flags: string[] = ["\\Seen"]) {
    const tag = `a${++this.n}`;
    const size = raw.length;
    const plus = this.caps.has("LITERAL+");
    await this.wire.write(`${tag} APPEND ${quote(path)} (${flags.join(" ")}) {${size}${plus ? "+" : ""}}\r\n`);
    if (!plus) {
      for (;;) {
        const l = await this.r.line();
        if (l.startsWith("+")) break;
        if (l.startsWith(`${tag} `)) throw new ImapError(`IMAP APPEND refused: ${l.slice(tag.length + 1, 200)}`);
      }
    }
    await this.wire.write(latin1ToBytes(raw));
    await this.wire.write("\r\n");
    await this.collect(tag, "APPEND");
  }

  async close() {
    try {
      await Promise.race([this.cmd("LOGOUT"), new Promise((r) => setTimeout(r, 1500))]);
    } catch {
      /* ignore */
    }
    await this.wire.close();
  }
}

export async function withImap<T>(acct: ImapAccount, fn: (s: ImapSession) => Promise<T>): Promise<T> {
  const s = await ImapSession.open(acct);
  try {
    return await fn(s);
  } finally {
    await s.close();
  }
}

// ── MIME helpers ─────────────────────────────────────────────────────────────

export function decodeWords(s: string) {
  if (!s) return "";
  return s.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=(\s+(?==\?))?/g, (_m, cs: string, enc: string, data: string) => {
    let raw: string;
    if (enc.toUpperCase() === "B") {
      try {
        raw = atob(data.replace(/[^A-Za-z0-9+/=]/g, ""));
      } catch {
        return data;
      }
    } else {
      raw = data.replace(/_/g, " ").replace(/=([0-9A-Fa-f]{2})/g, (_x, h: string) => String.fromCharCode(parseInt(h, 16)));
    }
    return latin1ToUtf8(raw, cs.split("*")[0]!);
  });
}

/** Decode a transfer-encoded body (latin1 string in) → latin1 string of raw bytes. */
export function decodeTransfer(body: string, encoding: string) {
  const enc = (encoding || "").toLowerCase();
  if (enc === "base64") {
    try {
      return atob(body.replace(/[^A-Za-z0-9+/=]/g, ""));
    } catch {
      return "";
    }
  }
  if (enc === "quoted-printable") {
    return body.replace(/=\r?\n/g, "").replace(/=([0-9A-Fa-f]{2})/g, (_x, h: string) => String.fromCharCode(parseInt(h, 16)));
  }
  return body;
}

/** 2231-style `filename*=utf-8''...` or encoded-words. */
export function decodeParamValue(key: string, value: string) {
  if (key.endsWith("*")) {
    const m = value.match(/^([^']*)'[^']*'(.*)$/);
    if (m) {
      try {
        return latin1ToUtf8(unescape(m[2]!), m[1] || "utf-8");
      } catch {
        return m[2]!;
      }
    }
  }
  return decodeWords(value);
}

// ── ENVELOPE / BODYSTRUCTURE ─────────────────────────────────────────────────

export type Addr = { name: string; addr: string };

function str(t: Tok | undefined): string {
  return typeof t === "string" ? t : "";
}

export function parseAddrList(t: Tok | undefined): Addr[] {
  if (!Array.isArray(t)) return [];
  const out: Addr[] = [];
  for (const a of t) {
    if (!Array.isArray(a)) continue;
    const mailbox = str(a[2]);
    const host = str(a[3]);
    if (!mailbox) continue;
    out.push({ name: decodeWords(latin1ToUtf8(str(a[0]))), addr: host ? `${mailbox}@${host}`.toLowerCase() : mailbox });
  }
  return out;
}

export function parseEnvelope(t: Tok | undefined) {
  const e = Array.isArray(t) ? t : [];
  return {
    date: str(e[0]),
    subject: decodeWords(latin1ToUtf8(str(e[1]))),
    from: parseAddrList(e[2]),
    replyTo: parseAddrList(e[4]),
    to: parseAddrList(e[5]),
    cc: parseAddrList(e[6]),
    inReplyTo: str(e[8]),
    messageId: str(e[9]),
  };
}

export type PartInfo = {
  part: string;
  type: string; // e.g. text/html
  encoding: string;
  charset: string;
  size: number;
  filename: string;
  cid: string;
  disposition: string;
};

function paramsMap(t: Tok | undefined) {
  const m = new Map<string, string>();
  if (Array.isArray(t)) for (let i = 0; i + 1 < t.length; i += 2) m.set(String(t[i]).toLowerCase(), str(t[i + 1]));
  return m;
}

function filenameFrom(params: Map<string, string>) {
  for (const [k, v] of params) if (k === "filename" || k === "filename*" || k === "name" || k === "name*") return decodeParamValue(k, latin1ToUtf8(v));
  // RFC 2231 continuations: filename*0*, filename*1* …
  const parts = [...params.entries()].filter(([k]) => /^(file)?name\*\d+\*?$/.test(k)).sort();
  if (parts.length) return decodeParamValue(parts[0]![0].endsWith("*") ? "x*" : "x", parts.map(([, v]) => v).join(""));
  return "";
}

/** Flatten BODYSTRUCTURE into leaf parts with IMAP part numbers. */
export function flattenStructure(t: Tok | undefined, prefix = ""): PartInfo[] {
  if (!Array.isArray(t)) return [];
  if (Array.isArray(t[0])) {
    const out: PartInfo[] = [];
    let idx = 0;
    for (const child of t) {
      if (!Array.isArray(child)) break;
      idx += 1;
      out.push(...flattenStructure(child, prefix ? `${prefix}.${idx}` : String(idx)));
    }
    return out;
  }
  const type = `${str(t[0])}/${str(t[1])}`.toLowerCase();
  const params = paramsMap(t[2]);
  const dispIndex = type.startsWith("text/") ? 9 : type === "message/rfc822" ? 11 : 8;
  const disp = Array.isArray(t[dispIndex]) ? (t[dispIndex] as Tok[]) : null;
  const dparams = paramsMap(disp?.[1]);
  const filename = filenameFrom(dparams) || filenameFrom(params) || (type === "message/rfc822" ? "message.eml" : "");
  return [
    {
      part: prefix || "1",
      type,
      encoding: str(t[5]).toLowerCase(),
      charset: params.get("charset") ?? "",
      size: Number(str(t[6])) || 0,
      filename,
      cid: str(t[3]).replace(/[<>]/g, ""),
      disposition: str(disp?.[0]).toLowerCase(),
    },
  ];
}

/** Pick body parts and attachments from flattened structure. */
export function classifyParts(parts: PartInfo[]) {
  const isAttachment = (p: PartInfo) =>
    p.disposition === "attachment" || (!p.type.startsWith("text/") && p.type !== "multipart") || (p.type.startsWith("text/") && Boolean(p.filename) && p.disposition !== "inline");
  const html = parts.find((p) => p.type === "text/html" && !isAttachment(p));
  const plain = parts.find((p) => p.type === "text/plain" && !isAttachment(p));
  const files = parts.filter((p) => isAttachment(p) && p.type !== "application/pgp-signature");
  return { html, plain, files };
}

export function decodeTextPart(raw: string, p: PartInfo) {
  return latin1ToUtf8(decodeTransfer(raw, p.encoding), p.charset || "utf-8");
}
