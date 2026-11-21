import assert from "node:assert/strict";
import { test } from "node:test";
import { canControlStudentMedia, canPresentInRoom, canSetMemberFloor, memberFloor, normalizePtrKind } from "../src/liveMedia";

const teacher = (id: string, perms: string[] = []) => ({ id, role: "teacher", perms });
const student = (id: string) => ({ id, role: "student", perms: [] as string[] });
const admin = { id: "admin", role: "admin", perms: [] as string[] };

test("the teacher who hosts the room can always allow student cam/mic, even with liveCamMic off", () => {
  const host = teacher("t1", ["liveLesson", "liveSchedule", "liveInstant"]);
  assert.equal(canControlStudentMedia(host, "t1", "camMic"), true);
  assert.equal(canControlStudentMedia(host, "t1", "screenShare"), true);
});

test("a teacher who is not the host needs the liveCamMic switch", () => {
  const other = teacher("t2", ["liveLesson"]);
  assert.equal(canControlStudentMedia(other, "t1", "camMic"), false);
  assert.equal(canControlStudentMedia(teacher("t2", ["liveCamMic"]), "t1", "camMic"), true);
});

test("admin can always allow, students never can", () => {
  assert.equal(canControlStudentMedia(admin, "t1", "camMic"), true);
  assert.equal(canControlStudentMedia(student("s1"), "t1", "camMic"), false);
  assert.equal(canControlStudentMedia(student("t1"), "t1", "camMic"), false);
});

test("the teacher who hosts the room can always present and open the whiteboard, even with livePresent off", () => {
  const host = teacher("t1", ["liveLesson", "liveSchedule", "liveInstant"]);
  assert.equal(canPresentInRoom(host, "t1"), true);
  assert.equal(canPresentInRoom(teacher("t2", ["liveLesson"]), "t1"), false);
  assert.equal(canPresentInRoom(teacher("t2", ["livePresent"]), "t1"), true);
  assert.equal(canPresentInRoom(admin, "t1"), true);
  assert.equal(canPresentInRoom(student("t1"), "t1"), false);
});


test("pointer kind defaults to pen and accepts the picker set", () => {
  assert.equal(normalizePtrKind(undefined), "pen");
  assert.equal(normalizePtrKind("laser"), "laser");
  assert.equal(normalizePtrKind("hand"), "hand");
  assert.equal(normalizePtrKind("finger"), "finger");
  assert.equal(normalizePtrKind("stick"), "stick");
  assert.equal(normalizePtrKind("arrow"), "arrow");
  assert.equal(normalizePtrKind("pen"), "pen");
  assert.equal(normalizePtrKind("unknown"), "pen");
});


test("joiners default to attendee; the room host is always a presenter", () => {
  assert.equal(memberFloor({ id: "t1" }, "t1"), "presenter");
  assert.equal(memberFloor({ id: "s1" }, "t1"), "attendee");
  assert.equal(memberFloor({ id: "s1", floor: "attendee" }, "t1"), "attendee");
  assert.equal(memberFloor({ id: "s1", floor: "presenter" }, "t1"), "presenter");
  assert.equal(memberFloor({ id: "t1", floor: "attendee" }, "t1"), "presenter");
});

test("only the host or admin can change a joiner's floor, and never the host's", () => {
  assert.equal(canSetMemberFloor("t1", "teacher", "t1", "s1"), true);
  assert.equal(canSetMemberFloor("admin", "admin", "t1", "s1"), true);
  assert.equal(canSetMemberFloor("t2", "teacher", "t1", "s1"), false);
  assert.equal(canSetMemberFloor("t1", "teacher", "t1", "t1"), false);
  assert.equal(canSetMemberFloor("s1", "student", "t1", "s2"), false);
});
