import assert from "node:assert/strict";
import { test } from "node:test";
import { liveRemoveCheck } from "../src/liveRemove.ts";

const base = { live: true, teacherId: "t1", hostId: "t1", userId: "s1", memberIds: ["t1", "s1", "s2"] };

test("the host can remove an attendee who is in the room", () => {
  assert.deepEqual(liveRemoveCheck(base), { ok: true });
});

test("an admin can remove an attendee", () => {
  assert.deepEqual(liveRemoveCheck({ ...base, hostId: "admin" }), { ok: true });
});

test("nobody can remove the host teacher", () => {
  assert.equal(liveRemoveCheck({ ...base, userId: "t1" }).ok, false);
  assert.equal(liveRemoveCheck({ ...base, hostId: "admin", userId: "t1" }).error, "forbidden");
});

test("a student cannot remove anyone", () => {
  assert.equal(liveRemoveCheck({ ...base, hostId: "s2" }).error, "forbidden");
});

test("a missing attendee is not_found", () => {
  assert.equal(liveRemoveCheck({ ...base, userId: "s9" }).error, "not_found");
});

test("a ended room cannot be changed", () => {
  assert.equal(liveRemoveCheck({ ...base, live: false }).error, "ended");
});
