"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AssessmentShell, primaryBtn } from "@/components/assessment/AssessmentShell";
import { LmsStaffToolbar } from "@/components/lms/LmsEntry";
import { NeedLogin } from "@/components/lms/LmsDashboard";
import { ADMIN_ACTOR, useLmsActor, useTr } from "@/components/lms/useLms";
import { getServerSession } from "@/lib/adminServer";
import { LiveSfu } from "@/lib/liveSfu";
import { requestElFullscreen } from "@/components/FocusMode";
import { registerSlideFocus, setPageFocus } from "@/components/FullscreenToggle";
import { LiveSchedulePanel, GuestJoin } from "@/components/lms/LiveSchedule";
import { StartMeetingPanel } from "@/components/lms/StartMeeting";
import { LiveHistory } from "@/components/lms/LiveHistory";
import { LivePresent } from "@/components/lms/LivePresent";
import { LiveViewPicker, RoomStage, useActiveSpeaker, presentLayout, boardFillsStage, VIEW_CARDS } from "@/components/lms/LiveViews";
import { canShowHostAllow, lmsApi, lmsErrorText, lmsSession, liveGuest, livePresentingContent, liveWsUrl, memberFloor, normalizePtrKind, type LiveAsk, type LiveFloor, type LiveMember, type LivePtr, type LivePub, type LiveChat, type LivePerms, type LiveRoomInfo, type LiveSnap, type LiveView, type LiveViewMode, type PtrKind } from "@/lib/lms";
import { classroomHref, isClassroomPath, openClassroomTab } from "@/lib/classroom";
import { ClassroomBrand } from "@/components/lms/ClassroomBrand";
import { ClassroomConnecting, type ConnectStep } from "@/components/lms/ClassroomConnecting";

type Phase = "lobby" | "waiting" | "in" | "ended";

function isPermErr(e: unknown) {
  const n = e && typeof e === "object" && "name" in e ? String((e as { name: string }).name) : "";
  return n === "NotAllowedError" || n === "PermissionDeniedError" || n === "NotFoundError" || n === "NotReadableError" || n === "SecurityError";
}


function CamIcon({ on }: { on: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="lb-ico-svg" aria-hidden>
      <path fill="currentColor" d="M4 7.5A2.5 2.5 0 0 1 6.5 5h7A2.5 2.5 0 0 1 16 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-7A2.5 2.5 0 0 1 4 16.5v-9Z" />
      <path fill="currentColor" d="M17 10.2 21 8v8l-4-2.2v-3.6Z" />
      {!on && <path fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" d="M3 4 21 20" />}
    </svg>
  );
}
function MicIcon({ on }: { on: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="lb-ico-svg" aria-hidden>
      <rect x="9" y="3.5" width="6" height="11" rx="3" fill="currentColor" />
      <path fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" d="M6.5 12.5a5.5 5.5 0 0 0 11 0M12 18v2.5" />
      {!on && <path fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" d="M4 5 20 19" />}
    </svg>
  );
}

function LeaveIcon() {
  return (
    <svg viewBox="0 0 24 24" className="lb-head-svg" aria-hidden>
      <rect x="13" y="4" width="7" height="16" rx="1.4" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" d="M13 12H4m0 0 3.4-3.4M4 12l3.4 3.4" />
    </svg>
  );
}
function PowerIcon() {
  return (
    <svg viewBox="0 0 24 24" className="lb-head-svg" aria-hidden>
      <path fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" d="M12 3.5v8" />
      <path fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" d="M7.05 6.2a7.2 7.2 0 1 0 9.9 0" />
    </svg>
  );
}

function SideTile({ label, stream, hand, off, online = true, allow, selfMedia, hero }: {
  label: string; stream?: MediaStream | null; hand?: boolean; off?: boolean; online?: boolean; allow?: ReactNode;
  selfMedia?: { camOn: boolean; micOn: boolean; onCam: () => void; onMic: () => void; camDisabled?: boolean; micDisabled?: boolean };
  hero?: boolean;
}) {
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
    <div className={`lb-side-tile ${hero ? "is-hero" : ""} ${off ? "is-off" : ""} ${hand ? "has-hand" : ""}`} data-testid={hero ? "live-teacher-pip" : "live-side-attendee"}>
      <div className="lb-side-vid">
        <video ref={ref} autoPlay playsInline muted className={hasVideo ? "" : "hidden"} />
        {!hasVideo && <span className="lb-side-avatar" aria-hidden>{hero ? "👨‍🏫" : off ? "😴" : "🙂"}</span>}
        {allow}
      </div>
      <div className="lb-side-meta">
        <span className={`lb-live-dot ${online ? "" : "is-off"}`} title={online ? "Online" : "Offline"} aria-label={online ? "Online" : "Offline"} />
        <span className="truncate" dir="auto">{label}</span>
        {hand ? <span aria-label="hand raised">✋</span> : null}
        {selfMedia && (
          <span className="lb-self-media">
            <button type="button" className={`lb-ico-btn ${selfMedia.micOn ? "is-on" : "is-off"}`} aria-pressed={selfMedia.micOn} disabled={selfMedia.micDisabled} title="Mic" aria-label="Mic" onClick={selfMedia.onMic} data-testid="live-self-mic">
              <MicIcon on={selfMedia.micOn} />
            </button>
            <button type="button" className={`lb-ico-btn ${selfMedia.camOn ? "is-on" : "is-off"}`} aria-pressed={selfMedia.camOn} disabled={selfMedia.camDisabled} title="Camera" aria-label="Camera" onClick={selfMedia.onCam} data-testid="live-self-cam">
              <CamIcon on={selfMedia.camOn} />
            </button>
          </span>
        )}
      </div>
    </div>
  );
}



function liveWho(m: LiveMember, selfId: string, teacherId: string, tr: (en: string, ar: string) => string) {
  const floor = memberFloor(m, teacherId) === "presenter" ? tr("Presenter", "مقدّم") : tr("Attendee", "مشارك");
  const base = m.id === selfId
    ? (m.id === teacherId || m.role === "teacher" ? tr("You (teacher)", "أنت (المعلم)") : tr("You", "أنت"))
    : m.name;
  return `${base} · ${floor}`;
}

function AllowBtns({ roomId, member, teacherId, asAdmin, canCam, canShare, canFloor, onErr, labels }: {
  roomId: string; member: LiveMember; teacherId: string; asAdmin: boolean; canCam: boolean; canShare: boolean; canFloor?: boolean;
  onErr: (e: unknown, en: string, ar: string) => void;
  labels: { cam: string; mic: string; share: string; makePresenter: string; makeAttendee: string };
}) {
  if (member.id === teacherId) return null;
  const floor = memberFloor(member, teacherId);
  const isPresenter = floor === "presenter";
  if (!canCam && !canShare && !canFloor) return null;
  const nextFloor: LiveFloor = isPresenter ? "attendee" : "presenter";
  return (
    <span className="lb-allow" data-testid="live-host-allow">
      {canCam && (
        <button type="button" className={`lb-ico-btn ${member.camAllowed ? "is-on" : "is-off"}`} aria-pressed={!!member.camAllowed} title={labels.cam} aria-label={labels.cam} onClick={() => lmsApi.livePerm(roomId, member.id, !member.camAllowed, undefined, asAdmin).catch((e) => onErr(e, "Allow camera", "السماح بالكاميرا"))} data-testid="live-allow-cam">
          <CamIcon on={!!member.camAllowed} />
        </button>
      )}
      {canCam && (
        <button type="button" className={`lb-ico-btn ${member.micAllowed ? "is-on" : "is-off"}`} aria-pressed={!!member.micAllowed} title={labels.mic} aria-label={labels.mic} onClick={() => lmsApi.livePerm(roomId, member.id, undefined, !member.micAllowed, asAdmin).catch((e) => onErr(e, "Allow mic", "السماح بالميكروفون"))} data-testid="live-allow-mic">
          <MicIcon on={!!member.micAllowed} />
        </button>
      )}
      {canShare && (
        <button type="button" className={`lb-ico-btn ${member.shareAllowed ? "is-on" : "is-off"}`} aria-pressed={!!member.shareAllowed} title={labels.share} aria-label={labels.share} onClick={() => lmsApi.livePerm(roomId, member.id, undefined, undefined, asAdmin, !member.shareAllowed).catch((e) => onErr(e, "Allow share", "السماح بالمشاركة"))} data-testid="live-allow-share">🖥️</button>
      )}
      {canFloor && (
        <button type="button" className={`lb-role-btn ${isPresenter ? "is-on" : ""}`} aria-pressed={isPresenter} onClick={() => lmsApi.liveFloor(roomId, member.id, nextFloor, asAdmin).catch((e) => onErr(e, "Change role", "تغيير الدور"))} data-testid="live-floor-toggle">
          {isPresenter ? labels.makeAttendee : labels.makePresenter}
        </button>
      )}
    </span>
  );
}

function Tile({ label, stream, hand, big, off, compact, size, featured, allow, online = true }: { label: string; stream?: MediaStream | null; hand?: boolean; big?: boolean; off?: boolean; compact?: boolean; size?: "hero" | "main" | "card" | "thumb"; featured?: boolean; allow?: ReactNode; online?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.srcObject = stream || null;
    el.muted = true;
    el.play().catch(() => undefined);
  }, [stream]);
  const hasVideo = !!stream?.getVideoTracks().some((t) => t.readyState !== "ended");
  const sz = size || (compact ? "thumb" : big ? "main" : "card");
  const box = sz === "hero" ? "min-h-[240px] flex-1 sm:min-h-[340px]" : sz === "main" ? "min-h-[200px] flex-1 sm:min-h-[280px]" : sz === "thumb" ? "min-h-[72px] w-[112px] shrink-0 sm:min-h-[96px] sm:w-[148px]" : "min-h-[140px] sm:min-h-[180px]";
  return (
    <div className={`relative overflow-hidden rounded-3xl bg-gradient-to-br from-sky-200 to-indigo-300 shadow-md transition-all duration-300 dark:from-slate-700 dark:to-indigo-900 ${featured ? "ring-4 ring-[#f5c542]" : "ring-2 ring-white/60 dark:ring-white/10"} ${box}`}>
      <video ref={ref} autoPlay playsInline muted className={`absolute inset-0 h-full w-full ${sz === "main" || sz === "hero" ? "object-contain bg-[#0f1f30]" : "object-cover"} ${hasVideo ? "" : "hidden"}`} />
      {!hasVideo && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-[#1b3a57] dark:text-white">
          <span className={`${compact ? "text-3xl" : "text-5xl sm:text-6xl"}`} aria-hidden>{off ? "😴" : "🧑‍🎓"}</span>
          <span className="px-1 text-center text-xs font-bold opacity-80 sm:text-sm">{off ? "" : label}</span>
        </div>
      )}
      {allow}
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/70 to-transparent px-2 py-1 text-xs font-extrabold text-white sm:px-3 sm:py-2 sm:text-sm">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className={`lb-online ${online ? "" : "is-off"}`} title={online ? "Online" : "Offline"} aria-label={online ? "Online" : "Offline"} />
          <span className="truncate">{label}</span>
        </span>
        {hand ? <span className="animate-bounce text-xl sm:text-2xl" aria-label="hand raised">✋</span> : null}
      </div>
    </div>
  );
}

