import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';
import { getTodayIST } from '../utils/dateHelpers';
import type { WaterSettings } from '../types';
import { isDemo, demoGet, demoSet } from './demo';

export const WATER_EVERY: WaterSettings['every'][] = [30, 60, 120, 180];
export const DEFAULT_WATER: WaterSettings = { on: true, every: 120, from: '08:00', to: '22:00', goal: 8 };

const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const fmt = (t: number) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;

/** Same rule as the server scheduler: every N min after "from", up to and including "to". */
export function waterTimes(w: WaterSettings | null | undefined): string[] {
  if (!w || !w.on || !WATER_EVERY.includes(w.every)) return [];
  const out: string[] = [];
  for (let t = toMin(w.from) + w.every; t <= toMin(w.to); t += w.every) out.push(fmt(t));
  return out;
}

export const nextWaterTime = (w: WaterSettings | null | undefined, now: string) =>
  waterTimes(w).find(t => t > now) ?? null;

const cacheKey = (date: string) => `da_water_v1_${date}`;
const readCache = (date: string): number | null => { try { const v = localStorage.getItem(cacheKey(date)); return v === null ? null : Number(v) || 0; } catch { return null; } };
const writeCache = (date: string, n: number) => { try { localStorage.setItem(cacheKey(date), String(n)); } catch { /* ignore */ } };

/** Atomic +1 / −1 on the server (two phones tapping at once both count). Returns the new total. */
export async function addWater(date: string, delta: 1 | -1): Promise<number> {
  if (isDemo()) {
    const all = demoGet<Record<string, number>>('water', {}); const n = Math.max(0, Math.min(30, (all[date] ?? 0) + delta));
    demoSet('water', { ...all, [date]: n }); writeCache(date, n); return n;
  }
  const { data, error } = await supabase.rpc('add_water', { p_date: date, p_delta: delta });
  if (error) throw error;
  writeCache(date, data as number);
  return data as number;
}

/** Today's glass count: instant from cache, then refreshed from the server (and whenever the app is reopened). */
export function useWaterToday() {
  const [date, setDate] = useState(getTodayIST());
  const [glasses, setGlasses] = useState(() => readCache(getTodayIST()) ?? 0);
  const [loaded, setLoaded] = useState(() => readCache(getTodayIST()) !== null);
  const busy = useRef(false);

  const load = useCallback(async () => {
    const d = getTodayIST();
    setDate(d);
    if (isDemo()) { const n = demoGet<Record<string, number>>('water', {})[d] ?? 0; setGlasses(n); writeCache(d, n); setLoaded(true); return; }
    const { data, error } = await supabase.from('water_logs').select('glasses').eq('date', d).maybeSingle();
    if (!error && !busy.current) { const n = data?.glasses ?? 0; setGlasses(n); writeCache(d, n); }
    setLoaded(true);
  }, []);

  useEffect(() => {
    load();
    const onVis = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [load]);

  const change = useCallback(async (delta: 1 | -1) => {
    const d = getTodayIST();
    busy.current = true;
    setGlasses(g => Math.max(0, g + delta));          // show it straight away
    try { const n = await addWater(d, delta); setGlasses(n); return n; }
    catch (e) { setGlasses(g => Math.max(0, g - delta)); throw e; }
    finally { busy.current = false; }
  }, []);

  return { date, glasses, loaded, add: () => change(1), remove: () => change(-1), reload: load };
}
