import assert from "node:assert/strict";
import { test } from "node:test";
import { canControlStudentMedia, canPresentInRoom } from "../src/liveMedia";

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
