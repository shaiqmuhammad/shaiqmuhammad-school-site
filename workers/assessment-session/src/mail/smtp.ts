import { b64, openWire, WireReader, type Wire } from "./socket";

export type SmtpAccount = { host: string; port: number; user: string; pass: string };

export type OutMail = {
  from: string;
  fromName?: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  replyTo?: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: { filename: string; contentType: string; base64: string; cid?: string }[];
  /** Extra headers (In-Reply-To, References…). */
  headers?: Record<string, string>;
  messageId?: string;
};

const CRLF = "\r\n";

function wrap76(s: string) {
  return s.replace(/.{1,76}/g, (m) => m + CRLF).trimEnd();
}

function encWord(s: string) {
  return /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`;
}

function addr(email: string, name?: string) {
  return name ? `${encWord(name.replace(/"/g, ""))} <${email}>` : `<${email}>`;
}

function boundary() {
  return `am_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

export function buildMime(m: OutMail) {
  const domain = m.from.split("@")[1] || "shaiqmuhammad.com";
  const headers = [
    `From: ${addr(m.from, m.fromName)}`,
    `To: ${m.to.join(", ")}`,
    ...(m.cc?.length ? [`Cc: ${m.cc.join(", ")}`] : []),
    ...(m.replyTo ? [`Reply-To: ${m.replyTo}`] : []),
    `Subject: ${encWord(m.subject)}`,
    `Date: ${new Date().toUTCString().replace("GMT", "+0000")}`,
    `Message-ID: <${m.messageId ?? `${crypto.randomUUID()}@${domain}`}>`,
    ...Object.entries(m.headers ?? {})
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}: ${v.replace(/[\r\n]+/g, " ")}`),
    "MIME-Version: 1.0",
  ];
  const textPart = ["Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64", "", wrap76(b64(m.text))].join(CRLF);
  let body: string;
  let ctype: string;
  if (m.html) {
    const alt = boundary();
    const htmlPart = ["Content-Type: text/html; charset=UTF-8", "Content-Transfer-Encoding: base64", "", wrap76(b64(m.html))].join(CRLF);
    body = [`--${alt}`, textPart, `--${alt}`, htmlPart, `--${alt}--`].join(CRLF);
    ctype = `multipart/alternative; boundary="${alt}"`;
  } else {
    body = wrap76(b64(m.text));
    ctype = "text/plain; charset=UTF-8";
  }
  if (m.attachments?.length) {
    const mix = boundary();
    const inner = m.html ? `Content-Type: ${ctype}${CRLF}${CRLF}${body}` : textPart;
    const parts = [`--${mix}`, inner];
    for (const a of m.attachments) {
      parts.push(
        `--${mix}`,
        [
          `Content-Type: ${a.contentType || "application/octet-stream"}; name="${encWord(a.filename)}"`,
          "Content-Transfer-Encoding: base64",
          ...(a.cid ? [`Content-ID: <${a.cid}>`] : []),
          `Content-Disposition: ${a.cid ? "inline" : "attachment"}; filename="${encWord(a.filename)}"`,
          "",
          wrap76(a.base64.replace(/\s+/g, "")),
        ].join(CRLF),
      );
    }
    parts.push(`--${mix}--`);
    return [...headers, `Content-Type: multipart/mixed; boundary="${mix}"`, "", parts.join(CRLF)].join(CRLF);
  }
  if (m.html) return [...headers, `Content-Type: ${ctype}`, "", body].join(CRLF);
  return [...headers, `Content-Type: ${ctype}`, "Content-Transfer-Encoding: base64", "", body].join(CRLF);
}

async function reply(r: WireReader): Promise<{ code: number; text: string }> {
  let text = "";
  for (;;) {
    const l = await r.line();
    text += l + "\n";
    if (/^\d{3} /.test(l) || /^\d{3}$/.test(l)) return { code: Number(l.slice(0, 3)), text };
  }
}

async function expect(r: WireReader, ok: number[], what: string) {
  const res = await reply(r);
  if (!ok.includes(res.code)) {
    // Never echo credentials — only the server's reply code/text.
    throw new Error(`SMTP ${what} failed (${res.code}): ${res.text.trim().slice(0, 160)}`);
  }
  return res;
}

async function session<T>(acct: SmtpAccount, fn: (w: Wire, r: WireReader) => Promise<T>): Promise<T> {
  if (!acct.pass) throw new Error("Email is not set up yet — the iCloud app password is missing.");
  const implicitTls = acct.port === 465;
  let wire = await openWire(acct.host, acct.port, implicitTls ? "tls" : "starttls");
  let r = new WireReader(wire);
  try {
    await expect(r, [220], "greeting");
    await wire.write(`EHLO shaiqmuhammad.com${CRLF}`);
    await expect(r, [250], "EHLO");
    if (!implicitTls) {
      await wire.write(`STARTTLS${CRLF}`);
      await expect(r, [220], "STARTTLS");
      wire = await wire.startTls(acct.host);
      r = new WireReader(wire);
      await wire.write(`EHLO shaiqmuhammad.com${CRLF}`);
      await expect(r, [250], "EHLO");
    }
    await wire.write(`AUTH LOGIN${CRLF}`);
    await expect(r, [334], "AUTH");
    await wire.write(`${b64(acct.user)}${CRLF}`);
    await expect(r, [334], "AUTH user");
    await wire.write(`${b64(acct.pass)}${CRLF}`);
    await expect(r, [235], "AUTH password");
    const out = await fn(wire, r);
    await wire.write(`QUIT${CRLF}`).catch(() => undefined);
    return out;
  } finally {
    await wire.close();
  }
}

export async function verifySmtp(acct: SmtpAccount) {
  await session(acct, async () => undefined);
  return true;
}

/** Sends and returns the exact RFC 5322 message (for IMAP APPEND to Sent). */
export async function sendMail(acct: SmtpAccount, mail: OutMail): Promise<{ raw: string }> {
  const rcpts = [...mail.to, ...(mail.cc ?? []), ...(mail.bcc ?? [])].map((s) => s.replace(/.*<([^>]+)>.*/, "$1").trim()).filter(Boolean);
  if (!rcpts.length) throw new Error("No recipients");
  const raw = buildMime(mail);
  const data = raw
    .split(CRLF)
    .map((l) => (l.startsWith(".") ? `.${l}` : l))
    .join(CRLF);
  await session(acct, async (w, r) => {
    await w.write(`MAIL FROM:<${mail.from}>${CRLF}`);
    await expect(r, [250], "MAIL FROM");
    for (const to of rcpts) {
      await w.write(`RCPT TO:<${to}>${CRLF}`);
      await expect(r, [250, 251], "RCPT TO");
    }
    await w.write(`DATA${CRLF}`);
    await expect(r, [354], "DATA");
    await w.write(`${data}${CRLF}.${CRLF}`);
    await expect(r, [250], "message");
  });
  return { raw };
}
