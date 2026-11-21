"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { AssessmentShell, primaryBtn } from "@/components/assessment/AssessmentShell";
import { LmsStaffToolbar } from "@/components/lms/LmsEntry";
import { NeedLogin } from "@/components/lms/LmsDashboard";
import { ADMIN_ACTOR, useLmsActor, useTr } from "@/components/lms/useLms";
import { getServerSession } from "@/lib/adminServer";
import { LiveSfu } from "@/lib/liveSfu";
import { LiveSchedulePanel, GuestJoin } from "@/components/lms/LiveSchedule";
import { LivePresent } from "@/components/lms/LivePresent";
import { lmsApi, lmsErrorText, lmsSession, liveGuest, liveWsUrl, type LiveChat, type LivePerms, type LiveRoomInfo, type LiveSnap } from "@/lib/lms";

type Phase = "lobby" | "waiting" | "in" | "ended";

function isPermErr(e: unknown) {
  const n = e && typeof e === "object" && "name" in e ? String((e as { name: string }).name) : "";
  return n === "NotAllowedError" || n === "PermissionDeniedError" || n === "NotFoundError" || n === "NotReadableError" || n === "SecurityError";
}

function Tile({ label, stream, hand, big, off, compact }: { label: string; stream?: MediaStream | null; hand?: boolean; big?: boolean; off?: boolean; compact?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.srcObject = stream || null;
    el.muted = true;
    el.play().catch(() => undefined);
  }, [stream]);
  const hasVideo = !!stream?.getVideoTracks().some((t) => t.readyState !== "ended");
  return (
    <div className={`relative overflow-hidden rounded-3xl bg-gradient-to-br from-sky-200 to-indigo-300 shadow-md ring-2 ring-white/60 dark:from-slate-700 dark:to-indigo-900 dark:ring-white/10 ${compact ? "min-h-[88px] w-[140px] sm:min-h-[110px] sm:w-[180px]" : big ? "min-h-[220px] sm:min-h-[320px]" : "min-h-[140px] sm:min-h-[180px]"}`}>
      <video ref={ref} autoPlay playsInline muted className={`absolute inset-0 h-full w-full object-cover ${hasVideo ? "" : "hidden"}`} />
      {!hasVideo && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-[#1b3a57] dark:text-white">
          <span className={`${compact ? "text-3xl" : "text-5xl sm:text-6xl"}`} aria-hidden>{off ? "😴" : "🧑‍🎓"}</span>
          <span className="px-1 text-center text-xs font-bold opacity-80 sm:text-sm">{off ? "" : label}</span>
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/70 to-transparent px-2 py-1 text-xs font-extrabold text-white sm:px-3 sm:py-2 sm:text-sm">
        <span className="truncate">{label}</span>
        {hand ? <span className="animate-bounce text-xl sm:text-2xl" aria-label="hand raised">✋</span> : null}
      </div>
    </div>
  );
}

/** Remote video stays muted so it can autoplay without any student permission; audio plays here after a tap. */
function ClassAudio({ remotes, unlocked, onBlocked }: { remotes: Record<string, MediaStream>; unlocked: boolean; onBlocked: () => void }) {
  const audioTracks = useMemo(() => {
    const out: MediaStreamTrack[] = [];
    for (const s of Object.values(remotes)) for (const t of s.getAudioTracks()) if (t.readyState !== "ended") out.push(t);
    return out;
  }, [remotes]);
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const stream = audioTracks.length ? new MediaStream(audioTracks) : null;
    el.srcObject = stream;
    if (!stream || !unlocked) { el.pause(); return; }
    el.play().catch(() => onBlocked());
  }, [audioTracks, unlocked, onBlocked]);
  if (!audioTracks.length) return null;
  return <audio ref={ref} autoPlay playsInline className="hidden" />;
}

