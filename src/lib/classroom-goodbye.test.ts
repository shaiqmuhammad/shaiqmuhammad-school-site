import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isLiveEndedError } from "./liveEnded.ts";
import { CLASSROOM_HOME, GOODBYE_REDIRECT_MS } from "./classroomHome.ts";

describe("ended classroom links", () => {
  it("treats 410 ended as an expired class", () => {
    assert.equal(isLiveEndedError({ code: "ended", status: 410 }), true);
    assert.equal(isLiveEndedError({ code: "forbidden", status: 403 }), false);
    assert.equal(isLiveEndedError(new Error("ended")), false);
  });
  it("sends people to the public website after a short goodbye", () => {
    assert.equal(CLASSROOM_HOME, "https://www.shaiqmuhammad.com");
    assert.equal(GOODBYE_REDIRECT_MS, 6000);
  });
});
