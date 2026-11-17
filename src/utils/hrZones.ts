import type {
  HeartRateZoneId,
  UserProfile,
  WeekdayKey,
  WeeklySchedule,
  WorkoutIntensity,
  WorkoutStep,
} from '../types/fitness';

export interface ZoneInfo {
  id: HeartRateZoneId;
  name: string;
  shortLabel: string;
  minPct: number;
  maxPct: number;
  colorHex: string;
  textClass: string;
  bgClass: string;
  borderClass: string;
}

export const HR_ZONES: ZoneInfo[] = [
  {
    id: 1,
    name: 'Zona 1 · Recupero Attivo',
    shortLabel: 'Z1 Recupero',
    minPct: 50,
    maxPct: 60,
    colorHex: '#64748B',
    textClass: 'text-slate-300',
    bgClass: 'bg-slate-500/20',
    borderClass: 'border-slate-500/40',
  },
  {
    id: 2,
    name: 'Zona 2 · Aerobico Base',
    shortLabel: 'Z2 Aerobico',
    minPct: 60,
    maxPct: 70,
    colorHex: '#10B981',
    textClass: 'text-emerald-400',
    bgClass: 'bg-emerald-500/20',
    borderClass: 'border-emerald-500/40',
  },
  {
    id: 3,
    name: 'Zona 3 · Tempo / Ritmo',
    shortLabel: 'Z3 Ritmo',
    minPct: 70,
    maxPct: 80,
    colorHex: '#06B6D4',
    textClass: 'text-cyan-400',
    bgClass: 'bg-cyan-500/20',
    borderClass: 'border-cyan-500/40',
  },
  {
    id: 4,
    name: 'Zona 4 · Soglia Anaerobica',
    shortLabel: 'Z4 Soglia',
    minPct: 80,
    maxPct: 90,
    colorHex: '#F59E0B',
    textClass: 'text-amber-400',
    bgClass: 'bg-amber-500/20',
    borderClass: 'border-amber-500/40',
  },
  {
    id: 5,
    name: 'Zona 5 · Massimale VO2',
    shortLabel: 'Z5 Massimale',
    minPct: 90,
    maxPct: 100,
    colorHex: '#F43F5E',
    textClass: 'text-rose-400',
    bgClass: 'bg-rose-500/20',
    borderClass: 'border-rose-500/40',
  },
];

export function computeMaxHr(age: number): number {
  const clampedAge = Math.max(14, Math.min(90, age));
  // Tanaka formula: 208 - 0.7 * age
  return Math.round(208 - 0.7 * clampedAge);
}

export function getHeartRateZone(bpm: number | null, profile: UserProfile): ZoneInfo {
  if (!bpm || bpm <= 0) {
    return HR_ZONES[0];
  }
  const maxHr = computeMaxHr(profile.age);
  const pct = (bpm / maxHr) * 100;
  if (pct >= 90) return HR_ZONES[4];
  if (pct >= 80) return HR_ZONES[3];
  if (pct >= 70) return HR_ZONES[2];
  if (pct >= 60) return HR_ZONES[1];
  return HR_ZONES[0];
}

export function estimateKcalPerSecond(bpm: number | null, intensity: number, profile: UserProfile): number {
  // Keytel approximation when BPM is known, fallback to MET scaling by motion intensity
  if (bpm && bpm > 45) {
    const kcalPerMin = Math.max(
      1.5,
      (-55.0969 + 0.6309 * bpm + 0.1988 * profile.weightKg + 0.2017 * profile.age) / 4.184
    );
    return kcalPerMin / 60;
  }
  const met = 1.8 + (intensity / 100) * 8.5;
  const kcalPerMin = (met * 3.5 * profile.weightKg) / 200;
  return kcalPerMin / 60;
}

export function getProgramTotalDuration(program: {
  rounds: number;
  steps: { durationSec: number; phase: string }[];
}): number {
  const warmups = program.steps.filter((s) => s.phase === 'warmup').reduce((acc, s) => acc + s.durationSec, 0);
  const cooldowns = program.steps.filter((s) => s.phase === 'cooldown').reduce((acc, s) => acc + s.durationSec, 0);
  const mainLoop = program.steps
    .filter((s) => s.phase !== 'warmup' && s.phase !== 'cooldown')
    .reduce((acc, s) => acc + s.durationSec, 0);
  return warmups + mainLoop * Math.max(1, program.rounds) + cooldowns;
}

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function getZoneBpmRange(zoneId: HeartRateZoneId, profile: UserProfile): { min: number; max: number } {
  const maxHr = computeMaxHr(profile.age);
  const z = HR_ZONES[zoneId - 1] ?? HR_ZONES[1];
  return {
    min: Math.round((maxHr * z.minPct) / 100),
    max: Math.round((maxHr * z.maxPct) / 100),
  };
}

export function scaleStepForIntensity(step: WorkoutStep, intensity: WorkoutIntensity): WorkoutStep {
  if (intensity === 'moderate') return step;

  if (intensity === 'light') {
    const durationSec =
      step.phase === 'work'
        ? Math.max(15, Math.round((step.durationSec * 0.8) / 5) * 5)
        : step.phase === 'rest'
        ? Math.round((step.durationSec * 1.35) / 5) * 5
        : step.durationSec;
    const targetZone =
      step.phase === 'work'
        ? (Math.max(2, step.targetZone - 1) as HeartRateZoneId)
        : step.targetZone;
    return { ...step, durationSec, targetZone };
  }

  // vigorous
  const durationSec =
    step.phase === 'work'
      ? Math.round((step.durationSec * 1.2) / 5) * 5
      : step.phase === 'rest'
      ? Math.max(10, Math.round((step.durationSec * 0.8) / 5) * 5)
      : step.durationSec;
  const targetZone =
    step.phase === 'work'
      ? (Math.min(5, step.targetZone + 1) as HeartRateZoneId)
      : step.targetZone;
  return { ...step, durationSec, targetZone };
}

export const DEFAULT_USER_PROFILE: UserProfile = {
  age: 44,
  weightKg: 76,
  restingBpm: 60,
};

export const WEEKDAYS: { key: WeekdayKey; label: string; short: string }[] = [
  { key: 'lun', label: 'Lunedì', short: 'Lun' },
  { key: 'mar', label: 'Martedì', short: 'Mar' },
  { key: 'mer', label: 'Mercoledì', short: 'Mer' },
  { key: 'gio', label: 'Giovedì', short: 'Gio' },
  { key: 'ven', label: 'Venerdì', short: 'Ven' },
  { key: 'sab', label: 'Sabato', short: 'Sab' },
  { key: 'dom', label: 'Domenica', short: 'Dom' },
];

export function getTodayWeekdayKey(): WeekdayKey {
  const jsDay = new Date().getDay(); // 0 = Sun, 1 = Mon ...
  const map: WeekdayKey[] = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];
  return map[jsDay];
}

export const DEFAULT_WEEKLY_SCHEDULE: WeeklySchedule = {
  lun: 'cardio-mix-6',
  mar: 'zona2-resistenza',
  mer: 'hiit-cardio-16',
  gio: 'zona2-resistenza',
  ven: 'tabata-classico',
  sab: 'boxe-agilita',
  dom: null,
};
