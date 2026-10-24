/** t320: Learning Material lesson pages live in the LMS worker (login required), not in the public data.json. */
import { modCall } from "@/lib/lmsMods";
import { getServerSession } from "@/lib/adminServer";
import { lmsSession } from "@/lib/lms";

export type LPage = { id: string; slug: string; title: string; excerpt: string; subject: string; published: boolean; owner: string; ownerName: string; updatedAt: string; body?: string; canEdit?: boolean; canDelete?: boolean };
export type LPageList = { items: LPage[]; canAdd: boolean; subjects: string[] };
/** Use the admin session when there is no LMS (student / teacher) session. */
export const pgAdmin = () => !lmsSession() && !!getServerSession()?.token;
export const pgApi = {
  list: (asAdmin = pgAdmin()) => modCall<LPageList>("pg-list", {}, asAdmin),
  get: (slug: string, asAdmin = pgAdmin()) => modCall<{ page: LPage }>("pg-get", { slug }, asAdmin).then((r) => r.page),
  save: (p: Partial<LPage> & { body: string }, asAdmin = pgAdmin()) => modCall<{ ok: true; id: string; slug: string }>("pg-save", p, asAdmin),
  del: (id: string, asAdmin = pgAdmin()) => modCall("pg-delete", { id }, asAdmin),
};
