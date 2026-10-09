import { connect } from "cloudflare:sockets";
/**
 * Tiny TCP/TLS socket wrapper used by the SMTP + IMAP clients.
 * - Cloudflare Workers: `cloudflare:sockets` (supports STARTTLS via startTls()).
 */
export type Wire = {
  write(data: string | Uint8Array): Promise<void>;
  /** Next chunk, or null when closed. */
  read(): Promise<Uint8Array | null>;
  startTls(host: string): Promise<Wire>;
  close(): Promise<void>;
};


const enc = new TextEncoder();

export async function openWire(host: string, port: number, mode: "tls" | "starttls" | "plain", timeoutMs = 10000): Promise<Wire> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      openCf(host, port, mode),
      new Promise<never>((_, rej) => {
        timer = setTimeout(() => rej(new Error(`Could not reach ${host}:${port}`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

type CfSocket = {
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
  startTls(opts?: { expectedServerHostname?: string }): CfSocket;
  close(): Promise<void>;
  opened?: Promise<unknown>;
};

async function openCf(host: string, port: number, mode: "tls" | "starttls" | "plain"): Promise<Wire> {
  // `opened` rejects if the TCP connect fails — surface that instead of hanging.
  const sock = (connect as unknown as (a: { hostname: string; port: number }, o: { secureTransport: "on" | "off" | "starttls"; allowHalfOpen?: boolean }) => CfSocket)(
    { hostname: host, port },
    { secureTransport: mode === "tls" ? "on" : mode === "starttls" ? "starttls" : "off", allowHalfOpen: false },
  );
  if (sock.opened) await sock.opened;
  return wrapCf(sock);
}

function wrapCf(sock: CfSocket): Wire {
  const reader = sock.readable.getReader();
  const writer = sock.writable.getWriter();
  return {
    async write(data) {
      await writer.write(typeof data === "string" ? enc.encode(data) : data);
    },
    async read() {
      const r = await reader.read();
      return r.done ? null : (r.value ?? new Uint8Array());
    },
    async startTls(host) {
      reader.releaseLock();
      writer.releaseLock();
      return wrapCf(sock.startTls({ expectedServerHostname: host }));
    },
    async close() {
      try {
        await sock.close();
      } catch {
        /* already closed */
      }
    },
  };
}

/** Line/response reader on top of a Wire (latin1, so string length == byte length). */
export class WireReader {
  buf = "";
  constructor(public wire: Wire) {}
  async fill(timeoutMs = 20000) {
    const chunk = await Promise.race([
      this.wire.read(),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("Mail server timed out")), timeoutMs)),
    ]);
    if (chunk === null) throw new Error("Mail server closed the connection");
    this.buf += bytesToLatin1(chunk);
  }
  async line(): Promise<string> {
    for (;;) {
      const i = this.buf.indexOf("\r\n");
      if (i >= 0) {
        const l = this.buf.slice(0, i);
        this.buf = this.buf.slice(i + 2);
        return l;
      }
      await this.fill();
    }
  }
  async bytes(n: number): Promise<string> {
    while (this.buf.length < n) await this.fill();
    const s = this.buf.slice(0, n);
    this.buf = this.buf.slice(n);
    return s;
  }
}

export function bytesToLatin1(bytes: Uint8Array) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 8192) {
    s += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 8192)));
  }
  return s;
}

export function latin1ToBytes(s: string) {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i += 1) out[i] = s.charCodeAt(i) & 255;
  return out;
}

export function latin1ToUtf8(s: string, charset = "utf-8") {
  const bytes = latin1ToBytes(s);
  try {
    return new TextDecoder(charset.toLowerCase() === "us-ascii" ? "utf-8" : charset).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

export function b64(s: string) {
  const bytes = enc.encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
