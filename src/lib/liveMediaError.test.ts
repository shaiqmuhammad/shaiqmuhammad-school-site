import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  genericErrorBanner,
  dedupeLivePtrs,
  friendlyMediaPhrases,
  isRetryableSubError,
  isSessionDisconnectError,
  matchRemoteTrack,
  mediaErrorDetail,
  pruneLivePtrs,
  sfuResponseDetail,
  withErrorDetail,
} from "./liveMediaError.ts";

const phrases = {
  both: (l: string, d: string) => `Something went wrong (${l}): ${d}`,
  detailOnly: (d: string) => `Something went wrong: ${d}`,
  labelOnly: (l: string) => `Something went wrong (${l}).`,
  none: "Something went wrong.",
};

/** Same composition lmsErrorText uses, without importing lms.ts (parameter properties). */
function banner(e: unknown, label: string, mapped?: string) {
  const detail = mediaErrorDetail(e);
  if (mapped) return withErrorDetail(mapped, detail === "sfu_publish" ? "" : detail);
  return genericErrorBanner(label, detail, phrases);
}

function lmsLike(code: string, status: number, data?: Record<string, unknown>) {
  return Object.assign(new Error(code), { code, status, data });
}

describe("sfuResponseDetail", () => {
  it("joins top-level Cloudflare errorCode and errorDescription", () => {
    assert.equal(
      sfuResponseDetail({ errorCode: "invalid_session_description", errorDescription: "SDP cannot be accepted" }),
      "invalid_session_description: SDP cannot be accepted",
    );
  });
  it("includes per-track errors from a HTTP 200 batch", () => {
    const d = sfuResponseDetail({
      tracks: [
        { mid: "0", trackName: "camera" },
        { mid: "1", trackName: "mic", errorCode: "empty_track_error", errorDescription: "no media yet" },
      ],
    });
    assert.match(d, /mic: empty_track_error: no media yet/);
  });
});

describe("mediaErrorDetail and banner text", () => {
  it("surfaces SFU fields on a generic LmsError('error') instead of a bare (Mic) banner", () => {
    const er = lmsLike("error", 406, { errorCode: "invalid_session_description", errorDescription: "SDP cannot be accepted" });
    assert.equal(mediaErrorDetail(er), "invalid_session_description: SDP cannot be accepted");
    assert.equal(banner(er, "Mic"), "Something went wrong (Mic): invalid_session_description: SDP cannot be accepted");
  });
  it("appends the precise cause onto a mapped sfu_publish message", () => {
    const er = lmsLike("sfu_publish", 200, { errorCode: "session_error", errorDescription: "complete connection setup" });
    const text = banner(er, "Mic", "Could not share your camera or mic. Check permissions and try again.");
    assert.match(text, /Could not share your camera or mic/);
    assert.match(text, /session_error: complete connection setup/);
  });
  it("does not collapse an unmapped snake_case code like not_allowed", () => {
    const er = lmsLike("not_allowed", 403, { error: "not_allowed" });
    assert.equal(banner(er, "Mic"), "Something went wrong (Mic): not_allowed");
  });
  it("shows DOMException name and message", () => {
    const e = new DOMException("Device in use", "AbortError");
    assert.equal(mediaErrorDetail(e), "AbortError: Device in use");
    assert.equal(banner(e, "Mic"), "Something went wrong (Mic): AbortError: Device in use");
  });
  it("keeps a friendly mapped code unchanged when there is no extra detail", () => {
    const er = lmsLike("sfu_publish", 400);
    assert.equal(
      banner(er, "Mic", "Could not share your camera or mic. Check permissions and try again."),
      "Could not share your camera or mic. Check permissions and try again.",
    );
  });
  it("would previously have shown only (Mic). for an empty 'error' code", () => {
    const er = lmsLike("error", 400, {});
    assert.equal(genericErrorBanner("Mic", mediaErrorDetail(er), phrases), "Something went wrong (Mic).");
  });
});

describe("matchRemoteTrack", () => {
  it("matches by trackName and skips used mids", () => {
    const tracks = [
      { mid: "0", trackName: "camera", sessionId: "pub-a" },
      { mid: "1", trackName: "mic", sessionId: "pub-a" },
    ];
    const used = new Set<string>();
    const cam = matchRemoteTrack(tracks, { name: "camera", sessionId: "pub-a" }, used);
    used.add(String(cam?.mid));
    const mic = matchRemoteTrack(tracks, { name: "mic", sessionId: "pub-a" }, used);
    assert.equal(cam?.mid, "0");
    assert.equal(mic?.mid, "1");
  });
  it("falls back to session + order when trackName is missing", () => {
    const tracks = [
      { mid: 0, sessionId: "pub-a" },
      { mid: 1, sessionId: "pub-a" },
    ];
    const used = new Set<string>();
    const cam = matchRemoteTrack(tracks, { name: "camera", sessionId: "pub-a" }, used, 0);
    used.add(String(cam?.mid));
    const mic = matchRemoteTrack(tracks, { name: "mic", sessionId: "pub-a" }, used, 1);
    assert.equal(String(cam?.mid), "0");
    assert.equal(String(mic?.mid), "1");
  });
});

describe("isRetryableSubError", () => {
  it("retries empty or missing source tracks", () => {
    assert.equal(isRetryableSubError("mic: empty_track_error: no media yet"), true);
    assert.equal(isRetryableSubError("not_found_track_error"), true);
    assert.equal(isRetryableSubError("invalid_session_description: SDP cannot be accepted"), false);
  });
});

describe("isSessionDisconnectError", () => {
  it("matches Cloudflare session_error disconnected payloads", () => {
    const er = lmsLike("sfu_publish", 200, {
      errorCode: "session_error",
      errorDescription: "Session appears to be disconnected. Please check if the PeerConnection is connected.",
    });
    assert.equal(isSessionDisconnectError(er), true);
    assert.equal(isSessionDisconnectError(lmsLike("error", 406, { errorCode: "empty_track_error" })), false);
  });
});

describe("friendly media banner", () => {
  const tr = (en: string) => en;
  it("keeps the detailed cause in parentheses", () => {
    const er = lmsLike("sfu_publish", 200, {
      errorCode: "session_error",
      errorDescription: "Session appears to be disconnected. Please check if the PeerConnection is connected.",
    });
    const text = genericErrorBanner("Mic", mediaErrorDetail(er), friendlyMediaPhrases(tr));
    assert.match(text, /Couldn't connect your Mic/);
    assert.match(text, /session_error: Session appears to be disconnected/);
  });
});

describe("dedupeLivePtrs and pruneLivePtrs", () => {
  it("keeps one pointer per user and drops leftovers after leave", () => {
    const stacked = [
      { userId: "a", name: "A", on: true, x: 1 },
      { userId: "a", name: "A", on: true, x: 2 },
      { userId: "b", name: "B", on: true, x: 3 },
      { userId: "b", name: "B", on: false, x: 3 },
      { userId: "", name: "ghost", on: true, x: 0 },
    ];
    const deduped = dedupeLivePtrs(stacked);
    assert.equal(deduped.length, 1);
    assert.equal(deduped[0]?.userId, "a");
    assert.equal(deduped[0]?.x, 2);
    const pruned = pruneLivePtrs([
      { userId: "a", name: "A", on: true },
      { userId: "gone", name: "Old", on: true },
    ], ["a"]);
    assert.deepEqual(pruned.map((p) => p.userId), ["a"]);
  });
});
