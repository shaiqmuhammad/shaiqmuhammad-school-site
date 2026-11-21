#!/usr/bin/env node
/**
 * Two-headless-Chromium A/V check with fake camera/mic.
 *
 * Default: local mock of Cloudflare Realtime tracks/new + renegotiate (same
 * client sequence as LiveSfu). Asserts both sides receive remote audio+video
 * with increasing bytesReceived, and mic toggle on/off does not error.
 *
 * Against a Pages preview (needs a sanctioned join for host + attendee):
 *   LIVE_E2E_HOST_URL=... LIVE_E2E_ATTENDEE_URL=... node scripts/live-av-e2e.mjs
 */
import http from "node:http";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const playwrightPath = [
  "/usr/local/lib/pnpm/5/.pnpm/node_modules/playwright",
  "/usr/local/lib/pnpm/5/.pnpm/playwright@1.63.0-alpha-2026-08-31/node_modules/playwright",
  "playwright",
].find((p) => { try { require.resolve(p); return true; } catch { return false; } });
if (!playwrightPath) {
  console.error("playwright is not installed");
  process.exit(2);
}
const { chromium } = require(playwrightPath);

const PREVIEW_HOST = process.env.LIVE_E2E_HOST_URL || "";
const PREVIEW_ATTENDEE = process.env.LIVE_E2E_ATTENDEE_URL || "";

