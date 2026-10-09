/** Admin-only mail client (contact@ inbox via the Worker) + contact-form messages. Uses ONLY the admin session. */
import { getServerSession } from "@/lib/adminServer";
import { ASSESSMENT_API_BASE } from "@/lib/groupSession";

export type Folder = { path: string; name: string; total: number; unread: number };
export type MailItem = { uid: number; subject: string; from: string; to: string; date: string; attachments: number; seen: boolean; flagged: boolean; answered: boolean };
export type MailMessage = { uid: number; subject: string; from: string; fromAddr: string; to: string; cc: string; replyTo: string; date: string; messageId: string; html: string; text: string; attachments: { part: string; filename: string; mime: string; size: number }[] };
export type ContactMsg = { id: string; name: string; email: string; subject: string; message: string; created: number; read: boolean; emailed: boolean };
export type OutAttachment = { filename: string; contentType: string; base64: string };

class MailError extends Error { constructor(public code: string, public status: number) { super(code); } }

async function call<T>(path: string, init: { method?: string; body?: unknown; query?: Record<string, string | number> } = {}): Promise<T> {
  const tok = getServerSession()?.token;
  if (!tok) throw new MailError("unauthorized", 401);
  const q = init.query ? `?${new URLSearchParams(Object.entries(init.query).map(([k, v]) => [k, String(v)]))}` : "";
  const res = await fetch(`${ASSESSMENT_API_BASE}${path}${q}`, { method: init.method || (init.body ? "POST" : "GET"), headers: { Authorization: `Bearer ${tok}`, ...(init.body ? { "Content-Type": "application/json" } : {}) }, body: init.body ? JSON.stringify(init.body) : undefined });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string; detail?: string };
  if (!res.ok) throw new MailError(data.error || `http_${res.status}`, res.status);
  return data;
}

export type MailSignature = { on: boolean; name: string; title: string; email: string; website: string; phone?: string; logo: boolean };

export const mailApi = {
  status: () => call<{ ready: boolean; unread: number | null }>("/api/mail/status"),
  folders: () => call<{ folders: Folder[] }>("/api/mail/folders"),
  list: (folder: string, page = 0) => call<{ total: number; items: MailItem[] }>("/api/mail/list", { query: { folder, page } }),
  message: (folder: string, uid: number) => call<MailMessage>("/api/mail/message", { query: { folder, uid } }),
  seen: (folder: string, uids: number[], seen: boolean) => call<{ ok: true }>("/api/mail/seen", { body: { folder, uids, seen } }),
  signature: (signature?: MailSignature) => call<{ signature: MailSignature; html: string }>("/api/mail/signature", signature ? { body: { signature } } : {}),
  send: (m: { to: string; cc?: string; subject: string; text: string; inReplyTo?: string; attachments?: OutAttachment[]; signature?: boolean }) => call<{ ok: true }>("/api/mail/send", { body: m }),
  async part(folder: string, uid: number, part: string, filename: string) {
    const tok = getServerSession()?.token;
    const res = await fetch(`${ASSESSMENT_API_BASE}/api/mail/part?${new URLSearchParams({ folder, uid: String(uid), part })}`, { headers: { Authorization: `Bearer ${tok}` } });
    if (!res.ok) throw new MailError("download", res.status);
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  },
  contacts: () => call<{ items: ContactMsg[]; unread: number }>("/api/lms/contacts"),
  contactRead: (id: string) => call<{ items: ContactMsg[]; unread: number }>("/api/lms/contacts", { body: { id } }),
  contactDelete: (id: string) => call<{ items: ContactMsg[]; unread: number }>("/api/lms/contacts", { body: { id, delete: true } }),
  emailPin: (id: string) => call<{ ok: true }>("/api/lms/email-pin", { body: { id } }),
};
