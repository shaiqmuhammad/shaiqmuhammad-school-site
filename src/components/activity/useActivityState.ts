"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { activityApi, ActivityError, type ActivityState, type Who } from "@/lib/activity";

/**
 * Polls an activity every ~2 s (only changed state is sent back, via `since=rev`).
 * Returns the latest state, a manual refresh, a clock-offset-corrected `now`, and any fatal error code.
 */
export function useActivityState(code: string, who: Who | null, intervalMs = 2000) {
  const [state, setState] = useState<ActivityState | null>(null);
  const [error, setError] = useState("");
  const [offline, setOffline] = useState(false);
  const [offset, setOffset] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const rev = useRef<number | undefined>(undefined);
  const whoKey = who ? JSON.stringify(who) : "";
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const live = useRef(true);

  const refresh = useCallback(async () => {
    if (!whoKey) return;
    const w = JSON.parse(whoKey) as Who;
    try {
      const r = await activityApi.state(code, w, rev.current);
      setOffline(false);
      setOffset(r.now - Date.now());
      if ("same" in r) return;
      rev.current = r.rev;
      setState(r);
      setError("");
    } catch (e) {
      if (e instanceof ActivityError && e.status && e.status !== 429 && e.status < 500) setError(e.code);
      else setOffline(true);
    }
  }, [code, whoKey]);

  /** Force a full reload of the state (after the user changed something). */
  const reload = useCallback(async () => {
    rev.current = undefined;
    await refresh();
  }, [refresh]);

  useEffect(() => {
    live.current = true;
    rev.current = undefined;
    const loop = async () => {
      await refresh();
      if (live.current) timer.current = setTimeout(loop, document.hidden ? intervalMs * 3 : intervalMs);
    };
    loop();
    return () => {
      live.current = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [refresh, intervalMs]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  return { state, error, offline, reload, now: now + offset };
}

export function secondsLeft(state: ActivityState | null, now: number): number | null {
  const end = state?.settings.timerEnd;
  if (!end) return null;
  return Math.max(0, Math.round((end - now) / 1000));
}