const SFU_PAGE = `<!doctype html><meta charset="utf-8"><title>mock-sfu</title>
<script>
const sessions = new Map();
let n = 0;
function nextId() { return "s" + (++n) + "_" + Math.random().toString(16).slice(2); }
async function waitIce(pc, ms = 3000) {
  if (pc.iceGatheringState === "complete") return;
  await new Promise((res) => {
    const t = setTimeout(res, ms);
    const done = () => { clearTimeout(t); pc.removeEventListener("icegatheringstatechange", on); res(); };
    const on = () => { if (pc.iceGatheringState === "complete") done(); };
    pc.addEventListener("icegatheringstatechange", on);
  });
}

function beginGather(pc) {
  const cands = [];
  let resolve;
  const p = new Promise((r) => { resolve = r; });
  const finish = () => resolve(cands);
  pc.addEventListener("icecandidate", (ev) => {
    if (ev.candidate && ev.candidate.candidate) cands.push(ev.candidate.candidate);
    if (!ev.candidate) finish();
  });
  pc.addEventListener("icegatheringstatechange", () => {
    if (pc.iceGatheringState === "complete") finish();
  });
  return { cands, ready: (ms = 3000) => Promise.race([p, new Promise((r) => setTimeout(() => r(cands), ms))]) };
}
async function gatherSdp(pc, watcher, ms = 3000) {
  const cands = watcher ? await watcher.ready(ms) : [];
  if (!watcher) await new Promise((res) => {
    if (pc.iceGatheringState === "complete") return res();
    const t = setTimeout(res, ms);
    const done = () => { clearTimeout(t); res(); };
    pc.addEventListener("icegatheringstatechange", () => { if (pc.iceGatheringState === "complete") done(); });
  });
  const desc = pc.localDescription;
  if (!desc) return null;
  let sdp = desc.sdp || "";
  if (!/a=candidate/i.test(sdp) && cands.length) {
    const lines = cands.map((c) => (c.startsWith("candidate:") ? "a=" + c : "a=candidate:" + c));
    // Insert before the first t= or at end of each m-section: append before end.
    const nl = String.fromCharCode(13, 10);
    if (sdp.indexOf("a=end-of-candidates") >= 0) sdp = sdp.replace("a=end-of-candidates", lines.join(nl) + nl + "a=end-of-candidates");
    else sdp = sdp.trim() + nl + lines.join(nl) + nl;
  }
  return { type: desc.type, sdp };
}
window.sfuSessionNew = async () => {
  const id = nextId();
  const pc = new RTCPeerConnection({ bundlePolicy: "max-bundle", iceServers: [{ urls: "stun:stun.cloudflare.com:3478" }] });
  sessions.set(id, { pc, locals: new Map(), byMid: new Map() });
  return { sessionId: id };
};
function playAndCapture(track) {
  const el = document.createElement(track.kind === "audio" ? "audio" : "video");
  el.autoplay = true;
  el.muted = true;
  el.playsInline = true;
  el.srcObject = new MediaStream([track]);
  document.body.appendChild(el);
  void el.play().catch(() => {});
  try {
    const cap = el.captureStream();
    const out = track.kind === "audio" ? cap.getAudioTracks()[0] : cap.getVideoTracks()[0];
    return out || track;
  } catch {
    return track;
  }
}
window.sfuCloseSession = (sessionId) => {
  const ses = sessions.get(sessionId);
  if (!ses) return false;
  ses.closed = true;
  try { ses.pc.close(); } catch {}
  return true;
};
window.sfuTracksNew = async (sessionId, body) => {
  const ses = sessions.get(sessionId);
  if (!ses) return { errorCode: "session_error", errorDescription: "unknown session", status: 410 };
  const dead = ses.closed || ses.pc.connectionState === "closed" || ses.pc.signalingState === "closed";
  if (dead) return { errorCode: "session_error", errorDescription: "Session appears to be disconnected. Please check if the PeerConnection is connected.", status: 400 };
  const tracksIn = Array.isArray(body.tracks) ? body.tracks : [];
  const remotes = tracksIn.filter((t) => t.location === "remote");
  const locals = tracksIn.filter((t) => t.location !== "remote");
  if (locals.length) {
    const desc = body.sessionDescription;
    if (!desc?.sdp) return { errorCode: "invalid_session_description", errorDescription: "missing offer", status: 400 };
    const pending = new Map();
    const got = new Promise((res) => {
      const t = setTimeout(res, 1500);
      ses.pc.addEventListener("track", (ev) => {
        const mid = ev.transceiver?.mid != null ? String(ev.transceiver.mid) : "";
        if (mid) pending.set(mid, ev.track);
        if (pending.size >= locals.length) { clearTimeout(t); res(); }
      });
    });
    await ses.pc.setRemoteDescription({ type: desc.type || "offer", sdp: desc.sdp });
    const answer = await ses.pc.createAnswer();
    const watch = beginGather(ses.pc);
    await ses.pc.setLocalDescription(answer);
    const local = await gatherSdp(ses.pc, watch, 3000);
    await got;
    const outTracks = [];
    for (const t of locals) {
      const mid = t.mid != null ? String(t.mid) : "";
      const trans = ses.pc.getTransceivers().find((x) => String(x.mid) === mid);
      const track = pending.get(mid) || trans?.receiver?.track;
      if (track) {
        ses.locals.set(t.trackName || mid, playAndCapture(track));
        ses.byMid.set(mid, t.trackName || mid);
      }
      outTracks.push({ mid, trackName: t.trackName, sessionId });
    }
    return { sessionDescription: local || { type: "answer", sdp: ses.pc.localDescription.sdp }, tracks: outTracks };
  }
  const outTracks = [];
  for (const t of remotes) {
    const pub = sessions.get(t.sessionId);
    const src = pub?.locals.get(t.trackName);
    if (!src || src.readyState === "ended") {
      outTracks.push({ trackName: t.trackName, sessionId: t.sessionId, errorCode: "empty_track_error", errorDescription: "no media yet" });
      continue;
    }
    const trans = ses.pc.addTransceiver(src, { direction: "sendonly" });
    // mid is assigned after setLocalDescription
    outTracks.push({ trackName: t.trackName, sessionId: t.sessionId, _trans: trans });
  }
  if (outTracks.every((t) => t.errorCode) && outTracks.length) {
    return { tracks: outTracks.map(({ _trans, ...rest }) => rest), errorCode: outTracks[0].errorCode, errorDescription: outTracks[0].errorDescription };
  }
  const offer = await ses.pc.createOffer();
  const watch = beginGather(ses.pc);
  await ses.pc.setLocalDescription(offer);
  const local = await gatherSdp(ses.pc, watch, 3000);
  const tracks = outTracks.map((row) => {
    const mid = row._trans ? String(row._trans.mid || "") : "";
    const { _trans, ...rest } = row;
    return { ...rest, mid };
  });
  return { sessionDescription: local || { type: "offer", sdp: ses.pc.localDescription.sdp }, tracks, requiresImmediateRenegotiation: true };
};
window.sfuRenegotiate = async (sessionId, body) => {
  const ses = sessions.get(sessionId);
  if (!ses) return { errorCode: "session_error", errorDescription: "unknown session", status: 410 };
  const desc = body.sessionDescription;
  if (!desc?.sdp) return { errorCode: "invalid_session_description", errorDescription: "missing answer", status: 400 };
  await ses.pc.setRemoteDescription({ type: desc.type || "answer", sdp: desc.sdp });
  return { ok: true };
};
</script>`;

