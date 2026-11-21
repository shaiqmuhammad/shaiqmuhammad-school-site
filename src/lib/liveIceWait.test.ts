import assert from "node:assert/strict";
import { test } from "node:test";
import { ICE_WAIT_MS, iceSummary, mergeIceServers, waitConnected, waitIce, type IceLike } from "./liveIceWait.ts";

class FakePc implements IceLike {
  iceGatheringState = "gathering";
  private fns = new Map<string, Set<(ev: { candidate?: { type?: string | null } | null }) => void>>();
  addEventListener(type: string, fn: (ev: { candidate?: { type?: string | null } | null }) => void) {
    const set = this.fns.get(type) || new Set();
    set.add(fn);
    this.fns.set(type, set);
  }
  removeEventListener(type: string, fn: (ev: { candidate?: { type?: string | null } | null }) => void) {
    this.fns.get(type)?.delete(fn);
  }
  emit(type: string, ev: { candidate?: { type?: string | null } | null } = {}) {
    for (const fn of this.fns.get(type) || []) fn(ev);
  }
  complete() {
    this.iceGatheringState = "complete";
    this.emit("icegatheringstatechange");
  }
  cand(type: string) {
    this.emit("icecandidate", { candidate: { type } });
  }
}

test("waitIce returns immediately when gathering is already complete", async () => {
  const pc = new FakePc();
  pc.iceGatheringState = "complete";
  const t0 = Date.now();
  await waitIce(pc, 400);
  assert.ok(Date.now() - t0 < 80);
});

test("waitIce resolves as soon as a srflx candidate arrives", async () => {
  const pc = new FakePc();
  const t0 = Date.now();
  const p = waitIce(pc, 400);
  setTimeout(() => pc.cand("srflx"), 30);
  await p;
  assert.ok(Date.now() - t0 < 150);
});

test("waitIce does not resolve on a host-only candidate before the cap", async () => {
  const pc = new FakePc();
  const t0 = Date.now();
  const p = waitIce(pc, 80);
  setTimeout(() => pc.cand("host"), 10);
  await p;
  assert.ok(Date.now() - t0 >= 70);
});

test("mergeIceServers always keeps Cloudflare STUN and drops port 53", () => {
  const out = mergeIceServers([
    { urls: "turn:example.invalid:53", username: "x", credential: "y" },
    { urls: ["turn:example.invalid:3478?transport=udp"] },
  ]);
  const urls = out.flatMap((s) => Array.isArray(s.urls) ? s.urls : [s.urls]);
  assert.ok(urls.includes("stun:stun.cloudflare.com:3478"));
  assert.ok(urls.some((u) => String(u).startsWith("turn:example.invalid:3478")));
  assert.ok(!urls.some((u) => /:53(\?|$)/.test(String(u))));
  assert.equal(iceSummary(out), "stun:1 turn:1");
});

test("ICE_WAIT_MS stays a short cap", () => {
  assert.equal(ICE_WAIT_MS, 150);
});


function fakeConn(state: string) {
  const listeners: Record<string, Array<() => void>> = {};
  const pc = {
    connectionState: state,
    iceConnectionState: state,
    addEventListener: (type: string, fn: () => void) => { (listeners[type] ||= []).push(fn); },
    removeEventListener: (type: string, fn: () => void) => { listeners[type] = (listeners[type] || []).filter((x) => x !== fn); },
    fire(type: string) { for (const fn of listeners[type] || []) fn(); },
  };
  return pc;
}

test("waitConnected resolves immediately when already connected", async () => {
  const pc = fakeConn("connected");
  assert.equal(await waitConnected(pc, 50), true);
});

test("waitConnected waits for connectionstatechange", async () => {
  const pc = fakeConn("connecting");
  const p = waitConnected(pc, 500);
  setTimeout(() => { pc.connectionState = "connected"; pc.iceConnectionState = "connected"; pc.fire("connectionstatechange"); }, 20);
  assert.equal(await p, true);
});

test("waitConnected times out as false when it never connects", async () => {
  const pc = fakeConn("connecting");
  assert.equal(await waitConnected(pc, 30), false);
});
