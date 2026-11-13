import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultStudentPin, initialAccountPin } from "../src/studentPin.ts";

const SIX = "abcdef";
const LONG = "a".repeat(64);

test("shared default is accepted only inside the student password length rules", () => {
  assert.equal(defaultStudentPin(undefined), "");
  assert.equal(defaultStudentPin(""), "");
  assert.equal(defaultStudentPin("   "), "");
  assert.equal(defaultStudentPin("abc"), "");
  assert.equal(defaultStudentPin("abcde"), "");
  assert.equal(defaultStudentPin(SIX), SIX);
  assert.equal(defaultStudentPin(`  ${SIX}\n`), SIX);
  assert.equal(defaultStudentPin(LONG), LONG);
  assert.equal(defaultStudentPin(`${LONG}x`), "");
});

test("new students use the shared default only when Password was left empty", () => {
  assert.equal(initialAccountPin("student", "", SIX), SIX);
  assert.equal(initialAccountPin("student", "custom1", SIX), "custom1");
  assert.equal(initialAccountPin("student", "", ""), "");
  assert.equal(initialAccountPin("teacher", "", SIX), "");
  assert.equal(initialAccountPin("parent", "", SIX), "");
  assert.equal(initialAccountPin("teacher", "custom1", SIX), "custom1");
});