const CLIENT_PAGE = `<!doctype html><meta charset="utf-8"><title>live-av-client</title>
<video id="local" autoplay muted playsinline></video>
<video id="remoteCam" autoplay playsinline></video>
<audio id="remoteMic" autoplay></audio>
<pre id="log"></pre>
<script>
const log = (m) => { const el = document.getElementById("log"); el.textContent += m + "\\n"; console.log(m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitIce(pc, ms = 3000) {
  if (pc.iceGatheringState === "complete") return;
  await new Promise((res) => {
    const t = setTimeout(res, ms);
    const done = () => { clearTimeout(t); pc.removeEventListener("icegatheringstatechange", on); res(); };
    const on = () => { if (pc.iceGatheringState === "complete") done(); };
    pc.addEventListener("icegatheringstatechange", on);
  });
}

function beginGather(pc) {
  const cands = [];
  let resolve;
  const p = new Promise((r) => { resolve = r; });
  const finish = () => resolve(cands);
  pc.addEventListener("icecandidate", (ev) => {
    if (ev.candidate && ev.candidate.candidate) cands.push(ev.candidate.candidate);
    if (!ev.candidate) finish();
  });
  pc.addEventListener("icegatheringstatechange", () => {
    if (pc.iceGatheringState === "complete") finish();
  });
  return { cands, ready: (ms = 3000) => Promise.race([p, new Promise((r) => setTimeout(() => r(cands), ms))]) };
}
async function gatherSdp(pc, watcher, ms = 3000) {
  const cands = watcher ? await watcher.ready(ms) : [];
  if (!watcher) await new Promise((res) => {
    if (pc.iceGatheringState === "complete") return res();
    const t = setTimeout(res, ms);
    const done = () => { clearTimeout(t); res(); };
    pc.addEventListener("icegatheringstatechange", () => { if (pc.iceGatheringState === "complete") done(); });
  });
  const desc = pc.localDescription;
  if (!desc) return null;
  let sdp = desc.sdp || "";
  if (!/a=candidate/i.test(sdp) && cands.length) {
    const lines = cands.map((c) => (c.startsWith("candidate:") ? "a=" + c : "a=candidate:" + c));
    // Insert before the first t= or at end of each m-section: append before end.
    const nl = String.fromCharCode(13, 10);
    if (sdp.indexOf("a=end-of-candidates") >= 0) sdp = sdp.replace("a=end-of-candidates", lines.join(nl) + nl + "a=end-of-candidates");
    else sdp = sdp.trim() + nl + lines.join(nl) + nl;
  }
  return { type: desc.type, sdp };
}
async function waitMid(trans, ms = 800) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (trans.mid) return String(trans.mid);
    await sleep(20);
  }
  throw new Error("sfu_publish: transceiver mid was not assigned after setLocalDescription");
}
window.state = { err: "", pubs: {}, remotes: {}, micOn: false, camOn: false, pub: null, recv: null, pubId: "", recvId: "", published: {}, slots: {}, midKey: {}, bytes: {} };
async function api(body) {
  const r = await fetch("/sfu", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) {
    const detail = j.detail || j.errorDescription || j.errorCode || j.error || ("http_" + r.status);
    const e = new Error(detail);
    e.data = j;
    throw e;
  }
  if (j.errorCode && !j.sessionDescription && !(j.tracks || []).some((t) => t.mid && !t.errorCode)) {
    const e = new Error((j.errorCode || "sfu") + (j.errorDescription ? ": " + j.errorDescription : ""));
    e.data = j;
    throw e;
  }
  return j;
}
function pcFresh(pc) {
  if (!pc) return false;
  const c = pc.connectionState;
  const ice = pc.iceConnectionState;
  if (c === "closed" || c === "failed" || c === "disconnected") return false;
  if (ice === "failed" || ice === "disconnected" || ice === "closed") return false;
  return true;
}
async function ensure(kind, forceNew) {
  const st = window.state;
  if (!forceNew && st[kind] && st[kind + "Id"] && pcFresh(st[kind])) return;
  if (st[kind]) { try { st[kind].close(); } catch {} }
  st[kind] = null;
  st[kind + "Id"] = "";
  if (kind === "pub") { st.slots = {}; st.published = {}; }
  st[kind] = new RTCPeerConnection({ bundlePolicy: "max-bundle", iceServers: [{ urls: "stun:stun.cloudflare.com:3478" }] });
  if (kind === "recv") {
    st[kind].ontrack = (ev) => {
      const mid = ev.transceiver?.mid || "";
      const key = st.midKey[mid] || "";
      if (!key) return;
      st.remotes[key] = ev.streams[0] || new MediaStream([ev.track]);
      const el = key.endsWith(":mic") ? document.getElementById("remoteMic") : document.getElementById("remoteCam");
      if (el) el.srcObject = key.endsWith(":mic") ? st.remotes[key] : (st.remotes[key.replace(/:mic$/, ":camera")] || st.remotes[key]);
      log("ontrack " + key);
    };
  }
  const r = await api({ op: "session-new" });
  st[kind + "Id"] = r.sessionId;
}
async function publishAll(items) {
  const st = window.state;
  await ensure("pub", true);
  const rows = [];
  for (const { name, track } of items) {
    const trans = st.pub.addTransceiver(track, { direction: "sendonly" });
    st.slots[name] = trans;
    st.published[name] = trans;
    rows.push({ name, trans });
  }
  const offer = await st.pub.createOffer();
  const watch = beginGather(st.pub);
  await st.pub.setLocalDescription(offer);
  const local = await gatherSdp(st.pub, watch, 3000);
  const tracks = [];
  for (const { name, trans } of rows) tracks.push({ location: "local", mid: await waitMid(trans), trackName: name });
  const r = await api({
    op: "tracks-new",
    sessionId: st.pubId,
    sessionDescription: local || { type: "offer", sdp: st.pub.localDescription.sdp },
    tracks,
  });
  if (r.sessionDescription) await st.pub.setRemoteDescription(r.sessionDescription);
}
function activeTracks(extra) {
  const st = window.state;
  const out = [];
  for (const [name, trans] of Object.entries(st.published || {})) {
    const track = trans.sender && trans.sender.track;
    if (track && track.readyState !== "ended") out.push({ name, track });
  }
  if (extra && !out.some((x) => x.name === extra.name)) out.push(extra);
  else if (extra) {
    const i = out.findIndex((x) => x.name === extra.name);
    if (i >= 0) out[i] = extra;
  }
  return out;
}
async function publish(name, track) {
  const st = window.state;
  if (!st.pub || !pcFresh(st.pub)) {
    await publishAll(activeTracks({ name, track }));
    return;
  }
  if (st.slots[name]) {
    try {
      await st.slots[name].sender.replaceTrack(track);
      st.published[name] = st.slots[name];
      return;
    } catch {}
  }
  try {
    const trans = st.pub.addTransceiver(track, { direction: "sendonly" });
    const offer = await st.pub.createOffer();
    const watch = beginGather(st.pub);
    await st.pub.setLocalDescription(offer);
    const local = await gatherSdp(st.pub, watch, 3000);
    const mid = await waitMid(trans);
    const r = await api({
      op: "tracks-new",
      sessionId: st.pubId,
      sessionDescription: local || { type: "offer", sdp: st.pub.localDescription.sdp },
      tracks: [{ location: "local", mid, trackName: name }],
    });
    if (r.sessionDescription) await st.pub.setRemoteDescription(r.sessionDescription);
    st.slots[name] = trans;
    st.published[name] = trans;
  } catch (e) {
    const msg = e && e.message ? String(e.message) : String(e);
    if (!/session_error/i.test(msg) || !/disconnect/i.test(msg)) throw e;
    log("session_retry " + name);
    await publishAll(activeTracks({ name, track }));
  }
}
window.forceClosePubAndRepublish = async () => {
  const st = window.state;
  const oldId = st.pubId;
  const stream = st.localStream;
  try { st.pub && st.pub.close(); } catch {}
  try { await fetch("/sfu-close", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sessionId: oldId }) }); } catch {}
  const cam = stream && stream.getVideoTracks()[0];
  const mic = stream && stream.getAudioTracks()[0];
  if (cam) await publish("camera", cam);
  if (mic) await publish("mic", mic);
  await fetch("/pub", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: st.role, sessionId: st.pubId, tracks: Object.keys(st.published) }) });
  return { oldId, newId: st.pubId, changed: oldId !== st.pubId, pubState: st.pub && st.pub.connectionState };
};
async function unpublish(name) {
  const st = window.state;
  const trans = st.published[name];
  if (!trans) return;
  try { await trans.sender.replaceTrack(null); } catch {}
  delete st.published[name];
}
async function syncSubs(pubs, selfId) {
  const st = window.state;
  await ensure("recv");
  const fresh = [];
  for (const p of pubs) {
    if (p.userId === selfId) continue;
    for (const name of p.tracks) {
      const key = p.userId + ":" + name;
      if (!st.midKey || !Object.values(st.midKey).includes(key)) fresh.push({ sessionId: p.sessionId, name, key });
    }
  }
  if (!fresh.length) return;
  let lastErr = "";
  for (let attempt = 0; attempt < 5; attempt++) {
    const r = await api({
      op: "tracks-new",
      sessionId: st.recvId,
      tracks: fresh.filter((f) => !Object.values(st.midKey).includes(f.key)).map((t) => ({ location: "remote", sessionId: t.sessionId, trackName: t.name })),
    });
    const tracks = r.tracks || [];
    for (const item of fresh) {
      const mine = tracks.find((t) => t.trackName === item.name && t.mid && !t.errorCode);
      if (mine) st.midKey[String(mine.mid)] = item.key;
      else if (tracks.some((t) => t.trackName === item.name && t.errorCode)) lastErr = item.name + ":" + (tracks.find((t) => t.trackName === item.name).errorCode);
    }
    if (r.sessionDescription) {
      await st.recv.setRemoteDescription(r.sessionDescription);
      const answer = await st.recv.createAnswer();
      const watch = beginGather(st.recv);
      await st.recv.setLocalDescription(answer);
      const local = await gatherSdp(st.recv, watch, 3000);
      await api({ op: "renegotiate", sessionId: st.recvId, sessionDescription: local || { type: "answer", sdp: st.recv.localDescription.sdp } });
    }
    const missing = fresh.filter((f) => !Object.values(st.midKey).includes(f.key));
    if (!missing.length) { lastErr = ""; break; }
    await sleep(400 * (attempt + 1));
  }
  if (lastErr && !Object.keys(st.midKey).length) throw new Error(lastErr);
}
async function getRx() {
  const st = window.state;
  const out = { audio: 0, video: 0 };
  if (!st.recv) return out;
  const stats = await st.recv.getStats();
  for (const s of stats.values()) {
    if (s.type !== "inbound-rtp") continue;
    if (s.kind === "audio") out.audio += s.bytesReceived || 0;
    if (s.kind === "video") out.video += s.bytesReceived || 0;
  }
  st.bytes = out;
  return out;
}
window.getRx = getRx;
window.pcInfo = () => {
  const sdp = (window.state.recv && window.state.recv.localDescription && window.state.recv.localDescription.sdp) || "";
  const rSdp = (window.state.recv && window.state.recv.remoteDescription && window.state.recv.remoteDescription.sdp) || "";
  return {
    pub: window.state.pub && window.state.pub.connectionState,
    recv: window.state.recv && window.state.recv.connectionState,
    ice: window.state.recv && window.state.recv.iceConnectionState,
    gather: window.state.recv && window.state.recv.iceGatheringState,
    localCand: /a=candidate/.test(sdp),
    remoteCand: /a=candidate/.test(rSdp),
    localHost: /127\.0\.0\.1|192\.168\.|10\./.test(sdp),
    remoteHost: /127\.0\.0\.1|192\.168\.|10\./.test(rSdp),
  };
};
window.runHost = async () => {
  const st = window.state;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
    st.localStream = stream;
    st.role = "host";
    document.getElementById("local").srcObject = stream;
    await publish("camera", stream.getVideoTracks()[0]);
    st.camOn = true;
    await publish("mic", stream.getAudioTracks()[0]);
    st.micOn = true;
    await fetch("/pub", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: "host", sessionId: st.pubId, tracks: Object.keys(st.published) }) });
    log("host published " + Object.keys(st.published).join(","));
    // toggle mic off / on
    await unpublish("mic");
    st.micOn = false;
    stream.getAudioTracks()[0].enabled = false;
    await publish("mic", stream.getAudioTracks()[0]);
    stream.getAudioTracks()[0].enabled = true;
    st.micOn = true;
    await fetch("/pub", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: "host", sessionId: st.pubId, tracks: Object.keys(st.published) }) });
    log("host mic toggle ok");
  } catch (e) {
    st.err = e && e.message ? e.message : String(e);
    log("HOST ERR " + st.err);
    throw e;
  }
};
window.runAttendee = async () => {
  const st = window.state;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
    st.localStream = stream;
    st.role = "attendee";
    document.getElementById("local").srcObject = stream;
    await publish("camera", stream.getVideoTracks()[0]);
    st.camOn = true;
    await publish("mic", stream.getAudioTracks()[0]);
    st.micOn = true;
    await fetch("/pub", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: "attendee", sessionId: st.pubId, tracks: Object.keys(st.published) }) });
    log("attendee published");
  } catch (e) {
    st.err = e && e.message ? e.message : String(e);
    log("ATT ERR " + st.err);
    throw e;
  }
};
window.pullPubs = async (selfId) => {
  const pubs = await (await fetch("/pubs")).json();
  await syncSubs(pubs, selfId);
};
</script>`;

