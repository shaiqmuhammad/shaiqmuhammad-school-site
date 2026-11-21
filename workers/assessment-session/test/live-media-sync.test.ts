import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { expectedMediaTime, normalizeMediaSync, shouldSeek } from "../src/liveMediaSync.ts";

describe("normalizeMediaSync", () => {
  it("keeps a valid cursor and stamps a missing time from the caller", () => {
    const m = normalizeMediaSync({ src: "dQw4w9wgGcQ", playing: true, t: 12.4 }, "", 1_000_000);
    assert.deepEqual(m, { src: "dQw4w9wgGcQ", playing: true, t: 12.4, at: 1_000_000 });
  });
  it("rejects a missing video id and clamps a wild timestamp", () => {
    assert.equal(normalizeMediaSync({ playing: true, t: 3 }), undefined);
    const m = normalizeMediaSync({ src: "dQw4w9wgGcQ", playing: false, t: -9, at: 5 });
    assert.equal(m?.t, 0);
    assert.equal(m?.at, 5);
  });
});

describe("expectedMediaTime and shouldSeek", () => {
  it("holds still when paused and advances when playing", () => {
    assert.equal(expectedMediaTime({ playing: false, t: 10, at: 1000 }, 4000), 10);
    assert.equal(expectedMediaTime({ playing: true, t: 10, at: 1000 }, 4000), 13);
  });
  it("only seeks when the follower has drifted past the slack", () => {
    assert.equal(shouldSeek(10, 10.5), false);
    assert.equal(shouldSeek(10, 12), true);
  });
});