const STU_COLORS = ["#c9a227", "#5b7cbf", "#d08080", "#7a6bb0", "#3d8a7a", "#4aa3c2"];

function PipTile({ label, stream, min, onToggle, online = true }: { label: string; stream?: MediaStream | null; min: boolean; onToggle: () => void; online?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ sx: number; sy: number; x: number; y: number } | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.srcObject = stream || null;
    el.muted = true;
    el.play().catch(() => undefined);
  }, [stream]);
  const hasVideo = !!stream?.getVideoTracks().some((t) => t.readyState !== "ended");
  const onDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("[data-testid=live-pip-min]")) return;
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    drag.current = { sx: e.clientX, sy: e.clientY, x: pos?.x || 0, y: pos?.y || 0 };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current; if (!d) return;
    setPos({ x: d.x + (e.clientX - d.sx), y: d.y + (e.clientY - d.sy) });
  };
  const onUp = () => { drag.current = null; };
  return (
    <div
      ref={box}
      className={`lb-pip ${min ? "is-min" : ""} ${pos ? "is-drag" : ""}`}
      data-testid="live-teacher-pip"
      style={pos ? { top: 16 + pos.y, insetInlineEnd: 16 - pos.x, left: "auto" } : undefined}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <button type="button" className="lb-pip-min" onClick={onToggle} aria-label={min ? "Show teacher video" : "Minimise teacher video"} data-testid="live-pip-min">{min ? "+" : "–"}</button>
      <div className="lb-pip-vid">
        <video ref={ref} autoPlay playsInline muted className={hasVideo && !min ? "" : "hidden"} />
        {(!hasVideo || min) && <span className="lb-pip-avatar" aria-hidden>👨‍🏫</span>}
      </div>
      <div className="lb-pip-meta">
        <span className="truncate">{label}</span>
        <span className={`lb-live-dot ${online ? "" : "is-off"}`} title={online ? "Online" : "Offline"} aria-label={online ? "Online" : "Offline"} />
      </div>
    </div>
  );
}

function StuTile({ label, stream, hand, off, color, allow, online = true }: { label: string; stream?: MediaStream | null; hand?: boolean; off?: boolean; color: string; allow?: ReactNode; online?: boolean }) {
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
    <div className={`lb-stu ${off ? "is-off" : ""} ${hand ? "has-hand" : ""}`} style={{ ["--c" as string]: color }} title={label}>
      <video ref={ref} autoPlay playsInline muted className={hasVideo ? "" : "hidden"} />
      {!hasVideo && <div className="lb-stu-face" aria-hidden>{off ? "😴" : "🙂"}</div>}
      {allow}
      <div className="lb-stu-meta">
        <span className={`lb-online ${online ? "" : "is-off"}`} title={online ? "Online" : "Offline"} aria-label={online ? "Online" : "Offline"} />
        <span className="truncate">{label}</span>
        {hand ? <span aria-label="hand raised">✋</span> : null}
      </div>
    </div>
  );
}

function DockBtn({ onClick, label, icon, on, end, leave, disabled, testid, badge, extraClass = "" }: { onClick: () => void; label: string; icon: string; on?: boolean; end?: boolean; leave?: boolean; disabled?: boolean; testid?: string; badge?: number; extraClass?: string }) {
  return (
    <button type="button" data-testid={testid} disabled={disabled} onClick={onClick} className={`lb-ctl ${on ? "on" : ""} ${end ? "end" : ""} ${leave ? "leave" : ""} ${disabled ? "opacity-40" : ""} ${extraClass}`}>
      <span className="lb-ico" aria-hidden>{icon}</span>
      <span className="lb-lab">{label}</span>
      {badge && badge > 0 ? <span className="lb-badge" data-testid="live-chat-unread-btn">{badge}</span> : null}
    </button>
  );
}

/** Remote video stays muted so it can autoplay without any student permission; audio plays here after a tap. */
function RemoteAudio({ track, unlocked, onBlocked }: { track: MediaStreamTrack; unlocked: boolean; onBlocked: () => void }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const stream = new MediaStream([track]);
    el.srcObject = stream;
    el.muted = false;
    el.volume = 1;
    if (!unlocked) { el.pause(); return; }
    const play = () => el.play().catch(() => onBlocked());
    play();
    const onUnmute = () => play();
    track.addEventListener("unmute", onUnmute);
    return () => track.removeEventListener("unmute", onUnmute);
  }, [track, unlocked, onBlocked]);
  return <audio ref={ref} autoPlay playsInline data-testid="live-remote-audio" />;
}

