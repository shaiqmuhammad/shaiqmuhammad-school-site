import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  CLASSROOM_OPEN_GUARD_KEY,
  classroomHref,
  isClassroomPath,
  openClassroomTab,
  prepareClassroomTab,
} from "./classroom.ts";

type OpenCall = { url: string; target?: string; features?: string };

function mockWindow(opts: { path: string; search?: string; openImpl?: (url: string) => { closed: boolean; opener: unknown; location?: { replace: (u: string) => void }; close?: () => void } | null }) {
  const store: Record<string, string> = {};
  const opens: OpenCall[] = [];
  let href = `https://www.shaiqmuhammad.com${opts.path}${opts.search || ""}`;
  const loc = {
    get pathname() { return new URL(href).pathname; },
    get search() { return new URL(href).search; },
    get href() { return href; },
    assign(url: string) { href = new URL(url, href).toString(); },
    replace(url: string) { href = new URL(url, href).toString(); },
    set hrefSetter(url: string) { href = new URL(url, href).toString(); },
  };
  Object.defineProperty(loc, "href", {
    get() { return href; },
    set(url: string) { href = new URL(url, href).toString(); },
    configurable: true,
  });
  const g = globalThis as typeof globalThis & { window: unknown; sessionStorage: Storage };
  const sessionStorage = {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
    clear: () => { for (const k of Object.keys(store)) delete store[k]; },
    key: (i: number) => Object.keys(store)[i] ?? null,
    get length() { return Object.keys(store).length; },
  } as Storage;
  const win = {
    location: loc,
    open(url: string, target?: string, features?: string) {
      opens.push({ url, target, features });
      if (opts.openImpl) return opts.openImpl(url);
      return { closed: false, opener: win, close() { this.closed = true; }, location: { replace(u: string) { href = u; } } };
    },
  };
  g.window = win;
  g.sessionStorage = sessionStorage;
  (win as unknown as { sessionStorage: Storage }).sessionStorage = sessionStorage;
  return { opens, getHref: () => href, sessionStorage, win };
}

const saved = { window: (globalThis as { window?: unknown }).window, sessionStorage: (globalThis as { sessionStorage?: unknown }).sessionStorage };

beforeEach(() => {
  delete (globalThis as { window?: unknown }).window;
  delete (globalThis as { sessionStorage?: unknown }).sessionStorage;
});
afterEach(() => {
  if (saved.window !== undefined) (globalThis as { window?: unknown }).window = saved.window;
  else delete (globalThis as { window?: unknown }).window;
  if (saved.sessionStorage !== undefined) (globalThis as { sessionStorage?: unknown }).sessionStorage = saved.sessionStorage;
});

describe("isClassroomPath", () => {
  it("matches /classroom and join, not LMS or admin", () => {
    assert.equal(isClassroomPath("/classroom"), true);
    assert.equal(isClassroomPath("/classroom/join"), true);
    assert.equal(isClassroomPath("/lms/live"), false);
    assert.equal(isClassroomPath("/admin"), false);
    assert.equal(isClassroomPath(""), false);
  });
});

describe("openClassroomTab", () => {
  it("opens a new tab from an area page and does not change that page", () => {
    const { opens, getHref } = mockWindow({ path: "/lms/live" });
    const source = getHref();
    assert.equal(openClassroomTab({ room: "lv_abc", asAdmin: true }), true);
    assert.equal(opens.length, 1);
    assert.equal(opens[0]!.url, classroomHref({ room: "lv_abc", asAdmin: true }));
    assert.equal(opens[0]!.target, "_blank");
    assert.equal(opens[0]!.features, undefined);
    assert.equal(getHref(), source);
  });

  it("never opens a tab or navigates when already on /classroom", () => {
    const { opens, getHref } = mockWindow({ path: "/classroom", search: "?room=lv_abc&as=admin" });
    const source = getHref();
    assert.equal(openClassroomTab({ room: "lv_abc", asAdmin: true }), false);
    assert.equal(opens.length, 0);
    assert.equal(getHref(), source);
  });

  it("does not location.assign when window.open returns null (Safari noopener)", () => {
    const { opens, getHref } = mockWindow({ path: "/admin", search: "?room=lv_abc", openImpl: () => null });
    const source = getHref();
    assert.equal(openClassroomTab({ room: "lv_abc", asAdmin: true }), false);
    assert.equal(opens.length, 1);
    assert.equal(getHref(), source);
  });

  it("sessionStorage guard skips a repeat open of the same href", () => {
    const { opens } = mockWindow({ path: "/lms/live" });
    assert.equal(openClassroomTab({ room: "lv_abc" }), true);
    assert.equal(openClassroomTab({ room: "lv_abc" }), false);
    assert.equal(opens.length, 1);
    assert.ok(opens[0]);
  });

  it("still opens a different room", () => {
    const { opens } = mockWindow({ path: "/lms/live" });
    assert.equal(openClassroomTab({ room: "lv_1" }), true);
    assert.equal(openClassroomTab({ room: "lv_2" }), true);
    assert.equal(opens.length, 2);
  });
});

describe("prepareClassroomTab", () => {
  it("is a no-op on /classroom", () => {
    const { opens, getHref } = mockWindow({ path: "/classroom", search: "?room=lv_abc&as=admin" });
    const source = getHref();
    const tab = prepareClassroomTab();
    assert.equal(tab.go({ room: "lv_abc", asAdmin: true }), false);
    assert.equal(opens.length, 0);
    assert.equal(getHref(), source);
  });

  it("opens a blank tab during the click and points it at the room after start", () => {
    let replaced = "";
    const { opens, getHref } = mockWindow({
      path: "/lms/live",
      openImpl: (url) => ({
        closed: false,
        opener: {},
        location: { replace(u: string) { replaced = u; } },
        close() { this.closed = true; },
      }),
    });
    const source = getHref();
    const tab = prepareClassroomTab();
    assert.equal(opens[0]?.url, "about:blank");
    assert.equal(tab.go({ room: "lv_new" }), true);
    assert.equal(replaced, classroomHref({ room: "lv_new" }));
    assert.equal(getHref(), source);
  });

  it("cancel closes the placeholder and leaves the area page alone", () => {
    let closed = false;
    const { getHref } = mockWindow({
      path: "/admin",
      openImpl: () => ({
        closed: false,
        opener: {},
        location: { replace() { /* */ } },
        close() { closed = true; this.closed = true; },
      }),
    });
    const source = getHref();
    const tab = prepareClassroomTab();
    tab.cancel();
    assert.equal(closed, true);
    assert.equal(getHref(), source);
  });
});

describe("CLASSROOM_OPEN_GUARD_KEY", () => {
  it("is the documented sessionStorage key", () => {
    assert.equal(CLASSROOM_OPEN_GUARD_KEY, "sm-classroom-open");
  });
});
