import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeSfuReply, sfuResponseDetail } from "../src/sfuError.ts";

test("normalizeSfuReply fills error+detail from Cloudflare errorCode fields", () => {
  const r = normalizeSfuReply(406, {
    errorCode: "invalid_session_description",
    errorDescription: "SDP cannot be accepted",
  });
  assert.equal(r.status, 406);
  assert.equal(r.json.error, "invalid_session_description");
  assert.equal(r.json.detail, "invalid_session_description: SDP cannot be accepted");
});

test("normalizeSfuReply keeps an existing string error", () => {
  const r = normalizeSfuReply(403, { error: "not_allowed" });
  assert.equal(r.json.error, "not_allowed");
});

test("HTTP 200 with a failed track still gets a detail string", () => {
  const r = normalizeSfuReply(200, {
    tracks: [{ mid: "1", trackName: "mic", errorCode: "empty_track_error", errorDescription: "no media" }],
  });
  assert.equal(r.status, 200);
  assert.match(String(r.json.detail), /empty_track_error/);
  assert.equal(sfuResponseDetail(r.json).includes("mic"), true);
});

test("2xx with no errors stays untouched besides a missing detail", () => {
  const r = normalizeSfuReply(200, { sessionId: "abc", tracks: [{ mid: "0", trackName: "camera" }] });
  assert.equal(r.json.sessionId, "abc");
  assert.equal(r.json.detail, undefined);
  assert.equal(r.json.error, undefined);
});