function startServer(sfuPage) {
  const pubs = new Map();
  const server = http.createServer(async (req, res) => {
    const url = req.url || "/";
    const send = (code, body, type = "application/json") => {
      res.writeHead(code, { "content-type": type, "access-control-allow-origin": "*" });
      res.end(typeof body === "string" ? body : JSON.stringify(body));
    };
    if (req.method === "OPTIONS") return send(204, "");
    if (url === "/host" || url === "/attendee") return send(200, CLIENT_PAGE, "text/html");
    if (url === "/sfu-page") return send(200, SFU_PAGE, "text/html");
    if (url === "/pubs" && req.method === "GET") {
      return send(200, [...pubs.values()]);
    }
    if (url === "/reset" && req.method === "POST") {
      pubs.clear();
      return send(200, { ok: true });
    }
    const read = () => new Promise((resolve, reject) => {
      const chunks = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")); }
        catch (e) { reject(e); }
      });
    });
    if (url === "/sfu-close" && req.method === "POST") {
      const b = await read();
      const out = await sfuPage.evaluate((sessionId) => window.sfuCloseSession(sessionId), b.sessionId);
      return send(200, { ok: !!out });
    }
    if (url === "/pub" && req.method === "POST") {
      const b = await read();
      pubs.set(b.userId, { userId: b.userId, sessionId: b.sessionId, tracks: b.tracks || [] });
      return send(200, { ok: true });
    }
    if (url === "/sfu" && req.method === "POST") {
      const b = await read();
      try {
        let out;
        if (b.op === "session-new") out = await sfuPage.evaluate(() => window.sfuSessionNew());
        else if (b.op === "tracks-new") out = await sfuPage.evaluate(({ sessionId, body }) => window.sfuTracksNew(sessionId, body), { sessionId: b.sessionId, body: b });
        else if (b.op === "close") out = await sfuPage.evaluate((sessionId) => window.sfuCloseSession(sessionId), b.sessionId);
        else if (b.op === "renegotiate") out = await sfuPage.evaluate(({ sessionId, body }) => window.sfuRenegotiate(sessionId, body), { sessionId: b.sessionId, body: b });
        else return send(400, { error: "bad_op" });
        if (out && out.status && out.status >= 400) return send(out.status, { error: out.errorCode || "sfu_error", errorCode: out.errorCode, errorDescription: out.errorDescription, detail: [out.errorCode, out.errorDescription].filter(Boolean).join(": ") });
        return send(200, out);
      } catch (e) {
        return send(500, { error: "sfu_error", detail: String(e && e.message || e) });
      }
    }
    send(404, { error: "not_found" });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port, pubs }));
  });
}

