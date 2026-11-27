/**
 * t421 one-time: make the online Assessment Tracker match the teacher's Excel trackers as they stood at 12:50 Dubai
 * on 27 Nov 2026 (a later save than the 12:16 t420s sync).
 *  - every current Excel mark (0-3) is written as an override; a different existing override is replaced (Excel wins) and
 *    its old value is kept in settings "mig:t421:log" / "mig:t421:result"; an identical override is left alone;
 *  - a cell that was filled in the 12:16 read and is now blank is cleared only if the override was from an Excel sync
 *    (by_name starts with "Excel tracker"); other teachers' overrides are left; there are none of these in this set;
 *  - same guards as t416 (student still exists with the same name; unit SC text at that index still matches); nothing else
 *    is deleted. Runs once (settings "mig:t421"), after the t420 SC and sync migrations.
 */
import { applyOverrideSet, type OvSet } from "./trkOvFix";
import { T421_CLEARS, T421_ROWS, T421_STUDENTS, T421_UNITS } from "./t421Data";
type Sql = { exec: (q: string, ...a: unknown[]) => { toArray: () => Record<string, unknown>[] } };
export const T421_SET: OvSet = {
  key: "t421", by: "Excel tracker (27 Nov 12:50)", what: "SC · set from Excel tracker (27 Nov 12:50)",
  students: T421_STUDENTS, units: T421_UNITS, rows: T421_ROWS, clears: T421_CLEARS,
};
export const applyT421 = (sql: Sql, now = Date.now()) => applyOverrideSet(sql, T421_SET, now);