function LiveCountdown({ endsAt, isHost, onAdd, onSet }: { endsAt: number; isHost: boolean; onAdd: (m: number) => void; onSet: (m: number) => void }) {
  const { tr } = useTr();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, Math.ceil((endsAt - now) / 1000));
  const mm = Math.floor(left / 60);
  const ss = String(left % 60).padStart(2, "0");
  const tone = left <= 60 ? "bg-rose-500 text-white ring-rose-200 animate-pulse" : left <= 5 * 60 ? "bg-amber-400 text-[#3b2a00] ring-amber-100 animate-pulse" : "bg-emerald-400 text-[#10331c] ring-emerald-100";
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="live-ends-clock">
      <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-black ring-2 ${tone}`}>
        <span aria-hidden>⏱️</span>
        {left <= 0 ? tr("Time's up", "انتهى الوقت") : `${mm}:${ss} ${tr("left", "متبقٍ")}`}
      </span>
      {isHost && (
        <span className="flex flex-wrap gap-1">
          <button type="button" className="rounded-full bg-white/20 px-2 py-0.5 text-xs font-bold" onClick={() => onAdd(5)} data-testid="live-ends-plus5">+5</button>
          <button type="button" className="rounded-full bg-white/20 px-2 py-0.5 text-xs font-bold" onClick={() => onAdd(10)} data-testid="live-ends-plus10">+10</button>
          <select className="rounded-full bg-white/20 px-2 py-0.5 text-xs font-bold" defaultValue="" onChange={(e) => { const v = Number(e.target.value); e.target.value = ""; if (v) onSet(v); }} data-testid="live-ends-set" aria-label={tr("Set duration", "تعيين المدة")}>
            <option value="">{tr("Set", "تعيين")}</option>
            {[20, 30, 40, 45, 60, 90].map((n) => <option key={n} value={n}>{n} {tr("min", "د")}</option>)}
          </select>
        </span>
      )}
    </div>
  );
}

function VideoDock({ children }: { children: ReactNode }) {
  const { tr } = useTr();
  const [min, setMin] = useState(false);
  const [pos, setPos] = useState({ x: 16, y: 16 });
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    const t = e.target as HTMLElement;
    if (t.closest("button, video, select, a")) return;
    drag.current = { x: pos.x, y: pos.y, px: e.clientX, py: e.clientY };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    setPos({ x: Math.max(8, drag.current.x + (e.clientX - drag.current.px)), y: Math.max(8, drag.current.y + (e.clientY - drag.current.py)) });
  };
  return (
    <div
      className="fixed z-[70] max-w-[min(100vw-16px,420px)] rounded-3xl bg-white/95 p-2 shadow-2xl ring-2 ring-indigo-200 dark:bg-slate-900/95 dark:ring-indigo-700"
      style={{ left: pos.x, top: pos.y }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={() => { drag.current = null; }}
      data-testid="live-video-dock"
    >
      <div className="mb-1 flex cursor-grab items-center justify-between gap-2 active:cursor-grabbing">
        <p className="text-xs font-black text-[#1b3a57] dark:text-white">{tr("Class video", "فيديو الصف")}</p>
        <button type="button" className="rounded-full bg-black/10 px-2 py-0.5 text-xs font-bold dark:bg-white/10" onClick={() => setMin((v) => !v)} data-testid="live-video-dock-toggle">{min ? tr("Show", "إظهار") : tr("Minimise", "تصغير")}</button>
      </div>
      {!min && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}

function playChatBeep() {
  try {
    const ctx = new AudioContext();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = 880;
    g.gain.value = 0.04;
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.12);
    o.onended = () => ctx.close().catch(() => undefined);
  } catch { /* */ }
}


function Btn({ onClick, label, icon, on, danger, disabled, testid }: { onClick: () => void; label: string; icon: string; on?: boolean; danger?: boolean; disabled?: boolean; testid?: string }) {
  return (
    <button type="button" data-testid={testid} disabled={disabled} onClick={onClick} className={`flex min-h-14 min-w-14 flex-col items-center justify-center rounded-2xl px-3 py-2 text-[11px] font-extrabold shadow-sm ring-1 ring-black/10 transition disabled:opacity-40 sm:min-w-16 sm:text-xs ${danger ? "bg-rose-500 text-white" : on ? "bg-emerald-400 text-[#10331c]" : "bg-white text-[#1b3a57] dark:bg-slate-800 dark:text-white"}`}>
      <span className="text-2xl sm:text-3xl" aria-hidden>{icon}</span>
      {label}
    </button>
  );
}

export function LiveLessonPage({ embedded = false, asAdmin: forceAdmin = false, guestLink = false }: { embedded?: boolean; asAdmin?: boolean; guestLink?: boolean } = {}) {
  const { tr, lang } = useTr();
  const lms = useLmsActor();
  const [adminSess, setAdminSess] = useState(false);
  useEffect(() => { setAdminSess(!!getServerSession()); }, []);
  const asAdmin = forceAdmin || (!lms.actor && adminSess);
  const [guest, setGuest] = useState<ReturnType<typeof liveGuest>>(null);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => { setGuest(liveGuest()); setHydrated(true); }, []);
  const actor = asAdmin ? ADMIN_ACTOR : (lms.actor || (guest?.token ? { id: guest.id, role: "student" as const, name: guest.name, cls: "", perms: [] as string[], guest: true } : null));
  const ready = lms.ready || adminSess || forceAdmin || !!guest?.token;
  const adminElsewhere = lms.adminElsewhere && !asAdmin && !guest?.token;
  const liveHref = (id?: string) => {
    if (embedded) return id ? `/admin?room=${encodeURIComponent(id)}#live` : "/admin#live";
    return id ? `/lms/live?room=${encodeURIComponent(id)}` : "/lms/live";
  };
  const [phase, setPhase] = useState<Phase>("lobby");
  const [rooms, setRooms] = useState<LiveRoomInfo[]>([]);
  const [canStart, setCanStart] = useState(false);
  const [livePerms, setLivePerms] = useState<LivePerms>({ run: false, schedule: false, schedStudent: false, schedClass: false, shareLink: false, camMic: false, screenShare: false, present: false });
  const [sfuOn, setSfuOn] = useState(true);
  const [options, setOptions] = useState<{ cls: string; section: string }[]>([]);
  const [groups, setGroups] = useState<{ id: string; name: string }[]>([]);
  const [title, setTitle] = useState("");
  const [pick, setPick] = useState("");
  const [groupId, setGroupId] = useState("");
  const [room, setRoom] = useState<LiveSnap | null>(null);
  const [chat, setChat] = useState<LiveChat[]>([]);
  const [draft, setDraft] = useState("");
  const [showChat, setShowChat] = useState(false);
  const [showPeople, setShowPeople] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [camOn, setCamOn] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [shareOn, setShareOn] = useState(false);
  const [hand, setHand] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [shareStream, setShareStream] = useState<MediaStream | null>(null);
  const [remotes, setRemotes] = useState<Record<string, MediaStream>>({});
  const [minutes, setMinutes] = useState(40);
  const [permHelp, setPermHelp] = useState("");
  const [chatUnread, setChatUnread] = useState(0);
  const [chatToast, setChatToast] = useState<LiveChat | null>(null);
  const [chatSound, setChatSound] = useState(true);
  const [hearOn, setHearOn] = useState(false);
  const [needHear, setNeedHear] = useState(false);
  const sfuRef = useRef<LiveSfu | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const localRef = useRef<MediaStream | null>(null);
  const shareRef = useRef<MediaStream | null>(null);
  const showChatRef = useRef(false);
  const chatSoundRef = useRef(true);
  const chatBox = useRef<HTMLDivElement>(null);
  const selfId = actor?.id || "";
  const isHost = !!(room && actor && (room.teacherId === actor.id || actor.role === "admin"));
  const me = room?.members.find((m) => m.id === selfId);

  const loadList = useCallback(async () => {
    const r = await lmsApi.liveList(asAdmin);
    setRooms(r.rooms);
    setCanStart(r.canStart);
    setSfuOn(r.sfu);
    if (r.perms) setLivePerms(r.perms);
    else if (asAdmin) setLivePerms({ run: true, schedule: true, schedStudent: true, schedClass: true, shareLink: true, camMic: true, screenShare: true, present: true });
    setOptions(r.options || []);
    setGroups(r.groups || []);
    if (!pick && r.options?.[0]) setPick(r.options[0].section ? `${r.options[0].cls}|${r.options[0].section}` : r.options[0].cls);
  }, [pick, asAdmin]);

  useEffect(() => {
    if (!ready || !actor || actor.guest) return;
    loadList().catch((e) => setErr(lmsErrorText(e, tr)));
  }, [ready, actor, loadList, tr]);

  useEffect(() => {
    if (chatBox.current) chatBox.current.scrollTop = chatBox.current.scrollHeight;
  }, [chat, showChat]);
  useEffect(() => { showChatRef.current = showChat; if (showChat) { setChatUnread(0); setChatToast(null); } }, [showChat]);
  useEffect(() => {
    if (!chatToast) return;
    const t = setTimeout(() => setChatToast(null), 5000);
    return () => clearTimeout(t);
  }, [chatToast]);
  useEffect(() => { chatSoundRef.current = chatSound; }, [chatSound]);

  const cleanupMedia = useCallback(() => {
    sfuRef.current?.close();
    sfuRef.current = null;
    localRef.current?.getTracks().forEach((t) => t.stop());
    shareRef.current?.getTracks().forEach((t) => t.stop());
    localRef.current = null;
    shareRef.current = null;
    setLocalStream(null);
    setShareStream(null);
    setRemotes({});
    setCamOn(false);
    setMicOn(false);
    setShareOn(false);
  }, []);

  const closeWs = () => {
    try { wsRef.current?.close(); } catch { /* */ }
    wsRef.current = null;
  };

  const applyRoom = useCallback((snap: LiveSnap) => {
    setRoom(snap);
    setChat(snap.chat || []);
    const self = snap.members.find((m) => m.id === selfId);
    if (self) setHand(self.hand);
    if (self) setPhase("in");
    else if (snap.waiting.some((w) => w.id === selfId)) setPhase("waiting");
    if (snap.status === "ended") setPhase("ended");
  }, [selfId]);

  const connectWs = useCallback((roomId: string) => {
    const tok = lmsSession()?.token || getServerSession()?.token || liveGuest()?.token;
    if (!tok) return;
    closeWs();
    const ws = new WebSocket(liveWsUrl(tok, roomId));
    wsRef.current = ws;
    ws.onmessage = (ev) => {
      let msg: { t?: string; room?: LiveSnap; msg?: LiveChat; userId?: string; camAllowed?: boolean; micAllowed?: boolean; present?: LiveSnap["present"]; stroke?: { c: string; w: number; d: number[]; by: string } } = {};
      try { msg = JSON.parse(String(ev.data)) as typeof msg; } catch { return; }
      if (msg.t === "room" && msg.room) applyRoom(msg.room);
      if (msg.t === "present") setRoom((r) => r ? { ...r, present: msg.present || null } : r);
      if (msg.t === "stroke" && msg.stroke) setRoom((r) => r?.present ? { ...r, present: { ...r.present, strokes: [...(r.present.strokes || []), msg.stroke!].slice(-200) } } : r);
      if (msg.t === "chat" && msg.msg) {
        setChat((c) => [...c, msg.msg!].slice(-80));
        if (msg.msg.from !== selfId && !showChatRef.current) {
          setChatUnread((n) => n + 1);
          setChatToast(msg.msg);
          if (chatSoundRef.current) playChatBeep();
        }
      }
      if (msg.t === "ended") { setPhase("ended"); cleanupMedia(); closeWs(); }
      if (msg.t === "denied" && msg.userId === selfId) { setPhase("lobby"); setErr(tr("The teacher didn't let you in this time.", "لم يسمح لك المعلم بالدخول هذه المرة.")); closeWs(); }
      if (msg.t === "perm" && msg.userId === selfId) {
        if (msg.camAllowed === false && localRef.current) {
          localRef.current.getVideoTracks().forEach((t) => t.stop());
          sfuRef.current?.unpublish("camera").catch(() => undefined);
          setCamOn(false);
        }
        if (msg.micAllowed === false && localRef.current) {
          localRef.current.getAudioTracks().forEach((t) => t.stop());
          sfuRef.current?.unpublish("mic").catch(() => undefined);
          setMicOn(false);
        }
      }
    };
    ws.onclose = () => {
      if (wsRef.current === ws && (phase === "in" || phase === "waiting")) {
        setTimeout(() => { if (wsRef.current === ws) connectWs(roomId); }, 1500);
      }
    };
  }, [applyRoom, cleanupMedia, phase, selfId, tr]);

  useEffect(() => () => { closeWs(); cleanupMedia(); }, [cleanupMedia]);

  const pubKey = (room?.pubs || []).map((p) => `${p.userId}:${p.sessionId}:${p.tracks.join(",")}`).join("|");
  useEffect(() => {
    if (phase !== "in" || !room?.id || !actor) return;
    if (!room.sfu) return;
    let cancelled = false;
    (async () => {
      try {
        const ice = (await lmsApi.liveIce(room.id, asAdmin)).iceServers;
        if (cancelled) return;
        sfuRef.current?.close();
        const sfu = new LiveSfu(room.id, actor.id, ice, (key, stream) => {
          setRemotes((prev) => {
            const next = { ...prev };
            if (!stream) delete next[key];
            else next[key] = stream;
            return next;
          });
        }, asAdmin);
        sfuRef.current = sfu;
        // Students receive the host's video/audio here — no camera or mic permission needed.
        await sfu.syncSubs(room.pubs || []);
        if (isHost) {
          try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
            setPermHelp("");
            localRef.current = stream;
            setLocalStream(stream);
            const cam = stream.getVideoTracks()[0];
            const mic = stream.getAudioTracks()[0];
            if (cam) { await sfu.publish("camera", cam); setCamOn(true); }
            if (mic) { await sfu.publish("mic", mic); setMicOn(true); }
          } catch (e) {
            if (isPermErr(e)) setPermHelp("cam");
          }
        }
      } catch (e) {
        if (!cancelled) setErr(lmsErrorText(e, tr));
      }
    })();
    return () => { cancelled = true; };
  }, [phase, room?.id, actor, isHost, tr, asAdmin]);

  useEffect(() => {
    if (phase === "in") sfuRef.current?.syncSubs(room?.pubs || []).catch(() => undefined);
  }, [phase, pubKey, room?.pubs]);
  useEffect(() => {
    const hasAudio = Object.values(remotes).some((s) => s.getAudioTracks().some((t) => t.readyState !== "ended"));
    if (phase === "in" && hasAudio && !hearOn) setNeedHear(true);
  }, [remotes, phase, hearOn]);

  useEffect(() => {
    if (typeof window === "undefined" || !actor) return;
    const q = new URLSearchParams(window.location.search).get("room") || "";
    if (q && phase === "lobby") enter(q).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actor]);

  async function enter(id: string) {
    setBusy(true); setErr("");
    try {
      const r = await lmsApi.liveJoin(id, asAdmin);
      if (r.room) applyRoom(r.room);
      if (r.status === "in") setPhase("in");
      else if (r.status === "waiting") setPhase("waiting");
      else if (r.status === "ended") setPhase("ended");
      else if (r.status === "full") setErr(tr("This class is full.", "هذا الصف ممتلئ."));
      connectWs(id);
      if (typeof window !== "undefined") history.replaceState(null, "", liveHref(id));
    } catch (e) {
      setErr(lmsErrorText(e, tr));
    } finally { setBusy(false); }
  }

  async function startNow() {
    setBusy(true); setErr("");
    try {
      const [cls, section] = pick.includes("|") ? pick.split("|") : [pick, ""];
      const r = await lmsApi.liveStart({ title: title.trim() || undefined, cls, section, groupId: groupId || undefined, minutes }, asAdmin);
      await enter(r.id);
    } catch (e) {
      setErr(lmsErrorText(e, tr));
    } finally { setBusy(false); }
  }

  async function toggleCam() {
    if (!sfuRef.current || !me) return;
    if (camOn) {
      localRef.current?.getVideoTracks().forEach((t) => t.stop());
      await sfuRef.current.unpublish("camera");
      setCamOn(false);
      const leftover = localRef.current?.getAudioTracks() || [];
      setLocalStream(leftover.length ? new MediaStream(leftover) : null);
      if (!leftover.length) localRef.current = null;
      return;
    }
    if (!isHost && !me.camAllowed) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      const track = stream.getVideoTracks()[0];
      if (!track) return;
      const mixed = new MediaStream([...(localRef.current?.getAudioTracks() || []), track]);
      localRef.current = mixed;
      setLocalStream(mixed);
      await sfuRef.current.publish("camera", track);
      setCamOn(true);
      setPermHelp("");
    } catch (e) {
      if (isPermErr(e)) setPermHelp("cam");
      else setErr(lmsErrorText(e, tr));
    }
  }

  async function toggleMic() {
    if (!sfuRef.current || !me) return;
    if (micOn) {
      localRef.current?.getAudioTracks().forEach((t) => t.stop());
      await sfuRef.current.unpublish("mic");
      setMicOn(false);
      return;
    }
    if (!isHost && !me.micAllowed) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const track = stream.getAudioTracks()[0];
      if (!track) return;
      const mixed = new MediaStream([...(localRef.current?.getVideoTracks() || []), track]);
      localRef.current = mixed;
      setLocalStream(mixed);
      await sfuRef.current.publish("mic", track);
      setMicOn(true);
      setPermHelp("");
    } catch (e) {
      if (isPermErr(e)) setPermHelp("mic");
      else setErr(lmsErrorText(e, tr));
    }
  }

  async function toggleShare() {
    if (!sfuRef.current || (!isHost && !me?.shareAllowed)) return;
    if (shareOn) {
      shareRef.current?.getTracks().forEach((t) => t.stop());
      shareRef.current = null;
      setShareStream(null);
      await sfuRef.current.unpublish("screen");
      setShareOn(false);
      return;
    }
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    const track = stream.getVideoTracks()[0];
    if (!track) return;
    track.onended = () => { toggleShare().catch(() => undefined); };
    shareRef.current = stream;
    setShareStream(stream);
    await sfuRef.current.publish("screen", track);
    setShareOn(true);
  }

  async function toggleHand() {
    const next = !hand;
    setHand(next);
    await lmsApi.liveRaise(room!.id, next, asAdmin).catch(() => setHand(!next));
  }

  async function sendChat() {
    const text = draft.trim();
    if (!text || !room) return;
    setDraft("");
    await lmsApi.liveChat(room.id, text, asAdmin).catch((e) => setErr(lmsErrorText(e, tr)));
  }

  async function leave() {
    if (room) await lmsApi.liveLeave(room.id, asAdmin).catch(() => undefined);
    cleanupMedia();
    closeWs();
    setPhase("lobby");
    setRoom(null);
    history.replaceState(null, "", liveHref());
    loadList().catch(() => undefined);
  }

  async function endClass() {
    if (!room) return;
    await lmsApi.liveEnd(room.id, asAdmin).catch((e) => setErr(lmsErrorText(e, tr)));
    cleanupMedia();
    closeWs();
    setPhase("ended");
  }
  async function addLessonMin(n: number) {
    if (!room) return;
    try {
      const r = await lmsApi.liveDuration(room.id, { addMin: n }, asAdmin);
      if (r.endsAt) setRoom((prev) => prev ? { ...prev, endsAt: r.endsAt } : prev);
    } catch (e) { setErr(lmsErrorText(e, tr)); }
  }
  async function setLessonMin(n: number) {
    if (!room) return;
    try {
      const r = await lmsApi.liveDuration(room.id, { endsAt: Date.now() + n * 60_000 }, asAdmin);
      if (r.endsAt) setRoom((prev) => prev ? { ...prev, endsAt: r.endsAt } : prev);
    } catch (e) { setErr(lmsErrorText(e, tr)); }
  }
  function unlockAudio() {
    setHearOn(true);
    setNeedHear(false);
  }

  const screenKey = useMemo(() => {
    if (!room) return "";
    const hostPub = room.pubs.find((p) => p.tracks.includes("screen"));
    return hostPub ? `${hostPub.userId}:screen` : "";
  }, [room]);
  const screenRemote = screenKey ? remotes[screenKey] : undefined;
  const mainScreen = shareStream || screenRemote;

  if (guestLink) {
    const tok = hydrated && typeof window !== "undefined" ? (new URLSearchParams(window.location.search).get("t") || "") : "";
    if (!hydrated) return <p className="p-8 text-center font-bold opacity-70">…</p>;
    return <GuestJoin token={tok} />;
  }

  if (hydrated && ready && !actor) return <NeedLogin adminElsewhere={adminElsewhere} />;

  const body = (
      <div className={embedded ? "flex w-full flex-1 flex-col gap-4" : "mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-3 py-4 sm:px-6"} data-testid="live-lesson" dir={lang === "ar" ? "rtl" : "ltr"}>
        {err && <p className="rounded-2xl bg-rose-100 px-4 py-2 text-sm font-bold text-rose-800 dark:bg-rose-900/60 dark:text-rose-100" role="alert">{err}</p>}
        {permHelp && (
          <div className="rounded-2xl bg-amber-100 px-4 py-3 text-sm font-bold text-amber-950 dark:bg-amber-900/50 dark:text-amber-50" role="status" data-testid="live-perm-help">
            <p>🎥 {tr("Allow camera/mic in your browser", "اسمح للكاميرا والميكروفون في المتصفح")}</p>
            <p className="mt-1 font-semibold opacity-80">{tr("Look for the camera icon in the address bar, choose Allow, then tap Camera or Mic again. Students can already see and hear the teacher without turning their own camera on.", "ابحث عن أيقونة الكاميرا في شريط العنوان واختر سماح، ثم اضغط الكاميرا أو الميكروفون مرة أخرى. يمكن للطلاب رؤية المعلم وسماعه دون تشغيل كاميراتهم.")}</p>
          </div>
        )}

        {phase === "lobby" && (
          <div className="space-y-5">
            <header className="rounded-[2rem] bg-gradient-to-br from-fuchsia-200 via-orange-100 to-amber-200 p-5 shadow-sm dark:from-fuchsia-900/70 dark:via-slate-800 dark:to-amber-900/40">
              <p className="text-4xl" aria-hidden>🎥</p>
              <h1 className="mt-1 text-3xl font-black text-[#1b3a57] dark:text-white">{tr("Live Lesson", "الحصة المباشرة")}</h1>
              <p className="mt-1 max-w-xl text-sm font-semibold opacity-80">{tr("Join your class on camera, or start a live room right now.", "انضم إلى صفك بالكاميرا، أو ابدأ حصة مباشرة الآن.")}</p>
              {asAdmin && <p className="mt-1 max-w-xl text-sm font-semibold opacity-80">{tr("As admin you can start a room for any class and see every live lesson.", "بصفتك مسؤولاً يمكنك بدء حصة لأي صف ورؤية كل الحصص المباشرة.")}</p>}
              {!sfuOn && <p className="mt-3 rounded-xl bg-white/80 px-3 py-2 text-sm font-bold text-amber-800 dark:bg-slate-900/80 dark:text-amber-200">{tr("Video isn't fully set up yet. Chat, hand-raise and the waiting room still work.", "الفيديو غير مُعد بالكامل بعد. الدردشة ورفع اليد وغرفة الانتظار تعمل.")}</p>}
            </header>
            {canStart && (
              <section className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-black/5 dark:bg-slate-800" data-testid="live-start">
                <h2 className="mb-3 text-lg font-black">{tr("Start now", "ابدأ الآن")}</h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-sm font-bold">{tr("Lesson title", "عنوان الحصة")}
                    <input className="mt-1 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 font-semibold dark:bg-slate-900" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={tr("Live Lesson", "الحصة المباشرة")} />
                  </label>
                  <label className="text-sm font-bold">{tr("Class", "الصف")}
                    <select className="mt-1 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 font-semibold dark:bg-slate-900" value={pick} onChange={(e) => setPick(e.target.value)}>
                      {options.map((o) => {
                        const v = o.section ? `${o.cls}|${o.section}` : o.cls;
                        return <option key={v + o.section} value={v}>{o.section ? `${o.cls} · ${o.section}` : o.cls}</option>;
                      })}
                    </select>
                  </label>
                  {!!groups.length && (
                    <label className="text-sm font-bold sm:col-span-2">{tr("Or a group (optional)", "أو مجموعة (اختياري)")}
                      <select className="mt-1 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 font-semibold dark:bg-slate-900" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
                        <option value="">{tr("Whole class", "الصف كاملًا")}</option>
                        {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                      </select>
                    </label>
                  )}
                </div>
                <label className="mt-3 block text-sm font-bold">{tr("Duration", "المدة")}
                  <select className="mt-1 w-full max-w-xs rounded-2xl border border-black/10 bg-white px-3 py-2 font-semibold dark:bg-slate-900" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} data-testid="live-start-mins">
                    {[20, 30, 40, 45, 60, 90].map((n) => <option key={n} value={n}>{n} {tr("minutes", "دقيقة")}</option>)}
                  </select>
                </label>
                <button type="button" className={`${primaryBtn} mt-4`} disabled={busy || !pick} onClick={startNow} data-testid="live-start-btn">🚀 {tr("Start live lesson", "ابدأ الحصة المباشرة")}</button>
              </section>
            )}
            {!canStart && actor?.role === "teacher" && (
              <p className="rounded-3xl bg-amber-100 px-4 py-3 font-bold text-amber-900 dark:bg-amber-900/40 dark:text-amber-100" data-testid="live-no-perm">{tr("Your admin hasn't switched on “Run live lessons” for you yet.", "لم يفعّل المسؤول صلاحية «تشغيل الدروس المباشرة» لك بعد.")}</p>
            )}
            <LiveSchedulePanel asAdmin={asAdmin} perms={asAdmin ? { run: true, schedule: true, schedStudent: true, schedClass: true, shareLink: true, camMic: true, screenShare: true, present: true } : livePerms} onStart={(id) => enter(id)} busy={busy} />
            <section>
              <h2 className="mb-3 text-lg font-black">{tr("Live now", "مباشر الآن")}</h2>
              {!rooms.length ? <p className="rounded-3xl bg-black/5 px-4 py-6 text-center font-semibold opacity-70 dark:bg-white/10">{tr("No live lessons for your class right now.", "لا توجد حصص مباشرة لصفك الآن.")}</p> : (
                <ul className="grid gap-3 sm:grid-cols-2">
                  {rooms.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-3 rounded-3xl bg-gradient-to-br from-lime-100 to-emerald-200 p-4 dark:from-emerald-900/50 dark:to-slate-800">
                      <div>
                        <p className="text-lg font-black">{r.title}</p>
                        <p className="text-sm font-semibold opacity-80">{[r.cls, r.section].filter(Boolean).join(" · ")}</p>
                      </div>
                      <button type="button" className={primaryBtn} disabled={busy} onClick={() => enter(r.id)} data-testid="live-join-btn">{r.mine ? tr("Rejoin", "إعادة الدخول") : tr("Join", "انضم")}</button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}

        {phase === "waiting" && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 rounded-[2rem] bg-gradient-to-br from-sky-100 to-violet-200 p-8 text-center dark:from-slate-800 dark:to-indigo-950" data-testid="live-waiting">
            <p className="animate-bounce text-6xl" aria-hidden>🚪</p>
            <h2 className="text-2xl font-black">{tr("Waiting for your teacher…", "بانتظار معلمك…")}</h2>
            <p className="max-w-md font-semibold opacity-80">{tr("You're in the waiting room. You'll jump in as soon as your teacher lets you in.", "أنت في غرفة الانتظار. ستدخل بمجرد أن يسمح لك المعلم.")}</p>
            <button type="button" className="rounded-full bg-white px-5 py-2 font-bold shadow dark:bg-slate-700" onClick={leave}>{tr("Leave", "خروج")}</button>
          </div>
        )}

        {phase === "ended" && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 rounded-[2rem] bg-gradient-to-br from-amber-100 to-rose-100 p-8 text-center dark:from-slate-800 dark:to-rose-950" data-testid="live-ended">
            <p className="text-6xl" aria-hidden>👋</p>
            <h2 className="text-2xl font-black">{tr("Class has ended", "انتهت الحصة")}</h2>
            <button type="button" className={primaryBtn} onClick={() => { setPhase("lobby"); setRoom(null); history.replaceState(null, "", liveHref()); loadList().catch(() => undefined); }}>{tr("Back to Live Lesson", "العودة إلى الحصة المباشرة")}</button>
          </div>
        )}

        {phase === "in" && room && (
          <div className="flex flex-1 flex-col gap-3" data-testid="live-room">
            <header className="flex flex-wrap items-center justify-between gap-2 rounded-3xl bg-gradient-to-r from-indigo-500 to-fuchsia-500 px-4 py-3 text-white">
              <div>
                <h1 className="text-xl font-black sm:text-2xl">{room.title}</h1>
                <p className="text-sm font-semibold opacity-90">{[room.cls, room.section].filter(Boolean).join(" · ")} · {room.members.filter((m) => m.present).length} {tr("here", "هنا")}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <LiveCountdown endsAt={room.endsAt || room.created + 40 * 60_000} isHost={isHost} onAdd={addLessonMin} onSet={setLessonMin} />
                <button type="button" className="rounded-full bg-white/20 px-3 py-1 text-sm font-bold" onClick={() => setShowPeople(true)} data-testid="live-people">👥 {tr("People", "الحاضرون")}{room.waiting.length ? ` · ${room.waiting.length}` : ""}</button>
                <button type="button" className="relative rounded-full bg-white/20 px-3 py-1 text-sm font-bold" onClick={() => setShowChat(true)} data-testid="live-chat-open">
                  💬 {tr("Chat", "الدردشة")}
                  {chatUnread > 0 && <span className="absolute -right-1 -top-1 inline-flex min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-black" data-testid="live-chat-unread">{chatUnread}</span>}
                </button>
              </div>
            </header>

            {isHost && !!room.waiting.length && (
              <div className="rounded-3xl bg-amber-100 p-3 dark:bg-amber-900/40" data-testid="live-waiting-host">
                <div className="mb-2 flex items-center justify-between">
                  <p className="font-black">{tr("Waiting room", "غرفة الانتظار")} ({room.waiting.length})</p>
                  <button type="button" className="rounded-full bg-emerald-500 px-3 py-1 text-sm font-bold text-white" onClick={() => lmsApi.liveAdmit(room.id, "all", asAdmin)}>{tr("Admit all", "قبول الجميع")}</button>
                </div>
                <ul className="flex flex-wrap gap-2">
                  {room.waiting.map((w) => (
                    <li key={w.id} className="flex items-center gap-2 rounded-full bg-white px-3 py-1 text-sm font-bold dark:bg-slate-800">
                      {w.name}
                      <button type="button" className="text-emerald-700" onClick={() => lmsApi.liveAdmit(room.id, w.id, asAdmin)}>{tr("Admit", "قبول")}</button>
                      <button type="button" className="text-rose-600" onClick={() => lmsApi.liveDeny(room.id, w.id, asAdmin)}>{tr("No", "لا")}</button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <LivePresent roomId={room.id} present={room.present} isHost={isHost} canPresent={asAdmin || livePerms.present} asAdmin={asAdmin} selfId={selfId} members={room.members} onPresent={(present) => setRoom((r) => r ? { ...r, present } : r)} />

            {(() => {
              const presenting = !!room.present?.packId;
              const tiles = (
                <>
                  {mainScreen && <Tile label={tr("Shared screen", "الشاشة المشاركة")} stream={mainScreen} big={!presenting} compact={presenting} />}
                  {room.members.filter((m) => m.role === "teacher").map((m) => (
                    <Tile key={m.id} label={m.id === selfId ? tr("You (teacher)", "أنت (المعلم)") : m.name} stream={m.id === selfId ? localStream : remotes[`${m.id}:camera`]} hand={m.hand} big={!presenting && !mainScreen} compact={presenting} />
                  ))}
                  {room.members.filter((m) => m.role !== "teacher").map((m) => (
                    <Tile key={m.id} label={m.id === selfId ? tr("You", "أنت") : m.name} stream={m.id === selfId ? localStream : remotes[`${m.id}:camera`]} hand={m.hand} off={!remotes[`${m.id}:camera`] && m.id !== selfId} compact={presenting} />
                  ))}
                </>
              );
              return presenting ? <VideoDock>{tiles}</VideoDock> : (
                <div className={`grid flex-1 gap-3 ${mainScreen ? "lg:grid-cols-3" : "sm:grid-cols-2 lg:grid-cols-3"}`}>{tiles}</div>
              );
            })()}

            <ClassAudio remotes={remotes} unlocked={hearOn} onBlocked={() => setNeedHear(true)} />
            {needHear && !hearOn && (
              <button type="button" className="mx-auto block rounded-full bg-indigo-500 px-4 py-2 text-sm font-black text-white shadow-lg" onClick={unlockAudio} data-testid="live-hear">
                🔊 {tr("Tap to hear class", "اضغط لسماع الصف")}
              </button>
            )}

            <div className="sticky bottom-2 z-20 flex flex-wrap justify-center gap-2 rounded-3xl bg-white/90 p-2 shadow-lg ring-1 ring-black/10 backdrop-blur dark:bg-slate-900/90">
              <Btn testid="live-cam" icon={camOn ? "📷" : "🚫"} label={tr("Camera", "الكاميرا")} on={camOn} disabled={!isHost && !me?.camAllowed && !camOn} onClick={() => toggleCam().catch((e) => setErr(lmsErrorText(e, tr)))} />
              <Btn testid="live-mic" icon={micOn ? "🎤" : "🔇"} label={tr("Mic", "الميكروفون")} on={micOn} disabled={!isHost && !me?.micAllowed && !micOn} onClick={() => toggleMic().catch((e) => setErr(lmsErrorText(e, tr)))} />
              {(isHost || me?.shareAllowed) && <Btn testid="live-share" icon="🖥️" label={tr("Share", "مشاركة")} on={shareOn} onClick={() => toggleShare().catch((e) => setErr(lmsErrorText(e, tr)))} />}
              <Btn testid="live-hand" icon="✋" label={tr("Hand", "يد")} on={hand} onClick={() => toggleHand().catch(() => undefined)} />
              <span className="relative">
                <Btn testid="live-chat-btn" icon="💬" label={tr("Chat", "دردشة")} on={showChat} onClick={() => setShowChat(true)} />
                {chatUnread > 0 && <span className="absolute -right-1 -top-1 inline-flex min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-black text-white" data-testid="live-chat-unread-btn">{chatUnread}</span>}
              </span>
              <Btn testid="live-sound" icon={chatSound ? "🔔" : "🔕"} label={tr("Chat sound", "صوت الدردشة")} on={chatSound} onClick={() => setChatSound((v) => !v)} />
              <Btn testid="live-leave" icon="🚪" label={tr("Leave", "خروج")} danger onClick={leave} />
              {isHost && <Btn testid="live-end" icon="🛑" label={tr("End class", "إنهاء الحصة")} danger onClick={endClass} />}
            </div>
            {!isHost && me && !me.camAllowed && !me.micAllowed && (
              <p className="text-center text-xs font-semibold opacity-70">{tr("Your camera and mic stay off until your teacher allows them. You can still see and hear the teacher.", "تبقى كاميرتك وميكروفونك مغلقين حتى يسمح بهما معلمك. ما زال بإمكانك رؤية المعلم وسماعه.")}</p>
            )}
            {chatToast && !showChat && (
              <button type="button" className="fixed bottom-24 left-1/2 z-[75] w-[min(90vw,24rem)] -translate-x-1/2 rounded-2xl bg-[#1b3a57] px-4 py-3 text-left text-sm font-bold text-white shadow-xl dark:bg-indigo-800" onClick={() => setShowChat(true)} data-testid="live-chat-toast">
                <span className="opacity-80">{chatToast.name}</span>
                <span className="mt-0.5 block truncate">{chatToast.text}</span>
              </button>
            )}
          </div>
        )}

        {showPeople && room && (
          <div className="fixed inset-0 z-[80] flex justify-end bg-black/40" onClick={() => setShowPeople(false)} role="presentation">
            <aside className="flex h-full w-full max-w-sm flex-col bg-white p-4 shadow-xl dark:bg-slate-900" onClick={(e) => e.stopPropagation()} data-testid="live-people-panel">
              <div className="mb-3 flex items-center justify-between"><h3 className="text-lg font-black">{tr("People", "الحاضرون")}</h3><button type="button" onClick={() => setShowPeople(false)}>✕</button></div>
              <ul className="flex-1 space-y-2 overflow-auto">
                {room.members.map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-2 rounded-2xl bg-black/5 px-3 py-2 dark:bg-white/10">
                    <span className="font-bold">{m.name}{m.role === "teacher" ? ` · ${tr("Teacher", "المعلم")}` : ""} {m.hand ? "✋" : ""} {!m.present ? tr("(away)", "(غادر)") : ""}</span>
                    {isHost && m.role !== "teacher" && (
                      <span className="flex gap-1 text-xs">
                        {(asAdmin || livePerms.camMic) && <button type="button" className={`rounded-full px-2 py-1 font-bold ${m.camAllowed ? "bg-emerald-200" : "bg-white dark:bg-slate-800"}`} onClick={() => lmsApi.livePerm(room.id, m.id, !m.camAllowed, undefined, asAdmin)}>{tr("Cam", "كاميرا")}</button>}
                        {(asAdmin || livePerms.camMic) && <button type="button" className={`rounded-full px-2 py-1 font-bold ${m.micAllowed ? "bg-emerald-200" : "bg-white dark:bg-slate-800"}`} onClick={() => lmsApi.livePerm(room.id, m.id, undefined, !m.micAllowed, asAdmin)}>{tr("Mic", "ميكروفون")}</button>}
                        {(asAdmin || livePerms.screenShare) && <button type="button" className={`rounded-full px-2 py-1 font-bold ${m.shareAllowed ? "bg-emerald-200" : "bg-white dark:bg-slate-800"}`} onClick={() => lmsApi.livePerm(room.id, m.id, undefined, undefined, asAdmin, !m.shareAllowed)}>{tr("Share", "مشاركة")}</button>}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </aside>
          </div>
        )}

        {showChat && room && (
          <div className="fixed inset-0 z-[80] flex justify-end bg-black/40" onClick={() => setShowChat(false)} role="presentation">
            <aside className="flex h-full w-full max-w-sm flex-col bg-white p-4 shadow-xl dark:bg-slate-900" onClick={(e) => e.stopPropagation()} data-testid="live-chat-panel">
              <div className="mb-3 flex items-center justify-between"><h3 className="text-lg font-black">{tr("Chat", "الدردشة")}</h3><button type="button" onClick={() => setShowChat(false)}>✕</button></div>
              <div ref={chatBox} className="flex-1 space-y-2 overflow-auto rounded-2xl bg-black/5 p-3 dark:bg-white/10">
                {chat.map((c) => (
                  <p key={c.id} className="text-sm"><span className="font-black">{c.name}: </span>{c.text}</p>
                ))}
              </div>
              <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); sendChat(); }}>
                <input className="flex-1 rounded-2xl border border-black/10 px-3 py-2 dark:bg-slate-800" value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={400} placeholder={tr("Say hello…", "قل مرحبا…")} />
                <button type="submit" className={primaryBtn}>{tr("Send", "إرسال")}</button>
              </form>
            </aside>
          </div>
        )}
      </div>
  );
  if (embedded) return body;
  return (
    <AssessmentShell title={tr("Live Lesson", "الحصة المباشرة")} exitHref="/lms" wide toolbar={<LmsStaffToolbar />}>
      {body}
    </AssessmentShell>
  );
}