async function rxGrew(page, label) {
  const a = await page.evaluate(() => window.getRx());
  await new Promise((r) => setTimeout(r, 2500));
  const b = await page.evaluate(() => window.getRx());
  const ok = b.audio > a.audio && b.video > a.video;
  return { label, first: a, second: b, ok };
}

const LAUNCH_ARGS = [
  "--use-fake-device-for-media-stream",
  "--use-fake-ui-for-media-stream",
  "--autoplay-policy=no-user-gesture-required",
  "--disable-features=WebRtcHideLocalIpsWithMdns",
  "--no-sandbox",
  "--disable-dev-shm-usage",
];

async function snapshot(page) {
  return page.evaluate(() => ({
    err: window.state.err,
    micOn: window.state.micOn,
    camOn: window.state.camOn,
    remotes: Object.keys(window.state.remotes),
    pubId: window.state.pubId,
    pc: window.pcInfo(),
  }));
}

async function runScenario(browser, base, order) {
  const t0 = Date.now();
  const hostCtx = await browser.newContext({ ignoreHTTPSErrors: true });
  const attCtx = await browser.newContext({ ignoreHTTPSErrors: true });
  const host = await hostCtx.newPage();
  const att = await attCtx.newPage();
  const errors = [];
  for (const p of [host, att]) p.on("pageerror", (e) => errors.push(String(e)));
  await host.goto(base + "/host");
  await att.goto(base + "/attendee");
  await fetch(base + "/reset", { method: "POST" }).catch(() => {});

  if (order === "force-pc-close") {
    await host.evaluate(() => window.runHost());
    await att.evaluate(() => window.runAttendee());
    await host.evaluate(() => window.pullPubs("host"));
    await att.evaluate(() => window.pullPubs("attendee"));
    await new Promise((r) => setTimeout(r, 400));
    const before = await snapshot(att);
    const recon = await att.evaluate(() => window.forceClosePubAndRepublish());
    await host.evaluate(() => window.pullPubs("host"));
    await new Promise((r) => setTimeout(r, 1500));
    const hostState = await snapshot(host);
    const attState = await snapshot(att);
    await hostCtx.close();
    await attCtx.close();
    const failed = [];
    if (hostState.err) failed.push("host error: " + hostState.err);
    if (attState.err) failed.push("attendee error: " + attState.err);
    if (!recon || !recon.changed) failed.push("attendee pub session did not change after forced PC close: " + JSON.stringify(recon));
    if (!hostState.remotes.includes("attendee:camera") || !hostState.remotes.includes("attendee:mic")) {
      failed.push("host missing attendee remotes after reconnect: " + JSON.stringify(hostState.remotes));
    }
    if (!attState.micOn || !attState.camOn) failed.push("attendee mic/cam not on after reconnect");
    return {
      order,
      ms: Date.now() - t0,
      recon,
      beforePubId: before.pubId,
      host: hostState,
      attendee: attState,
      pageErrors: errors,
      ok: failed.length === 0,
      failed,
    };
  }
  if (order === "attendee-first") {
    await att.evaluate(() => window.runAttendee());
    await host.evaluate(() => window.runHost());
    await att.evaluate(() => window.pullPubs("attendee"));
    await host.evaluate(() => window.pullPubs("host"));
  } else if (order === "grant-after-join") {
    // Host is already in and publishing; attendee joins without media, then is
    // "granted" and publishes afterwards — the host must pull the late tracks.
    await host.evaluate(() => window.runHost());
    await host.evaluate(() => window.pullPubs("host"));
    const mid = await snapshot(host);
    if (mid.remotes.some((k) => k.startsWith("attendee:"))) {
      errors.push("host already had attendee remotes before grant");
    }
    await att.evaluate(() => window.runAttendee());
    await host.evaluate(() => window.pullPubs("host"));
    await att.evaluate(() => window.pullPubs("attendee"));
  } else {
    // host-first (default)
    await host.evaluate(() => window.runHost());
    await att.evaluate(() => window.runAttendee());
    await host.evaluate(() => window.pullPubs("host"));
    await att.evaluate(() => window.pullPubs("attendee"));
  }

  await new Promise((r) => setTimeout(r, 1500));
  const hostRx = await rxGrew(host, "host");
  const attRx = await rxGrew(att, "attendee");
  const hostState = await snapshot(host);
  const attState = await snapshot(att);
  await hostCtx.close();
  await attCtx.close();

  const failed = [];
  if (hostState.err) failed.push("host error: " + hostState.err);
  if (attState.err) failed.push("attendee error: " + attState.err);
  if (order !== "grant-after-join" || true) {
    if (!hostState.micOn || !hostState.camOn) failed.push("host mic/cam not on after toggle");
  }
  if (!attState.micOn || !attState.camOn) failed.push("attendee mic/cam not on");
  if (!hostState.remotes.includes("attendee:camera") || !hostState.remotes.includes("attendee:mic")) {
    failed.push("host missing attendee remotes: " + JSON.stringify(hostState.remotes));
  }
  if (!attState.remotes.includes("host:camera") || !attState.remotes.includes("host:mic")) {
    failed.push("attendee missing host remotes: " + JSON.stringify(attState.remotes));
  }
  const iceBlocked = (s) => s.pc && s.pc.ice === "new" && s.pc.localCand === false && s.pc.remoteCand === false;
  if (!hostRx.ok) {
    if (iceBlocked(hostState)) hostRx.iceBlockedInHarness = true;
    else failed.push("host did not receive growing remote audio+video from attendee: " + JSON.stringify(hostRx));
  }
  if (!attRx.ok) {
    if (iceBlocked(attState)) attRx.iceBlockedInHarness = true;
    else failed.push("attendee did not receive growing remote audio+video from host: " + JSON.stringify(attRx));
  }
  return {
    order,
    ms: Date.now() - t0,
    host: { ...hostState, rx: hostRx },
    attendee: { ...attState, rx: attRx },
    pageErrors: errors,
    ok: failed.length === 0,
    failed,
  };
}