function ClassAudio({ remotes, unlocked, onBlocked }: { remotes: Record<string, MediaStream>; unlocked: boolean; onBlocked: () => void }) {
  const audioTracks = useMemo(() => {
    const out: MediaStreamTrack[] = [];
    for (const s of Object.values(remotes)) for (const t of s.getAudioTracks()) if (t.readyState !== "ended") out.push(t);
    return out;
  }, [remotes]);
  if (!audioTracks.length) return null;
  return (
    <div className="sr-only" data-testid="live-class-audio">
      {audioTracks.map((t) => <RemoteAudio key={t.id} track={t} unlocked={unlocked} onBlocked={onBlocked} />)}
    </div>
  );
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


export function LiveLessonPage({ embedded = false, asAdmin: forceAdmin = false, guestLink = false, standalone = false }: { embedded?: boolean; asAdmin?: boolean; guestLink?: boolean; standalone?: boolean } = {}) {
  const { tr, lang } = useTr();
  const lms = useLmsActor();
  const [adminSess, setAdminSess] = useState(false);
  useEffect(() => { setAdminSess(!!getServerSession()); }, []);
  const [guest, setGuest] = useState<ReturnType<typeof liveGuest>>(null);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => { setGuest(liveGuest()); setHydrated(true); }, []);
  const search = hydrated && typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const path = hydrated && typeof window !== "undefined" ? window.location.pathname : "";
  const shellLess = standalone || guestLink || isClassroomPath(path);
  const guestCtx = !!(search && (search.get("guest") === "1" || /\/(lms\/live|classroom)\/join\b/.test(path)));
  const guestActor = guest?.token ? { id: guest.id, role: "student" as const, name: guest.name, cls: "", perms: [] as string[], guest: true } : null;
  const wantAdmin = search?.get("as") === "admin";
  const asAdmin = (forceAdmin || wantAdmin || (!lms.actor && adminSess)) && !guestCtx;
  const actor = asAdmin ? ADMIN_ACTOR : (guestCtx && guestActor ? guestActor : (lms.actor || guestActor));
  const ready = lms.ready || adminSess || forceAdmin || !!guest?.token;
  const adminElsewhere = lms.adminElsewhere && !asAdmin && !guest?.token;
  const areaHref = asAdmin ? "/admin#live" : "/lms/live";
  const liveHref = (id?: string) => {
    if (shellLess) return id ? classroomHref({ room: id, asAdmin, guest: guestCtx }) : (guestLink ? "/classroom/join" : "/classroom");
    return areaHref;
  };
  const goToRoom = (id: string) => {
    if (shellLess) {
      void enter(id);
      return;
    }
    openClassroomTab({ room: id, asAdmin, guest: guestCtx });
  };
  const [phase, setPhase] = useState<Phase>("lobby");
  const [rooms, setRooms] = useState<LiveRoomInfo[]>([]);
  const [canStart, setCanStart] = useState(false);
  const [livePerms, setLivePerms] = useState<LivePerms>({ run: false, schedule: false, schedStudent: false, schedClass: false, shareLink: false, camMic: false, screenShare: false, present: false, instant: false, record: false, recs: false });
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
  const [connecting, setConnecting] = useState(false);
  const [connectStep, setConnectStep] = useState<ConnectStep>("connecting");
  const [connectFading, setConnectFading] = useState(false);
  const mediaReadyRef = useRef(false);
  const joinStartedAt = useRef(0);
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
  const [presenceToasts, setPresenceToasts] = useState<{ id: number; ev: "join" | "leave"; name: string }[]>([]);
  const presenceSeq = useRef(0);
  const [chatSound, setChatSound] = useState(true);
  const [hearOn, setHearOn] = useState(false);
  const [needHear, setNeedHear] = useState(false);
  const [roomFocused, setRoomFocused] = useState(false);
  const [localView, setLocalView] = useState<LiveViewMode | null>(null);
  const [viewOpen, setViewOpen] = useState(false);
  const [pipMin, setPipMin] = useState(false);
  const [sideOpen, setSideOpen] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const [trayRoot, setTrayRoot] = useState<HTMLDivElement | null>(null);
  const [teachRoot, setTeachRoot] = useState<HTMLDivElement | null>(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [askNote, setAskNote] = useState<"" | "sent" | "allowed">("");
  const [ptrs, setPtrs] = useState<LivePtr[]>([]);
  const lastPtrAt = useRef(0);
  const fail = (e: unknown, en: string, ar: string) => setErr(lmsErrorText(e, tr, undefined, tr(en, ar)));
  const roomRef = useRef<HTMLDivElement>(null);
  const sfuRef = useRef<LiveSfu | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const localRef = useRef<MediaStream | null>(null);
  const shareRef = useRef<MediaStream | null>(null);
  const showChatRef = useRef(false);
  const chatSoundRef = useRef(true);
  const chatBox = useRef<HTMLDivElement>(null);
  const [serverSelfId, setServerSelfId] = useState("");
  const selfId = serverSelfId || actor?.id || "";
  const isHost = !!(room && actor && (
    actor.role === "admin"
    || (actor.role === "teacher" && room.teacherId === actor.id)
    || (actor.role === "teacher" && !room.teacherId && room.members.some((m) => m.id === actor.id && m.role === "teacher"))
  ));
  const canCamAllow = canShowHostAllow(isHost, livePerms, "camMic");
  const canShareAllow = canShowHostAllow(isHost, livePerms, "screenShare");
  const allowLabels = {
    cam: tr("Allow camera", "السماح بالكاميرا"),
    mic: tr("Allow mic", "السماح بالميكروفون"),
    share: tr("Allow share", "السماح بالمشاركة"),
    makePresenter: tr("Make presenter", "جعل مقدّمًا"),
    makeAttendee: tr("Make attendee", "جعل مشاركًا"),
  };
  const me = room?.members.find((m) => m.id === selfId);
  const iAmPresenter = !!(room && (isHost || memberFloor(me, room.teacherId) === "presenter"));
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const sync = () => setNarrow(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const loadList = useCallback(async () => {
    const r = await lmsApi.liveList(asAdmin);
    setRooms(r.rooms);
    setCanStart(r.canStart);
    setSfuOn(r.sfu);
    if (r.perms) setLivePerms(r.perms);
    else if (asAdmin) setLivePerms({ run: true, schedule: true, schedStudent: true, schedClass: true, shareLink: true, camMic: true, screenShare: true, present: true, instant: true, record: true, recs: false });
    setOptions(r.options || []);
    setGroups(r.groups || []);
    if (!pick && r.options?.[0]) setPick(r.options[0].section ? `${r.options[0].cls}|${r.options[0].section}` : r.options[0].cls);
  }, [pick, asAdmin]);

  useEffect(() => {
    if (!ready || !actor || actor.guest) return;
    loadList().catch((e) => fail(e, "Lesson list", "قائمة الحصص"));
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
  const leaveRoomFocus = async () => {
    setRoomFocused(false);
    setPageFocus(false);
    roomRef.current?.classList.remove("live-room-fs");
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined);
  };
  const enterRoomFocus = async () => {
    setRoomFocused(true);
    setPageFocus(true);
    const el = roomRef.current;
    const ok = await requestElFullscreen(el);
    if (!ok) el?.classList.add("live-room-fs");
  };
  const toggleRoomFocus = async () => { if (roomFocused) await leaveRoomFocus(); else await enterRoomFocus(); };
  const focusApi = useRef({ enter: enterRoomFocus, exit: leaveRoomFocus });
  focusApi.current = { enter: enterRoomFocus, exit: leaveRoomFocus };
  useEffect(() => {
    if (phase !== "in") return;
    return registerSlideFocus({ enter: () => focusApi.current.enter(), exit: () => focusApi.current.exit() });
  }, [phase]);
  useEffect(() => { if (phase !== "in" && roomFocused) void leaveRoomFocus(); }, [phase, roomFocused]);
  useEffect(() => {
    const on = phase === "in";
    document.documentElement.classList.toggle("lb-session", on);
    document.documentElement.classList.toggle("lb-classroom", shellLess);
    return () => { document.documentElement.classList.remove("lb-session"); document.documentElement.classList.remove("lb-classroom"); };
  }, [phase]);
  useEffect(() => {
    const onFs = () => {
      if (!document.fullscreenElement && roomFocused) {
        setRoomFocused(false);
        setPageFocus(false);
        roomRef.current?.classList.remove("live-room-fs");
      }
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && roomFocused) void leaveRoomFocus(); };
    document.addEventListener("fullscreenchange", onFs);
    window.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("fullscreenchange", onFs); window.removeEventListener("keydown", onKey); };
  }, [roomFocused]);
  useEffect(() => { chatSoundRef.current = chatSound; }, [chatSound]);
  const hostViewMode: LiveViewMode = room?.view?.mode || "board";
  const viewFollow = room?.view?.follow !== false;
  const viewMode: LiveViewMode = isHost || viewFollow ? hostViewMode : (localView || hostViewMode);
  const canPickView = isHost || !viewFollow;
  const speakerId = useActiveSpeaker(room?.members || [], remotes, localStream, selfId);
  useEffect(() => { if (viewFollow) setLocalView(null); }, [viewFollow]);
  useEffect(() => { if (viewMode === "discuss") setShowChat(true); }, [viewMode]);
  const applyView = async (body: { mode?: LiveViewMode; follow?: boolean }) => {
    if (!isHost || !room) return;
    try {
      const r = await lmsApi.liveView(room.id, { mode: body.mode || hostViewMode, follow: body.follow ?? viewFollow }, asAdmin);
      if (r.view) setRoom((prev) => prev ? { ...prev, view: r.view } : prev);
    } catch (e) { fail(e, "Change view", "تغيير العرض"); }
  };
  const boardBoot = useRef("");
  useEffect(() => {
    if (!isHost || !room || phase !== "in") return;
    if (boardBoot.current === room.id) return;
    if (room.view?.mode && room.view.mode !== "board") {
      boardBoot.current = room.id;
      return;
    }
    boardBoot.current = room.id;
    if (!room.view?.mode) void applyView({ mode: "board" });
    if (!room.present?.packId && room.present?.tool !== "board") {
      lmsApi.livePresent(room.id, { op: "board" }, asAdmin)
        .then((r) => { if (r.present !== undefined) setRoom((prev) => prev ? { ...prev, present: r.present || null } : prev); })
        .catch((e) => fail(e, "Whiteboard", "السبورة"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost, room?.id, phase]);

  const pickView = (mode: LiveViewMode) => {
    if (isHost) {
      void applyView({ mode });
      if (mode === "board" && room) {
        lmsApi.livePresent(room.id, { op: "board" }, asAdmin)
          .then((r) => { if (r.present !== undefined) setRoom((prev) => prev ? { ...prev, present: r.present || null } : prev); })
          .catch((e) => fail(e, "Whiteboard", "السبورة"));
      }
    } else setLocalView(mode);
    setViewOpen(false);
  };

  const cleanupMedia = useCallback(() => {
    sfuRef.current?.close();
    sfuRef.current = null;
    mediaReadyRef.current = false;
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
    const ids = new Set(snap.members.map((m) => m.id));
    setRemotes((prev) => {
      let changed = false;
      const next: typeof prev = {};
      for (const [k, v] of Object.entries(prev)) {
        const uid = k.split(":")[0];
        if (ids.has(uid) || uid === "screen") { next[k] = v; }
        else changed = true;
      }
      return changed ? next : prev;
    });
    const self = snap.members.find((m) => m.id === selfId);
    if (self) setHand(self.hand);
    if (self) setPhase("in");
    else if (snap.waiting.some((w) => w.id === selfId)) setPhase("waiting");
    else if (snap.status === "live" && phase === "in") setPhase("ended");
    if (snap.status === "ended") { setPhase("ended"); setErr(""); }
  }, [selfId, phase]);

  const connectWs = useCallback((roomId: string) => {
    const tok = asAdmin ? getServerSession()?.token : (guestCtx && liveGuest()?.token ? liveGuest()?.token : (lmsSession()?.token || liveGuest()?.token));
    if (!tok) return;
    closeWs();
    const ws = new WebSocket(liveWsUrl(tok, roomId));
    wsRef.current = ws;
    ws.onmessage = (ev) => {
      let msg: { t?: string; ev?: "join" | "leave"; room?: LiveSnap; pubs?: LivePub[]; selfId?: string; msg?: LiveChat; userId?: string; name?: string; camAllowed?: boolean; micAllowed?: boolean; shareAllowed?: boolean; cam?: boolean; mic?: boolean; on?: boolean; asks?: LiveAsk[]; present?: LiveSnap["present"]; view?: LiveView; stroke?: { c: string; w: number; d: number[]; by: string }; ptr?: LivePtr } = {};
      try { msg = JSON.parse(String(ev.data)) as typeof msg; } catch { return; }
      if (msg.selfId) setServerSelfId(msg.selfId);
      if (msg.t === "pubs" && Array.isArray(msg.pubs)) {
        setRoom((r) => r ? { ...r, pubs: msg.pubs! } : r);
        sfuRef.current?.syncSubs(msg.pubs).catch(() => undefined);
      }
      if (msg.t === "room" && msg.room) {
        applyRoom(msg.room);
        if (msg.room.pubs) sfuRef.current?.syncSubs(msg.room.pubs).catch(() => undefined);
      }
      if (msg.t === "present") setRoom((r) => r ? { ...r, present: msg.present || null } : r);
      if (msg.t === "view" && msg.view) setRoom((r) => r ? { ...r, view: msg.view } : r);
      if (msg.t === "stroke" && msg.stroke) setRoom((r) => r?.present ? { ...r, present: { ...r.present, strokes: [...(r.present.strokes || []), msg.stroke!].slice(-200) } } : r);
      if (msg.t === "chat" && msg.msg) {
        setChat((c) => [...c, msg.msg!].slice(-80));
        if (msg.msg.from !== selfId && !showChatRef.current) {
          setChatUnread((n) => n + 1);
          setChatToast(msg.msg);
          if (chatSoundRef.current) playChatBeep();
        }
      }
      if (msg.t === "ended") { setPhase("ended"); setErr(""); cleanupMedia(); closeWs(); }
      if (msg.t === "denied" && msg.userId === selfId) { setPhase("lobby"); setErr(tr("The teacher didn't let you in this time.", "لم يسمح لك المعلم بالدخول هذه المرة.")); closeWs(); }
      if (msg.t === "perm" && msg.userId) {
        setRoom((r) => r ? { ...r, members: r.members.map((m) => m.id !== msg.userId ? m : { ...m, camAllowed: msg.camAllowed ?? m.camAllowed, micAllowed: msg.micAllowed ?? m.micAllowed, shareAllowed: msg.shareAllowed ?? m.shareAllowed }), asks: (r.asks || []).filter((a) => a.userId !== msg.userId) } : r);
        if (msg.userId === selfId) {
          if (msg.camAllowed === false && localRef.current) {
            localRef.current.getVideoTracks().forEach((tr) => tr.stop());
            sfuRef.current?.unpublish("camera").catch(() => undefined);
            setCamOn(false);
          }
          if (msg.micAllowed === false && localRef.current) {
            localRef.current.getAudioTracks().forEach((tr) => tr.stop());
            sfuRef.current?.unpublish("mic").catch(() => undefined);
            setMicOn(false);
          }
          if (msg.camAllowed || msg.micAllowed) setAskNote("allowed");
        }
      }
      if (msg.t === "ask" && msg.asks) setRoom((r) => r ? { ...r, asks: msg.asks } : r);
      if (msg.t === "presence" && msg.userId && msg.userId !== selfId && (msg.ev === "join" || msg.ev === "leave")) {
        const ev = msg.ev;
        const name = msg.name || "Someone";
        const id = ++presenceSeq.current;
        setPresenceToasts((list) => [...list, { id, ev, name }].slice(-4));
        setTimeout(() => setPresenceToasts((list) => list.filter((x) => x.id !== id)), 5000);
      }
      if (msg.t === "ptr" && msg.ptr) {
        const ptr = msg.ptr;
        setPtrs((list) => ptr.on === false ? list.filter((x) => x.userId !== ptr.userId) : [...list.filter((x) => x.userId !== ptr.userId), ptr]);
      }
    };
    const ping = () => {
      if (ws.readyState === 1) ws.send(JSON.stringify({ t: "ping" }));
    };
    ws.onopen = () => ping();
    const beat = setInterval(ping, 15_000);
    ws.onclose = () => {
      clearInterval(beat);
      if (wsRef.current === ws && (phase === "in" || phase === "waiting")) {
        setTimeout(() => { if (wsRef.current === ws) connectWs(roomId); }, 1500);
      }
    };
  }, [applyRoom, asAdmin, cleanupMedia, guestCtx, phase, selfId, tr]);

  const ptrKindRef = useRef<PtrKind>("pen");
  const sendPtr = useCallback((x: number | null, y: number | null, kind?: PtrKind) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== 1) return;
    if (kind) ptrKindRef.current = normalizePtrKind(kind);
    const now = Date.now();
    if (x != null && now - lastPtrAt.current < 40) return;
    lastPtrAt.current = now;
    const k = ptrKindRef.current;
    ws.send(JSON.stringify(x == null || y == null ? { t: "ptr" } : { t: "ptr", x, y, kind: k }));
  }, []);

  useEffect(() => () => { closeWs(); cleanupMedia(); }, [cleanupMedia]);

  const pubKey = (room?.pubs || []).map((p) => `${p.userId}:${p.sessionId}:${p.tracks.join(",")}`).join("|");
  const attachRemote = useCallback((key: string, stream: MediaStream | null) => {
    if (stream && joinStartedAt.current) {
      const w = window as Window & { __liveFirstRemoteMs?: number };
      if (w.__liveFirstRemoteMs == null) {
        w.__liveFirstRemoteMs = Date.now() - joinStartedAt.current;
        console.debug("live-media first remote", w.__liveFirstRemoteMs, "ms");
      }
    }
    setRemotes((prev) => {
      const next = { ...prev };
      if (!stream) delete next[key];
      else next[key] = stream;
      return next;
    });
  }, []);
  const hideConnecting = useCallback(() => {
    setConnectFading(true);
    window.setTimeout(() => {
      setConnecting(false);
      setConnectFading(false);
    }, 280);
  }, []);
  const remoteSig = Object.keys(remotes).sort().map((k) => `${k}:${remotes[k].getTracks().map((t) => t.id + t.readyState).join(",")}`).join("|");
  const mixedRemotes = useMemo(() => {
    const out: Record<string, MediaStream> = { ...remotes };
    const ids = new Set(Object.keys(remotes).map((k) => k.slice(0, k.lastIndexOf(":"))).filter(Boolean));
    for (const id of ids) {
      const cam = remotes[`${id}:camera`];
      const mic = remotes[`${id}:mic`];
      if (cam && mic) {
        const aud = mic.getAudioTracks().filter((tr) => !cam.getAudioTracks().some((a) => a.id === tr.id));
        if (aud.length) out[`${id}:camera`] = new MediaStream([...cam.getTracks(), ...aud]);
      } else if (!cam && mic) out[`${id}:camera`] = mic;
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remoteSig]);
  useEffect(() => {
    if (phase !== "in" || !room?.id || !actor) return;
    if (mediaReadyRef.current) return;
    let cancelled = false;
    const roomId = room.id;
    const who = selfId || actor.id;
    const sfuOn = !!room.sfu;
    setConnecting(true);
    setConnectFading(false);
    setConnectStep("media");
    (async () => {
      try {
        const iceP = sfuOn ? lmsApi.liveIce(roomId, asAdmin) : null;
        if (typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia) {
          try {
            const preview = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
            preview.getTracks().forEach((tr) => tr.stop());
          } catch { /* they can allow camera later */ }
        }
        if (cancelled) return;
        setConnectStep("joining");
        if (iceP) {
          const ice = (await iceP).iceServers;
          if (cancelled) return;
          if (!sfuRef.current) sfuRef.current = new LiveSfu(roomId, who, ice, attachRemote, asAdmin);
          else sfuRef.current.setSelfId(who);
          await sfuRef.current.warmup();
          if (cancelled) return;
          await sfuRef.current.syncSubs(room.pubs || []);
        }
        if (cancelled) return;
        mediaReadyRef.current = true;
        if (joinStartedAt.current) {
          (window as Window & { __liveReadyMs?: number }).__liveReadyMs = Date.now() - joinStartedAt.current;
        }
        hideConnecting();
      } catch (e) {
        if (!cancelled) {
          fail(e, "Video", "الفيديو");
          hideConnecting();
        }
      }
    })();
    return () => { cancelled = true; };
  }, [phase, room?.id, actor?.id, selfId, asAdmin, attachRemote, hideConnecting]);

  useEffect(() => {
    if (phase !== "in") return;
    sfuRef.current?.setSelfId(selfId);
    sfuRef.current?.syncSubs(room?.pubs || []).catch(() => undefined);
  }, [phase, pubKey, room?.pubs, selfId]);
  useEffect(() => {
    const hasAudio = Object.values(remotes).some((s) => s.getAudioTracks().some((t) => t.readyState !== "ended"));
    if (phase === "in" && hasAudio && !hearOn) setNeedHear(true);
  }, [remotes, phase, hearOn]);

  useEffect(() => {
    if (typeof window === "undefined" || !actor) return;
    const q = new URLSearchParams(window.location.search).get("room") || "";
    if (!q || phase !== "lobby") return;
    if (shellLess) {
      enter(q).catch(() => undefined);
      return;
    }
    // Never join in the LMS/admin tab. Try a new tab; if the popup is blocked, the lobby
    // still shows “Open classroom in a new tab” because ?room= stays in the address.
    openClassroomTab({ room: q, asAdmin, guest: guestCtx }, "none");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actor]);

  async function enter(id: string) {
    if (!shellLess) {
      openClassroomTab({ room: id, asAdmin, guest: guestCtx });
      return;
    }
    setBusy(true); setErr("");
    setConnecting(true);
    setConnectFading(false);
    setConnectStep("connecting");
    mediaReadyRef.current = false;
    joinStartedAt.current = Date.now();
    if (typeof window !== "undefined") {
      delete (window as Window & { __liveFirstRemoteMs?: number; __liveReadyMs?: number }).__liveFirstRemoteMs;
      delete (window as Window & { __liveFirstRemoteMs?: number; __liveReadyMs?: number }).__liveReadyMs;
    }
    try {
      const r = await lmsApi.liveJoin(id, asAdmin);
      if (r.selfId) setServerSelfId(r.selfId);
      if (r.room) applyRoom(r.room);
      if (r.status === "in") setPhase("in");
      else if (r.status === "waiting") { setPhase("waiting"); hideConnecting(); }
      else if (r.status === "ended") { setPhase("ended"); hideConnecting(); }
      else if (r.status === "full") { setErr(tr("This class is full.", "هذا الصف ممتلئ.")); hideConnecting(); }
      else hideConnecting();
      connectWs(id);
      if (typeof window !== "undefined") history.replaceState(null, "", liveHref(id));
    } catch (e) {
      fail(e, "Join room", "دخول الحصة");
      hideConnecting();
    } finally { setBusy(false); }
  }

  async function startNow() {
    setBusy(true); setErr("");
    try {
      const [cls, section] = pick.includes("|") ? pick.split("|") : [pick, ""];
      const r = await lmsApi.liveStart({ title: title.trim() || undefined, cls, section, groupId: groupId || undefined, minutes }, asAdmin);
      if (shellLess) await enter(r.id);
      else goToRoom(r.id);
    } catch (e) {
      fail(e, "Start lesson", "بدء الحصة");
    } finally { setBusy(false); }
  }

  async function toggleCam() {
    unlockAudio();
    if (!sfuRef.current) { setErr(tr("Video is still connecting. Try Camera again in a moment.", "الفيديو ما زال يتصل. أعد المحاولة بعد لحظة.")); return; }
    if (!me) { setErr(tr("You are not in the room yet.", "لست داخل الحصة بعد.")); return; }
    if (camOn) {
      localRef.current?.getVideoTracks().forEach((t) => t.stop());
      await sfuRef.current.unpublish("camera");
      setCamOn(false);
      const leftover = localRef.current?.getAudioTracks() || [];
      setLocalStream(leftover.length ? new MediaStream(leftover) : null);
      if (!leftover.length) localRef.current = null;
      return;
    }
    if (!isHost && !me.camAllowed) { setErr(tr("Wait for the teacher to allow your camera.", "انتظر حتى يسمح المعلم بكاميرتك.")); return; }
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
      else fail(e, "Camera", "الكاميرا");
    }
  }

  async function toggleMic() {
    unlockAudio();
    if (!sfuRef.current) { setErr(tr("Video is still connecting. Try Mic again in a moment.", "الفيديو ما زال يتصل. أعد المحاولة بعد لحظة.")); return; }
    if (!me) { setErr(tr("You are not in the room yet.", "لست داخل الحصة بعد.")); return; }
    if (micOn) {
      localRef.current?.getAudioTracks().forEach((t) => t.stop());
      await sfuRef.current.unpublish("mic");
      setMicOn(false);
      const leftover = localRef.current?.getVideoTracks() || [];
      setLocalStream(leftover.length ? new MediaStream(leftover) : null);
      if (!leftover.length) localRef.current = null;
      return;
    }
    if (!isHost && !me.micAllowed) { setErr(tr("Wait for the teacher to allow your microphone.", "انتظر حتى يسمح المعلم بميكروفونك.")); return; }
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
      else fail(e, "Mic", "الميكروفون");
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

  async function askToSpeak() {
    if (!room || isHost) return;
    const cam = !me?.camAllowed;
    const mic = !me?.micAllowed;
    if (!cam && !mic) return;
    try {
      await lmsApi.liveAsk(room.id, { cam, mic, on: true }, asAdmin);
      setAskNote("sent");
    } catch (e) { fail(e, "Ask to speak", "طلب التحدث"); }
  }

  async function allowAsk(userId: string, cam: boolean, mic: boolean) {
    if (!room) return;
    try {
      await lmsApi.livePerm(room.id, userId, cam ? true : undefined, mic ? true : undefined, asAdmin);
    } catch (e) { fail(e, "Allow camera or mic", "السماح بالكاميرا أو الميكروفون"); }
  }

  async function sendChat() {
    const text = draft.trim();
    if (!text || !room) return;
    setDraft("");
    await lmsApi.liveChat(room.id, text, asAdmin).catch((e) => fail(e, "Chat", "الدردشة"));
  }

  async function leave() {
    if (room) await lmsApi.liveLeave(room.id, asAdmin).catch(() => undefined);
    cleanupMedia();
    closeWs();
    void leaveRoomFocus();
    setErr("");
    setPhase("lobby");
    setRoom(null);
    setPtrs([]);
    history.replaceState(null, "", liveHref());
    loadList().catch(() => undefined);
  }

  async function endClass() {
    if (!room) return;
    setErr("");
    await lmsApi.liveEnd(room.id, asAdmin).catch((e) => fail(e, "End class", "إنهاء الحصة"));
    cleanupMedia();
    closeWs();
    void leaveRoomFocus();
    setPhase("ended");
  }
  async function addLessonMin(n: number) {
    if (!room) return;
    try {
      const r = await lmsApi.liveDuration(room.id, { addMin: n }, asAdmin);
      if (r.endsAt) setRoom((prev) => prev ? { ...prev, endsAt: r.endsAt } : prev);
    } catch (e) { fail(e, "Lesson time", "وقت الحصة"); }
  }
  async function setLessonMin(n: number) {
    if (!room) return;
    try {
      const r = await lmsApi.liveDuration(room.id, { endsAt: Date.now() + n * 60_000 }, asAdmin);
      if (r.endsAt) setRoom((prev) => prev ? { ...prev, endsAt: r.endsAt } : prev);
    } catch (e) { fail(e, "Lesson time", "وقت الحصة"); }
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

  const classroomFrame = (inner: ReactNode, showBar = true) => (
    <div className="lb-classroom flex min-h-dvh flex-col bg-gradient-to-br from-cream via-white to-white text-[#1b2f44] dark:from-[#0d1b2a] dark:via-[#0d1b2a] dark:to-[#10263b] dark:text-[#e6eef6]" data-testid="classroom-shell">
      {showBar && (
        <div className="lb-classroom-bar" data-testid="classroom-bar">
          <ClassroomBrand variant="room" />
        </div>
      )}
      {inner}
    </div>
  );

  if (guestLink) {
    const tok = hydrated && typeof window !== "undefined" ? (new URLSearchParams(window.location.search).get("t") || "") : "";
    const join = !hydrated ? <p className="p-8 text-center font-bold opacity-70">…</p> : <GuestJoin token={tok} />;
    return classroomFrame(join);
  }

  if (hydrated && ready && !actor) {
    const login = <NeedLogin adminElsewhere={adminElsewhere} />;
    return shellLess ? classroomFrame(login) : login;
  }

  const body = (
      <div className={embedded ? "flex w-full flex-1 flex-col gap-4" : shellLess && phase === "in" ? "flex min-h-dvh w-full flex-1 flex-col" : "mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-3 py-4 sm:px-6"} data-testid="live-lesson" data-standalone={shellLess ? "1" : undefined} dir={lang === "ar" ? "rtl" : "ltr"}>
        {shellLess && (connecting || connectFading) && <ClassroomConnecting step={connectStep} fading={connectFading} />}
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
              {!shellLess && search?.get("room") && (
                <p className="mt-3">
                  <a className={primaryBtn} href={classroomHref({ room: search.get("room") || "", asAdmin, guest: guestCtx })} target="_blank" rel="noopener noreferrer" data-testid="live-open-classroom">{tr("Open classroom in a new tab", "افتح الصف في علامة تبويب جديدة")}</a>
                </p>
              )}
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
            {(asAdmin || livePerms.instant) && <StartMeetingPanel asAdmin={asAdmin} onEnter={(id) => goToRoom(id)} />}
            <LiveSchedulePanel asAdmin={asAdmin} perms={asAdmin ? { run: true, schedule: true, schedStudent: true, schedClass: true, shareLink: true, camMic: true, screenShare: true, present: true, instant: true, record: true, recs: livePerms.recs } : livePerms} onStart={(id) => goToRoom(id)} busy={busy} />
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
                      <button type="button" className={primaryBtn} disabled={busy} onClick={() => goToRoom(r.id)} data-testid="live-join-btn">{r.mine ? tr("Rejoin", "إعادة الدخول") : tr("Join", "انضم")}</button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            {(asAdmin || canStart || actor?.role === "teacher") && (
              <section className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-black/5 dark:bg-slate-800" data-testid="live-history-wrap">
                <h2 className="mb-3 text-lg font-black">{tr("Live lesson history", "سجل الحصص المباشرة")}</h2>
                <p className="mb-3 text-sm font-semibold opacity-70">{tr("Enrolled students who join a class lesson are marked present automatically. Guests are not added, and existing marks are left as they are.", "يُسجَّل حضور الطلاب المسجّلين تلقائيًا عند انضمامهم إلى حصة الصف. لا يُضاف الضيوف، ولا تُستبدل العلامات الموجودة.")}</p>
                <LiveHistory asAdmin={asAdmin} />
              </section>
            )}
          </div>
        )}

        {shellLess && phase === "waiting" && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 rounded-[2rem] bg-gradient-to-br from-sky-100 to-violet-200 p-8 text-center dark:from-slate-800 dark:to-indigo-950" data-testid="live-waiting">
            <p className="animate-bounce text-6xl" aria-hidden>🚪</p>
            <h2 className="text-2xl font-black">{tr("Waiting for your teacher…", "بانتظار معلمك…")}</h2>
            <p className="max-w-md font-semibold opacity-80">{tr("You're in the waiting room. You'll jump in as soon as your teacher lets you in.", "أنت في غرفة الانتظار. ستدخل بمجرد أن يسمح لك المعلم.")}</p>
            <button type="button" className="rounded-full bg-white px-5 py-2 font-bold shadow dark:bg-slate-700" onClick={leave}>{tr("Leave", "خروج")}</button>
          </div>
        )}

        {shellLess && phase === "ended" && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 rounded-[2rem] bg-gradient-to-br from-amber-100 to-rose-100 p-8 text-center dark:from-slate-800 dark:to-rose-950" data-testid="live-ended">
            <p className="text-6xl" aria-hidden>👋</p>
            <h2 className="text-2xl font-black">{tr("Class has ended", "انتهت الحصة")}</h2>
            <button type="button" className={primaryBtn} onClick={() => { if (shellLess && !guestCtx) { window.location.href = areaHref; return; } setErr(""); setPhase("lobby"); setRoom(null); history.replaceState(null, "", liveHref()); loadList().catch(() => undefined); }}>{shellLess && !guestCtx ? tr("Back to dashboard", "العودة إلى اللوحة") : tr("Back to Live Lesson", "العودة إلى الحصة المباشرة")}</button>
          </div>
        )}

        {shellLess && phase === "in" && room && (
          <div ref={roomRef} className={`lb-room${roomFocused ? " is-focus" : ""}${toolsOpen ? " tools-open" : ""}${(livePresentingContent(room.present) || shareOn || viewMode === "board") ? " stage-first" : ""}${boardFillsStage(viewMode, room.present) ? " board-on" : ""}`} data-testid="live-room" data-focus-keep data-stage-first={livePresentingContent(room.present) || shareOn || viewMode === "board" ? "1" : "0"}>
            {err && <p className="lb-wait lb-wait-err" role="alert">{err}</p>}
            {permHelp && (
              <div className="lb-wait" role="status" data-testid="live-perm-help">
                <p>🎥 {tr("Allow camera/mic in your browser", "اسمح للكاميرا والميكروفون في المتصفح")}</p>
                <p className="font-semibold opacity-80">{tr("Look for the camera icon in the address bar, choose Allow, then tap Camera or Mic again.", "ابحث عن أيقونة الكاميرا في شريط العنوان واختر سماح، ثم اضغط الكاميرا أو الميكروفون مرة أخرى.")}</p>
              </div>
            )}
            <header className="lb-top">
              <div className="lb-brand">
                <ClassroomBrand variant="room" />
              </div>
              <div className="lb-meet">
                <div className="lb-title" dir="auto">{room.title}</div>
                <button type="button" className="lb-sub" onClick={() => setShowPeople(true)} data-testid="live-people">
                  {[room.cls, room.section].filter(Boolean).join(" · ") || tr("Meeting", "اجتماع")}
                  {" · "}
                  {tr(`${room.members.filter((m) => m.present).length} here`, `${room.members.filter((m) => m.present).length} حاضر`)}
                </button>
              </div>
              <div className="lb-top-actions">
                <div className="relative">
                  <button type="button" className="lb-view" onClick={() => setViewOpen((v) => !v)} data-testid="live-view-open" aria-expanded={viewOpen}>
                    <span aria-hidden>{VIEW_CARDS.find((c) => c.id === viewMode)?.icon}</span>
                    <span className="lb-view-lab">{tr(VIEW_CARDS.find((c) => c.id === viewMode)?.en || "View", VIEW_CARDS.find((c) => c.id === viewMode)?.ar || "عرض")}</span>
                  </button>
                  {viewOpen && (
                    <LiveViewPicker
                      mode={viewMode}
                      follow={!!room.view?.follow}
                      canPush={isHost}
                      onMode={pickView}
                      onFollow={isHost ? (on) => void applyView({ follow: on }) : undefined}
                      onClose={() => setViewOpen(false)}
                    />
                  )}
                </div>
                <button type="button" className={`lb-focus ${roomFocused ? "is-on" : ""}`} onClick={() => void toggleRoomFocus()} data-testid="live-room-focus" data-focus-keep title={roomFocused ? tr("Exit Focus (Esc)", "إنهاء التركيز (Esc)") : tr("Focus — open the classroom full screen, with controls and tools still visible", "تركيز — افتح الصف بملء الشاشة مع بقاء أدوات التحكم")}>
                  🎯 {roomFocused ? tr("Exit", "إنهاء") : tr("Focus", "تركيز")}
                </button>
                <button type="button" className="lb-side-toggle" onClick={() => setSideOpen(true)} data-testid="live-side-open" aria-label={tr("People and controls", "الحاضرون والأدوات")}>👥</button>
                <button type="button" className="lb-head-btn lb-head-leave" onClick={leave} data-testid="live-leave">
                  <LeaveIcon />
                  <span className="lb-head-long">{tr("Leave", "خروج")}</span>
                </button>
                {isHost && (
                  <button type="button" className="lb-head-btn lb-head-end" onClick={endClass} data-testid="live-end">
                    <PowerIcon />
                    <span className="lb-head-long">{tr("End class", "إنهاء الحصة")}</span>
                  </button>
                )}
              </div>
            </header>

            {isHost && !!room.waiting.length && (
              <div className="lb-wait" data-testid="live-waiting-host">
                <span className="font-black">{tr("Waiting room", "غرفة الانتظار")} ({room.waiting.length})</span>
                <ul className="mt-1 flex flex-wrap gap-2">
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

            {isHost && (room.asks || []).length > 0 && (
              <div className="lb-ask-banner" data-testid="live-ask-banner">
                {(room.asks || []).map((a) => (
                  <div key={a.userId} className="flex flex-wrap items-center justify-between gap-2 py-1">
                    <span className="font-black" dir="auto">{a.name} {tr("wants to turn on the camera or mic", "يريد تشغيل الكاميرا أو الميكروفون")}</span>
                    <span className="flex gap-2">
                      <button type="button" className="rounded-full bg-[#047857] px-3 py-1 text-sm font-black text-white" onClick={() => allowAsk(a.userId, a.cam, a.mic)} data-testid="live-ask-allow">{tr("Allow", "سماح")}</button>
                      <button type="button" className="rounded-full bg-[#fff8ec] px-3 py-1 text-sm font-bold text-[#1b3a57]" onClick={() => lmsApi.liveAsk(room.id, { userId: a.userId, cam: a.cam, mic: a.mic, on: false }, asAdmin).catch(() => undefined)}>{tr("Not now", "ليس الآن")}</button>
                    </span>
                  </div>
                ))}
              </div>
            )}
            {!isHost && askNote === "allowed" && (me?.camAllowed || me?.micAllowed) && (
              <p className="lb-wait" data-testid="live-ask-granted">{tr("Your teacher allowed your camera or mic. Tap Camera or Mic to turn it on.", "سمح معلمك بكاميرتك أو ميكروفونك. اضغط الكاميرا أو الميكروفون لتشغيله.")}</p>
            )}
            {(() => {
              const presenting = livePresentingContent(room.present);

              const layout = presentLayout(viewMode, presenting);
              const streamOf = (m: { id: string }) => m.id === selfId ? localStream : mixedRemotes[`${m.id}:camera`] || mixedRemotes[`${m.id}:mic`];
              const teachers = room.members.filter((m) => m.role === "teacher");
              const students = room.members.filter((m) => m.role !== "teacher");
              const who = (m: LiveMember) => liveWho(m, selfId, room.teacherId, tr);
              const boardFs = boardFillsStage(viewMode, room.present);
              const showPresent = presenting || isHost || asAdmin || livePerms.present || boardFs;
              const presentSlot = showPresent ? (
                <LivePresent roomId={room.id} present={room.present} isHost={isHost} canPresent={isHost || asAdmin || livePerms.present || memberFloor(me, room.teacherId) === "presenter"} asAdmin={asAdmin} selfId={selfId} members={room.members} onPresent={(present) => setRoom((r) => r ? { ...r, present } : r)} onView={(view) => setRoom((r) => r ? { ...r, view } : r)} onRoomFocus={() => void toggleRoomFocus()} roomFocused={roomFocused} layout={layout} trayRoot={trayRoot} teachRoot={teachRoot} ptrs={ptrs} onPtr={sendPtr} />
              ) : null;
              const screen = mainScreen ? <Tile label={tr("Shared screen", "الشاشة المشاركة")} stream={mainScreen} size={viewMode === "lecture" || viewMode === "teach" ? "main" : "thumb"} /> : null;
              const teacher = teachers.map((m) => <Tile key={m.id} label={who(m)} stream={streamOf(m)} hand={m.hand} size="thumb" featured={m.id === speakerId} online={m.present} />);
              const teacherHero = teachers.map((m) => <Tile key={m.id} label={who(m)} stream={streamOf(m)} hand={m.hand} size="hero" featured={m.id === speakerId} online={m.present} />);
              const studentTiles = students.map((m) => <Tile key={m.id} label={who(m)} stream={streamOf(m)} hand={m.hand} off={!streamOf(m) && m.id !== selfId} size="thumb" featured={m.id === speakerId} online={m.present} allow={<AllowBtns roomId={room.id} member={m} teacherId={room.teacherId} asAdmin={asAdmin} canCam={canCamAllow} canShare={canShareAllow} canFloor={isHost} onErr={fail} labels={allowLabels} />} />);
              const thumbs = studentTiles;
              const gallery = [...teachers, ...students].map((m) => <Tile key={m.id} label={who(m)} stream={streamOf(m)} hand={m.hand} off={!streamOf(m) && m.id !== selfId} size="card" featured={m.id === speakerId} online={m.present} allow={<AllowBtns roomId={room.id} member={m} teacherId={room.teacherId} asAdmin={asAdmin} canCam={canCamAllow} canShare={canShareAllow} canFloor={isHost} onErr={fail} labels={allowLabels} />} />);
              const featuredMem = room.members.find((m) => m.id === speakerId) || teachers[0];
              const featured = featuredMem ? <Tile key={featuredMem.id} label={who(featuredMem)} stream={streamOf(featuredMem)} hand={featuredMem.hand} off={!streamOf(featuredMem) && featuredMem.id !== selfId} size="hero" featured online={featuredMem.present} allow={<AllowBtns roomId={room.id} member={featuredMem} teacherId={room.teacherId} asAdmin={asAdmin} canCam={canCamAllow} canShare={canShareAllow} canFloor={isHost} onErr={fail} labels={allowLabels} />} /> : null;
              const others = room.members.filter((m) => m.id !== featuredMem?.id).map((m) => <Tile key={m.id} label={who(m)} stream={streamOf(m)} hand={m.hand} off={!streamOf(m) && m.id !== selfId} size="thumb" online={m.present} allow={<AllowBtns roomId={room.id} member={m} teacherId={room.teacherId} asAdmin={asAdmin} canCam={canCamAllow} canShare={canShareAllow} canFloor={isHost} onErr={fail} labels={allowLabels} />} />);
              const bubblesStage = viewMode === "teach" || viewMode === "board";
              const teacherMem = teachers[0];
              const stageInner = bubblesStage ? (
                <div className="lb-stage-fill" data-testid={`live-stage-${viewMode}`} data-view={viewMode}>
                  {presentSlot || screen || (teacherHero.length ? <div className="flex min-h-0 flex-1 p-3">{teacherHero}</div> : <div className="flex flex-1 items-center justify-center font-bold opacity-60">{tr("Waiting for the teacher…", "بانتظار المعلم…")}</div>)}
                </div>
              ) : viewMode === "discuss" ? (
                <div className="flex min-h-0 flex-1" data-testid="live-discuss-wrap">
                  <div className="lb-stage-fill min-w-0 flex-1">
                    <RoomStage mode={viewMode} presenting={presenting} presentSlot={presentSlot} screen={screen} teacher={teacher} teacherHero={teacherHero} students={studentTiles} thumbs={thumbs} gallery={gallery} featured={featured} others={others} />
                  </div>
                  <aside className="flex w-[min(22rem,40%)] shrink-0 flex-col border-s border-black/10 bg-black/5 p-3 dark:bg-white/5" data-testid="live-chat-dock" data-focus-keep>
                    <div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-black">{tr("Chat", "الدردشة")}</h3></div>
                    <div ref={chatBox} className="flex-1 space-y-2 overflow-auto rounded-2xl bg-white/80 p-3 dark:bg-slate-900/80">
                      {chat.map((c) => (
                        <p key={c.id} className="text-sm"><span className="font-black">{c.name}: </span>{c.text}</p>
                      ))}
                    </div>
                    <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); sendChat(); }}>
                      <input className="flex-1 rounded-2xl border border-black/10 px-3 py-2 dark:bg-slate-800" value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={400} placeholder={tr("Say hello…", "قل مرحبا…")} />
                      <button type="submit" className={primaryBtn}>{tr("Send", "إرسال")}</button>
                    </form>
                  </aside>
                </div>
              ) : (
                <div className="lb-stage-fill">
                  <RoomStage mode={viewMode} presenting={presenting} presentSlot={presentSlot} screen={screen} teacher={teacher} teacherHero={teacherHero} students={studentTiles} thumbs={thumbs} gallery={gallery} featured={featured} others={others} />
                </div>
              );
              const shortWho = (m: LiveMember) => m.id === selfId
                ? (m.id === room.teacherId || m.role === "teacher" ? tr("You (teacher)", "أنت (المعلم)") : tr("You", "أنت"))
                : m.name;
              const selfMediaOf = (m: LiveMember) => (m.id === selfId && iAmPresenter) ? {
                camOn, micOn,
                onCam: () => { void toggleCam().catch((e) => fail(e, "Camera", "الكاميرا")); },
                onMic: () => { void toggleMic().catch((e) => fail(e, "Mic", "الميكروفون")); },
                camDisabled: !isHost && !me?.camAllowed && !camOn,
                micDisabled: !isHost && !me?.micAllowed && !micOn,
              } : undefined;
              const sideBody = (
                <>
                  {teacherMem && (
                    <SideTile
                      hero
                      label={shortWho(teacherMem)}
                      stream={streamOf(teacherMem)}
                      hand={teacherMem.hand}
                      online={teacherMem.present}
                      selfMedia={selfMediaOf(teacherMem)}
                    />
                  )}
                  <div className="lb-side-controls" data-testid="live-side-controls">
                    <DockBtn testid="live-cam" icon={camOn ? "📷" : "🚫"} label={tr("Camera", "الكاميرا")} on={camOn} disabled={!isHost && !me?.camAllowed && !camOn} onClick={() => toggleCam().catch((e) => fail(e, "Camera", "الكاميرا"))} />
                    <DockBtn testid="live-mic" icon={micOn ? "🎤" : "🔇"} label={tr("Mic", "الميكروفون")} on={micOn} disabled={!isHost && !me?.micAllowed && !micOn} onClick={() => toggleMic().catch((e) => fail(e, "Mic", "الميكروفون"))} />
                    {(isHost || iAmPresenter || me?.shareAllowed) && <DockBtn testid="live-share" icon="🖥️" label={tr("Share", "مشاركة")} on={shareOn} onClick={() => toggleShare().catch((e) => fail(e, "Share screen", "مشاركة الشاشة"))} />}
                    <DockBtn testid="live-hand" icon="✋" label={tr("Hand", "يد")} on={hand} onClick={() => toggleHand().catch(() => undefined)} />
                    {!isHost && me && (!me.camAllowed || !me.micAllowed) && (
                      <DockBtn testid="live-ask" icon="🙋" label={askNote === "sent" ? tr("Asked…", "تم الطلب…") : tr("Ask to speak", "طلب التحدث")} on={askNote === "sent"} onClick={() => askToSpeak().catch(() => undefined)} />
                    )}
                    <DockBtn testid="live-people-dock" icon="👥" label={tr("People", "الحاضرون")} on={showPeople} onClick={() => setShowPeople(true)} />
                    <DockBtn testid="live-chat-btn" icon="💬" label={tr("Chat", "دردشة")} on={showChat} onClick={() => setShowChat(true)} badge={chatUnread} />
                    {isHost && (asAdmin || livePerms.record) && (
                      <DockBtn testid="live-record" icon="⏺️" label={tr("Record", "تسجيل")} disabled={!livePerms.recs} onClick={() => undefined} />
                    )}
                  </div>
                  <div className="lb-side-people" data-testid="live-student-strip">
                    {students.map((m) => (
                      <SideTile
                        key={m.id}
                        label={shortWho(m)}
                        stream={streamOf(m)}
                        hand={m.hand}
                        off={!streamOf(m) && m.id !== selfId}
                        online={m.present}
                        selfMedia={selfMediaOf(m)}
                        allow={<AllowBtns roomId={room.id} member={m} teacherId={room.teacherId} asAdmin={asAdmin} canCam={canCamAllow} canShare={canShareAllow} canFloor={isHost} onErr={fail} labels={allowLabels} />}
                      />
                    ))}
                    {!students.length && <p className="lb-side-empty">{tr("No attendees yet", "لا يوجد مشاركون بعد")}</p>}
                  </div>
                </>
              );
              return (
                <>
                <div className="lb-workspace">
                  <div className="lb-stage">
                    {stageInner}
                    <ClassAudio remotes={remotes} unlocked={hearOn} onBlocked={() => setNeedHear(true)} />
                    {needHear && !hearOn && (
                      <button type="button" className="lb-hear" onClick={unlockAudio} data-testid="live-hear">
                        🔊 {tr("Tap to hear class", "اضغط لسماع الصف")}
                      </button>
                    )}
                    {!!presenceToasts.length && (
                      <div className="lb-presence-toasts" data-testid="live-presence-toasts" aria-live="polite">
                        {presenceToasts.map((x) => (
                          <p key={x.id} className={`lb-presence-toast ${x.ev === "join" ? "is-join" : "is-leave"}`} data-testid="live-presence-toast">
                            {x.ev === "join" ? tr(`${x.name} joined`, `انضم ${x.name}`) : tr(`${x.name} left`, `غادر ${x.name}`)}
                          </p>
                        ))}
                      </div>
                    )}
                    {chatToast && !showChat && viewMode !== "discuss" && (
                      <button type="button" className="lb-toast" onClick={() => setShowChat(true)} data-testid="live-chat-toast" data-focus-keep>
                        <span className="opacity-80">{chatToast.name}</span>
                        <span className="mt-0.5 block truncate">{chatToast.text}</span>
                      </button>
                    )}
                  </div>
                  {!narrow && <aside className="lb-side" data-testid="live-side">{sideBody}</aside>}
                </div>
                {narrow && sideOpen && (
                  <div className="lb-sheet" onClick={() => setSideOpen(false)} role="presentation">
                    <aside className="lb-sheet-card lb-side is-sheet" onClick={(e) => e.stopPropagation()} data-testid="live-side-sheet">
                      <div className="lb-sheet-head">
                        <h3 className="text-sm font-black">{tr("People and controls", "الحاضرون والأدوات")}</h3>
                        <button type="button" onClick={() => setSideOpen(false)} aria-label={tr("Close", "إغلاق")}>✕</button>
                      </div>
                      {sideBody}
                    </aside>
                  </div>
                )}
                </>
              );
            })()}
            <div className="lb-bottom-strip" data-testid="live-bottom-strip" data-focus-keep>
              <div id="lb-tray-root" className="lb-tray-root" ref={setTrayRoot} />
              <div id="lb-teach-tray" className="lb-teach-tray" ref={setTeachRoot} />
              <div className="lb-bottom-timer">
                <LiveCountdown endsAt={room.endsAt || room.created + 40 * 60_000} isHost={isHost} onAdd={addLessonMin} onSet={setLessonMin} />
              </div>
            </div>
            {isHost && asAdmin && !livePerms.recs && (
              <p className="lb-hint" data-testid="live-rec-note">{tr("Turn on R2 storage to enable recording", "فعّل تخزين R2 لتفعيل التسجيل")}</p>
            )}
            {!isHost && me && !me.camAllowed && !me.micAllowed && (
              <p className="lb-hint">{tr("Your camera and mic stay off until your teacher allows them. You can still see and hear the teacher.", "تبقى كاميرتك وميكروفونك مغلقين حتى يسمح بهما معلمك. ما زال بإمكانك رؤية المعلم وسماعه.")}</p>
            )}
          </div>
        )}

        {showPeople && room && createPortal(
          <div className="fixed inset-0 z-[4500] flex justify-end bg-black/40" onClick={() => setShowPeople(false)} role="presentation">
            <aside className="flex h-full w-full max-w-sm flex-col bg-white p-4 text-[#1b3a57] shadow-xl dark:bg-[#0f1f30] dark:text-[#fff8ec]" onClick={(e) => e.stopPropagation()} data-testid="live-people-panel">
              <div className="mb-3 flex items-center justify-between"><h3 className="text-lg font-black">{tr("People", "الحاضرون")}</h3><button type="button" onClick={() => setShowPeople(false)}>✕</button></div>
              <ul className="flex-1 space-y-2 overflow-auto">
                {room.members.map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-2 rounded-2xl bg-[#eef2f6] px-3 py-2 text-[#1b3a57] dark:bg-[#1b3a57] dark:text-[#fff8ec]">
                    <span className="flex min-w-0 items-center gap-2 font-bold">
                      <span className={`lb-online ${m.present ? "" : "is-off"}`} aria-hidden />
                      <span className="truncate">{liveWho(m, selfId, room.teacherId, tr)} {m.hand ? "✋" : ""}</span>
                      <span className={`text-xs font-extrabold ${m.present ? "text-[#065f46] dark:text-[#a7f3d0]" : "text-[#475569] dark:text-[#cbd5e1]"}`}>{m.present ? tr("Online", "متصل") : tr("Offline", "غير متصل")}</span>
                    </span>
                    <AllowBtns roomId={room.id} member={m} teacherId={room.teacherId} asAdmin={asAdmin} canCam={canCamAllow} canShare={canShareAllow} canFloor={isHost} onErr={fail} labels={allowLabels} />
                  </li>
                ))}
              </ul>
            </aside>
          </div>,
          document.body,
        )}

        {showChat && room && viewMode !== "discuss" && createPortal(
          <div className="fixed inset-0 z-[4500] flex justify-end bg-black/40" onClick={() => setShowChat(false)} role="presentation">
            <aside className="flex h-full w-full max-w-sm flex-col bg-white p-4 shadow-xl dark:bg-slate-900" onClick={(e) => e.stopPropagation()} data-testid="live-chat-panel">
              <div className="mb-3 flex items-center justify-between gap-2"><h3 className="text-lg font-black">{tr("Chat", "الدردشة")}</h3><span className="flex items-center gap-2"><button type="button" className="rounded-full px-2 py-1 text-sm font-bold" onClick={() => setChatSound((v) => !v)} data-testid="live-sound" aria-pressed={chatSound}>{chatSound ? "🔔" : "🔕"}</button><button type="button" onClick={() => setShowChat(false)}>✕</button></span></div>
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
        , document.body)}
      </div>
  );
  if (embedded) return body;
  if (shellLess) return classroomFrame(body, phase !== "in");
  return (
    <AssessmentShell title={tr("Live Lesson", "الحصة المباشرة")} exitHref="/lms" wide toolbar={<LmsStaffToolbar />}>
      {body}
    </AssessmentShell>
  );
}