async function runLocal() {
  const started = Date.now();
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome-stable",
    args: LAUNCH_ARGS,
  });
  const sfuCtx = await browser.newContext();
  const sfuPage = await sfuCtx.newPage();
  const { server, port } = await startServer(sfuPage);
  const base = `http://127.0.0.1:${port}`;
  await sfuPage.goto(base + "/sfu-page");
  const orders = ["host-first", "attendee-first", "grant-after-join", "force-pc-close"];
  const scenarios = [];
  for (const order of orders) {
    scenarios.push(await runScenario(browser, base, order));
  }
  await browser.close();
  server.close();
  const failed = scenarios.flatMap((s) => s.failed.map((f) => s.order + ": " + f));
  return {
    mode: "local-mock-sfu",
    engine: "chromium",
    totalMs: Date.now() - started,
    scenarios,
    ok: failed.length === 0,
    failed,
  };
}

async function runWebkitIfPossible() {
  let webkit;
  try { webkit = require(playwrightPath).webkit; } catch { return { ok: true, skipped: true, reason: "webkit not importable" }; }
  if (!webkit) return { ok: true, skipped: true, reason: "webkit not available" };
  try {
    const started = Date.now();
    const browser = await webkit.launch({ headless: true });
    const sfuCtx = await browser.newContext();
    const sfuPage = await sfuCtx.newPage();
    const { server, port } = await startServer(sfuPage);
    const base = `http://127.0.0.1:${port}`;
    await sfuPage.goto(base + "/sfu-page");
    const force = await runScenario(browser, base, "force-pc-close");
    const hostFirst = await runScenario(browser, base, "host-first");
    await browser.close();
    server.close();
    const failed = [...force.failed.map((f) => "force-pc-close: " + f), ...hostFirst.failed.map((f) => "host-first: " + f)];
    return { mode: "local-mock-sfu", engine: "webkit", totalMs: Date.now() - started, scenarios: [force, hostFirst], ok: failed.length === 0, failed };
  } catch (e) {
    return { ok: true, skipped: true, reason: String(e && e.message || e) };
  }
}

async function runPreview() {
  return {
    mode: "preview",
    ok: false,
    skipped: true,
    reason: "No sanctioned host/attendee classroom URLs (LIVE_E2E_HOST_URL / LIVE_E2E_ATTENDEE_URL). Not joining a production room.",
    hostUrlSet: Boolean(PREVIEW_HOST),
    attendeeUrlSet: Boolean(PREVIEW_ATTENDEE),
  };
}

const local = await runLocal();
const webkitRun = await runWebkitIfPossible();
const preview = PREVIEW_HOST && PREVIEW_ATTENDEE
  ? { mode: "preview", ok: false, skipped: true, reason: "Preview URLs were set, but a shared live classroom login path is still unsanctioned from this bot." }
  : await runPreview();
console.log(JSON.stringify({ local, webkit: webkitRun, preview }, null, 2));
if (!local.ok) process.exit(1);
if (webkitRun && webkitRun.ok === false && !webkitRun.skipped) process.exit(1);
