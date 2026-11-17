import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  BluetoothConnected,
  CheckCircle2,
  Flame,
  Heart,
  Pause,
  Play,
  RotateCcw,
  SkipForward,
  Video,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type {
  BluetoothHRState,
  HeartRateSource,
  HeartRateZoneId,
  StepPhase,
  TelemetrySample,
  UserProfile,
  VideoTelemetry,
  WorkoutIntensity,
  WorkoutProgram,
  WorkoutSessionLog,
  WorkoutStep,
} from '../types/fitness';
import { audioCues, requestScreenWakeLock } from '../utils/audioCues';
import { inferAnimationId } from '../data/exerciseLibrary';
import {
  HR_ZONES,
  computeMaxHr,
  estimateKcalPerSecond,
  formatDuration,
  getHeartRateZone,
  getZoneBpmRange,
  scaleStepForIntensity,
} from '../utils/hrZones';
import { CameraMonitor } from './CameraMonitor';
import { ExerciseAnimation } from './ExerciseAnimation';

interface FlattenedInterval {
  instanceId: string;
  step: WorkoutStep;
  roundNumber: number;
  totalRounds: number;
  startAtSec: number;
  endAtSec: number;
}

function flattenProgram(program: WorkoutProgram): FlattenedInterval[] {
  const warmups = program.steps.filter((s) => s.phase === 'warmup');
  const mainLoop = program.steps.filter((s) => s.phase !== 'warmup' && s.phase !== 'cooldown');
  const cooldowns = program.steps.filter((s) => s.phase === 'cooldown');

  const items: FlattenedInterval[] = [];
  let cursor = 0;

  for (const s of warmups) {
    items.push({
      instanceId: `w-${s.id}-${cursor}`,
      step: s,
      roundNumber: 0,
      totalRounds: program.rounds,
      startAtSec: cursor,
      endAtSec: cursor + s.durationSec,
    });
    cursor += s.durationSec;
  }

  const rounds = Math.max(1, program.rounds);
  for (let r = 1; r <= rounds; r++) {
    for (const s of mainLoop) {
      items.push({
        instanceId: `r${r}-${s.id}-${cursor}`,
        step: s,
        roundNumber: r,
        totalRounds: rounds,
        startAtSec: cursor,
        endAtSec: cursor + s.durationSec,
      });
      cursor += s.durationSec;
    }
  }

  for (const s of cooldowns) {
    items.push({
      instanceId: `c-${s.id}-${cursor}`,
      step: s,
      roundNumber: rounds,
      totalRounds: rounds,
      startAtSec: cursor,
      endAtSec: cursor + s.durationSec,
    });
    cursor += s.durationSec;
  }

  return items;
}

const PHASE_META: Record<
  StepPhase,
  { label: string; textClass: string; barClass: string; hex: string }
> = {
  warmup: {
    label: 'Riscaldamento',
    textClass: 'text-emerald-400',
    barClass: 'bg-emerald-500',
    hex: '#10B981',
  },
  work: {
    label: 'Potenziamento Aerobico',
    textClass: 'text-cyan-400',
    barClass: 'bg-cyan-500',
    hex: '#06B6D4',
  },
  rest: {
    label: 'Recupero Attivo',
    textClass: 'text-amber-400',
    barClass: 'bg-amber-500',
    hex: '#F59E0B',
  },
  cooldown: {
    label: 'Defaticamento',
    textClass: 'text-slate-300',
    barClass: 'bg-slate-400',
    hex: '#94A3B8',
  },
};

interface WorkoutTimerViewProps {
  programs: WorkoutProgram[];
  selectedProgramId: string;
  onSelectProgram: (id: string) => void;
  workoutIntensity: WorkoutIntensity;
  onChangeIntensity: (level: WorkoutIntensity) => void;
  userProfile: UserProfile;
  bluetooth: BluetoothHRState & {
    connect: () => Promise<void>;
    disconnect: () => void;
  };
  onSaveSession: (session: WorkoutSessionLog) => void;
  todayScheduledProgramName: string | null;
}

const INTENSITY_OPTIONS: {
  id: WorkoutIntensity;
  label: string;
  hint: string;
  speed: number;
}[] = [
  { id: 'light', label: 'Moderata', hint: 'Recuperi ampi · Z2–Z3', speed: 0.82 },
  { id: 'moderate', label: 'Over 40 Std', hint: 'Bilanciata · Z3–Z4', speed: 1.0 },
  { id: 'vigorous', label: 'Intensa', hint: 'Soglia & VO2 · Z4–Z5', speed: 1.18 },
];

export const WorkoutTimerView: React.FC<WorkoutTimerViewProps> = ({
  programs,
  selectedProgramId,
  onSelectProgram,
  workoutIntensity,
  onChangeIntensity,
  userProfile,
  bluetooth,
  onSaveSession,
  todayScheduledProgramName,
}) => {
  const activeProgram = useMemo(
    () => programs.find((p) => p.id === selectedProgramId) ?? programs[0],
    [programs, selectedProgramId]
  );

  const scaledProgram = useMemo(
    () => ({
      ...activeProgram,
      steps: activeProgram.steps.map((s) => scaleStepForIntensity(s, workoutIntensity)),
    }),
    [activeProgram, workoutIntensity]
  );

  const intervals = useMemo(() => flattenProgram(scaledProgram), [scaledProgram]);
  const totalDurationSec = intervals.length > 0 ? intervals[intervals.length - 1].endAtSec : 0;
  const activeIntensityOption =
    INTENSITY_OPTIONS.find((o) => o.id === workoutIntensity) ?? INTENSITY_OPTIONS[1];

  const [isRunning, setIsRunning] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [muted, setMuted] = useState(false);
  const [videoTelemetry, setVideoTelemetry] = useState<VideoTelemetry | null>(null);
  const [completedSummary, setCompletedSummary] = useState<WorkoutSessionLog | null>(null);

  // Live session accumulators
  const samplesRef = useRef<TelemetrySample[]>([]);
  const zoneSecondsRef = useRef<Record<HeartRateZoneId, number>>({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 });
  const kcalRef = useRef<number>(0);
  const lastRecordedSecRef = useRef<number>(-1);
  const lastCountdownBeepRef = useRef<number>(-1);
  const lastIntervalIdxRef = useRef<number>(0);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  // Determine authoritative Heart Rate & Source
  const activeBpm = bluetooth.isConnected && bluetooth.bpm
    ? bluetooth.bpm
    : videoTelemetry?.estimatedBpm ?? null;

  const activeSource: HeartRateSource = bluetooth.isConnected && bluetooth.bpm
    ? 'bluetooth'
    : videoTelemetry?.estimatedBpm
    ? 'video'
    : 'none';

  const activeIntensity = videoTelemetry?.motionIntensity ?? 0;
  const currentZone = getHeartRateZone(activeBpm, userProfile);
  const maxHr = computeMaxHr(userProfile.age);

  // Keep latest telemetry in refs for accurate 1Hz logging without resetting timer effect
  const latestMetricsRef = useRef({
    bpm: activeBpm,
    intensity: activeIntensity,
    source: activeSource,
  });
  latestMetricsRef.current = {
    bpm: activeBpm,
    intensity: activeIntensity,
    source: activeSource,
  };

  // Current interval lookup
  const elapsedSecFloat = elapsedMs / 1000;
  const currentIntervalIndex = useMemo(() => {
    if (intervals.length === 0) return 0;
    const idx = intervals.findIndex((item) => elapsedSecFloat < item.endAtSec);
    return idx === -1 ? intervals.length - 1 : idx;
  }, [elapsedSecFloat, intervals]);

  const currentInterval = intervals[currentIntervalIndex];
  const nextInterval = intervals[currentIntervalIndex + 1] ?? null;

  const intervalRemainingSec = currentInterval
    ? Math.max(0, currentInterval.endAtSec - elapsedSecFloat)
    : 0;
  const intervalDurationSec = currentInterval ? currentInterval.step.durationSec : 1;
  const intervalProgressPct = Math.min(
    100,
    Math.max(0, ((intervalDurationSec - intervalRemainingSec) / intervalDurationSec) * 100)
  );
  const totalProgressPct =
    totalDurationSec > 0 ? Math.min(100, (elapsedSecFloat / totalDurationSec) * 100) : 0;

  const finalizeSession = useCallback(
    (durationSecOverride?: number) => {
      const durationSec = Math.max(1, Math.round(durationSecOverride ?? elapsedMs / 1000));
      const samples = samplesRef.current;
      const bpmSamples = samples.map((s) => s.bpm).filter((b): b is number => b !== null && b > 0);
      const avgBpm =
        bpmSamples.length > 0
          ? Math.round(bpmSamples.reduce((a, b) => a + b, 0) / bpmSamples.length)
          : null;
      const maxBpm = bpmSamples.length > 0 ? Math.max(...bpmSamples) : null;
      const avgIntensity =
        samples.length > 0
          ? Math.round(samples.reduce((a, s) => a + s.intensity, 0) / samples.length)
          : 0;

      const sources = new Set(samples.map((s) => s.source).filter((s) => s !== 'none'));
      const hrSourceUsed: WorkoutSessionLog['hrSourceUsed'] =
        sources.size > 1 ? 'mixed' : sources.size === 1 ? Array.from(sources)[0] : 'none';

      const log: WorkoutSessionLog = {
        id: `sess-${Date.now()}`,
        programId: activeProgram.id,
        programName: activeProgram.name,
        completedAt: new Date().toISOString(),
        durationSec,
        avgBpm,
        maxBpm,
        avgIntensity,
        estimatedKcal: Math.round(kcalRef.current),
        hrSourceUsed,
        zoneSeconds: { ...zoneSecondsRef.current },
        samples: samples.slice(-240),
      };

      onSaveSession(log);
      setCompletedSummary(log);
    },
    [activeProgram.id, activeProgram.name, elapsedMs, onSaveSession]
  );

  const resetWorkout = useCallback(() => {
    setIsRunning(false);
    setElapsedMs(0);
    samplesRef.current = [];
    zoneSecondsRef.current = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    kcalRef.current = 0;
    lastRecordedSecRef.current = -1;
    lastCountdownBeepRef.current = -1;
    lastIntervalIdxRef.current = 0;
  }, []);

  // Reset when changing selected program
  useEffect(() => {
    resetWorkout();
  }, [selectedProgramId, resetWorkout]);

  // Screen Wake Lock while workout is running
  useEffect(() => {
    let active = true;
    if (isRunning) {
      void requestScreenWakeLock().then((sentinel) => {
        if (active) wakeLockRef.current = sentinel;
        else if (sentinel) void sentinel.release();
      });
    } else if (wakeLockRef.current) {
      void wakeLockRef.current.release();
      wakeLockRef.current = null;
    }
    return () => {
      active = false;
      if (wakeLockRef.current) {
        void wakeLockRef.current.release();
        wakeLockRef.current = null;
      }
    };
  }, [isRunning]);

  // High-precision drift-free timer loop
  useEffect(() => {
    if (!isRunning || totalDurationSec <= 0) return;

    let lastTick = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      const delta = now - lastTick;
      lastTick = now;

      setElapsedMs((prev) => {
        const nextMs = prev + delta;
        const nextSec = nextMs / 1000;

        if (nextSec >= totalDurationSec) {
          window.clearInterval(timer);
          setIsRunning(false);
          audioCues.playWorkoutComplete();
          finalizeSession(totalDurationSec);
          return totalDurationSec * 1000;
        }

        // Check interval transition audio cue
        const idx = intervals.findIndex((item) => nextSec < item.endAtSec);
        const safeIdx = idx === -1 ? intervals.length - 1 : idx;
        if (safeIdx !== lastIntervalIdxRef.current) {
          lastIntervalIdxRef.current = safeIdx;
          const phase = intervals[safeIdx].step.phase;
          if (phase === 'work') audioCues.playWorkStart();
          else if (phase === 'rest') audioCues.playRestStart();
          else audioCues.playWarmupOrCooldown();
          lastCountdownBeepRef.current = -1;
        }

        // 3-2-1 countdown cue at end of interval
        const curItem = intervals[safeIdx];
        if (curItem) {
          const rem = Math.ceil(curItem.endAtSec - nextSec);
          if (rem >= 1 && rem <= 3 && rem !== lastCountdownBeepRef.current) {
            lastCountdownBeepRef.current = rem;
            audioCues.playCountdownTick();
          }
        }

        // 1Hz Telemetry Sampling
        const wholeSec = Math.floor(nextSec);
        if (wholeSec > lastRecordedSecRef.current) {
          lastRecordedSecRef.current = wholeSec;
          const { bpm, intensity, source } = latestMetricsRef.current;
          samplesRef.current.push({ elapsedSec: wholeSec, bpm, intensity, source });
          const z = getHeartRateZone(bpm, userProfile);
          zoneSecondsRef.current[z.id] = (zoneSecondsRef.current[z.id] ?? 0) + 1;
          kcalRef.current += estimateKcalPerSecond(bpm, intensity, userProfile);
        }

        return nextMs;
      });
    }, 80);

    return () => window.clearInterval(timer);
  }, [finalizeSession, intervals, isRunning, totalDurationSec, userProfile]);

  const handleTogglePlay = () => {
    if (!isRunning && elapsedMs === 0 && intervals.length > 0) {
      const firstPhase = intervals[0].step.phase;
      if (firstPhase === 'work') audioCues.playWorkStart();
      else audioCues.playWarmupOrCooldown();
    }
    setIsRunning((r) => !r);
  };

  const handleSkipInterval = () => {
    if (!currentInterval) return;
    if (currentIntervalIndex >= intervals.length - 1) {
      setIsRunning(false);
      audioCues.playWorkoutComplete();
      finalizeSession(elapsedMs / 1000);
      return;
    }
    const nextStartMs = intervals[currentIntervalIndex + 1].startAtSec * 1000;
    lastIntervalIdxRef.current = currentIntervalIndex + 1;
    lastCountdownBeepRef.current = -1;
    setElapsedMs(nextStartMs);
    const phase = intervals[currentIntervalIndex + 1].step.phase;
    if (phase === 'work') audioCues.playWorkStart();
    else if (phase === 'rest') audioCues.playRestStart();
    else audioCues.playWarmupOrCooldown();
  };

  const handleToggleMute = () => {
    const next = !muted;
    audioCues.muted = next;
    setMuted(next);
  };

  const phaseStyle = currentInterval
    ? PHASE_META[currentInterval.step.phase]
    : PHASE_META.work;

  return (
    <div className="space-y-5">
      {/* Top Program Selector, Intensity Selector & Quick Context Strip */}
      <div className="flex flex-col gap-4 rounded-xl border border-slate-800 bg-[#0F141D] p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <span>Scheda Selezionata</span>
              <span aria-hidden="true">·</span>
              <span>Profilo {userProfile.age} anni (FC max {maxHr} BPM)</span>
              {todayScheduledProgramName && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-cyan-400">Oggi: {todayScheduledProgramName}</span>
                </>
              )}
            </div>
            <div className="mt-1.5 flex items-center gap-3">
              <select
                aria-label="Seleziona programma di allenamento"
                value={activeProgram.id}
                onChange={(e) => onSelectProgram(e.target.value)}
                className="w-full max-w-md rounded-lg border border-slate-700 bg-[#07090E] px-3 py-2 text-sm font-semibold text-white focus:border-cyan-500 focus:outline-none min-h-[44px]"
              >
                {programs.map((prog) => (
                  <option key={prog.id} value={prog.id}>
                    {prog.name} ({prog.category})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Intensity Selector */}
          <div className="flex flex-col gap-1.5 shrink-0">
            <div className="flex items-center justify-between gap-3 text-xs text-slate-400">
              <span>Intensità Allenamento</span>
              <span className="text-cyan-400 font-medium">{activeIntensityOption.hint}</span>
            </div>
            <div className="grid grid-cols-3 rounded-lg border border-slate-800 bg-[#07090E] p-1 gap-1">
              {INTENSITY_OPTIONS.map((opt) => {
                const active = opt.id === workoutIntensity;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      if (elapsedMs === 0 || !isRunning) {
                        onChangeIntensity(opt.id);
                      } else {
                        setIsRunning(false);
                        onChangeIntensity(opt.id);
                      }
                    }}
                    className={`rounded-md px-3 py-2 text-xs font-semibold transition-colors whitespace-nowrap min-h-[38px] ${
                      active
                        ? 'bg-cyan-500 text-slate-950'
                        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-5 text-xs text-slate-400 shrink-0 lg:border-l lg:border-slate-800 lg:pl-5">
            <div>
              <span>Durata totale</span>
              <p className="font-mono-tabular text-sm font-bold text-white">{formatDuration(totalDurationSec)}</p>
            </div>
            <div>
              <span>Blocchi</span>
              <p className="font-mono-tabular text-sm font-bold text-white">{intervals.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Split Console */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* LEFT COLUMN: Precision Timer & Workout Queue */}
        <div className="flex flex-col gap-4 lg:col-span-5">
          <div className="rounded-xl border border-slate-800 bg-[#0F141D] p-5">
            {/* Phase & Round Header */}
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className={`font-semibold uppercase tracking-wider ${phaseStyle.textClass}`}>
                {phaseStyle.label}
              </span>
              <span className="font-mono-tabular text-slate-400">
                {currentInterval && currentInterval.roundNumber > 0
                  ? `Round ${currentInterval.roundNumber}/${currentInterval.totalRounds}`
                  : `Blocco ${currentIntervalIndex + 1}/${intervals.length}`}
              </span>
            </div>

            {/* Exercise Title + Live Animated Demonstration */}
            <div className="mt-3 flex items-center gap-4">
              <ExerciseAnimation
                animationId={
                  currentInterval
                    ? currentInterval.step.animationId ??
                      inferAnimationId(currentInterval.step.title, currentInterval.step.phase)
                    : 'warmup-march'
                }
                active={true}
                accentColor={phaseStyle.hex}
                speedMultiplier={activeIntensityOption.speed}
                size="lg"
              />
              <div className="min-w-0 flex-1">
                <h2 className="font-display text-3xl font-bold tracking-tight text-white">
                  {currentInterval?.step.title ?? 'Pronto'}
                </h2>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs font-medium text-slate-300">
                  <span>{HR_ZONES[(currentInterval?.step.targetZone ?? 2) - 1]?.shortLabel}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono-tabular text-cyan-400">
                    {(() => {
                      const range = getZoneBpmRange(currentInterval?.step.targetZone ?? 2, userProfile);
                      return `${range.min}–${range.max} BPM`;
                    })()}
                  </span>
                </div>
                {currentInterval?.step.notes && (
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
                    {currentInterval.step.notes}
                  </p>
                )}
              </div>
            </div>

            {/* Giant Tabular Countdown */}
            <div className="my-5 flex items-baseline justify-between gap-4 border-y border-slate-800/80 py-5">
              <div>
                <div className="text-xs text-slate-400">Tempo blocco</div>
                <div className="font-mono-tabular text-6xl font-bold tracking-tight text-white sm:text-7xl">
                  {formatDuration(Math.ceil(intervalRemainingSec))}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-slate-400">Totale sessione</div>
                <div className="font-mono-tabular text-xl font-bold text-slate-200">
                  {formatDuration(elapsedSecFloat)}
                </div>
                <div className="font-mono-tabular text-xs text-slate-400">
                  su {formatDuration(totalDurationSec)}
                </div>
              </div>
            </div>

            {/* Interval + Total Progress Bars */}
            <div className="space-y-2.5">
              <div>
                <div className="mb-1 flex justify-between text-[11px] text-slate-400">
                  <span>Avanzamento intervallo</span>
                  <span className="font-mono-tabular">{Math.round(intervalProgressPct)}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
                  <div
                    className={`h-full transition-all duration-100 ${phaseStyle.barClass}`}
                    style={{ width: `${intervalProgressPct}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="mb-1 flex justify-between text-[11px] text-slate-400">
                  <span>Avanzamento allenamento</span>
                  <span className="font-mono-tabular">{Math.round(totalProgressPct)}%</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full bg-slate-300 transition-all duration-150"
                    style={{ width: `${totalProgressPct}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Next Up Preview */}
            {nextInterval && (
              <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-[#07090E] px-3 py-2 text-xs">
                <div className="flex min-w-0 items-center gap-2.5">
                  <ExerciseAnimation
                    animationId={
                      nextInterval.step.animationId ??
                      inferAnimationId(nextInterval.step.title, nextInterval.step.phase)
                    }
                    active={isRunning}
                    accentColor={PHASE_META[nextInterval.step.phase].hex}
                    size="sm"
                  />
                  <div className="min-w-0">
                    <span className="block text-[11px] text-slate-400">Prossimo esercizio</span>
                    <span className="block truncate font-semibold text-slate-200">
                      {nextInterval.step.title}
                    </span>
                  </div>
                </div>
                <span className="font-mono-tabular text-slate-300 shrink-0">
                  {formatDuration(nextInterval.step.durationSec)}
                </span>
              </div>
            )}

            {/* Ergonomic Thumb Controls (>= 48px primary) */}
            <div className="mt-5 grid grid-cols-4 gap-2">
              <button
                type="button"
                onClick={handleTogglePlay}
                className={`col-span-2 flex min-h-[48px] items-center justify-center gap-2 rounded-lg text-sm font-bold transition-colors ${
                  isRunning
                    ? 'bg-amber-500 text-slate-950 hover:bg-amber-400'
                    : 'bg-cyan-500 text-slate-950 hover:bg-cyan-400'
                }`}
              >
                {isRunning ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
                <span>{isRunning ? 'Pausa' : elapsedMs > 0 ? 'Riprendi' : 'Avvia'}</span>
              </button>

              <button
                type="button"
                onClick={handleSkipInterval}
                title="Salta al blocco successivo"
                aria-label="Salta intervallo"
                className="flex min-h-[48px] items-center justify-center gap-1.5 rounded-lg border border-slate-700 bg-[#07090E] text-xs font-semibold text-slate-200 hover:border-slate-500 hover:text-white"
              >
                <SkipForward className="h-4 w-4" />
                <span>Salta</span>
              </button>

              <button
                type="button"
                onClick={resetWorkout}
                title="Azzera timer"
                aria-label="Azzera timer"
                className="flex min-h-[48px] items-center justify-center gap-1.5 rounded-lg border border-slate-700 bg-[#07090E] text-xs font-semibold text-slate-200 hover:border-slate-500 hover:text-white"
              >
                <RotateCcw className="h-4 w-4" />
                <span>Reset</span>
              </button>
            </div>

            <div className="mt-3 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={handleToggleMute}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                {muted ? <VolumeX className="h-4 w-4 text-rose-400" /> : <Volume2 className="h-4 w-4 text-cyan-400" />}
                <span>{muted ? 'Audio disattivato' : 'Segnali audio attivi'}</span>
              </button>

              {elapsedMs >= 10000 && (
                <button
                  type="button"
                  onClick={() => {
                    setIsRunning(false);
                    finalizeSession(elapsedMs / 1000);
                  }}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/25"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Termina &amp; Salva</span>
                </button>
              )}
            </div>
          </div>

          {/* Interval Queue List */}
          <div className="rounded-xl border border-slate-800 bg-[#0F141D] p-4">
            <div className="mb-2.5 flex items-center justify-between text-xs">
              <span className="font-semibold text-white">Sequenza Allenamento</span>
              <span className="text-slate-400">Target zona &amp; durata</span>
            </div>
            <div className="max-h-[260px] space-y-1 overflow-y-auto pr-1">
              {intervals.map((item, idx) => {
                const isCurrent = idx === currentIntervalIndex;
                const isDone = idx < currentIntervalIndex;
                const pMeta = PHASE_META[item.step.phase];
                return (
                  <button
                    key={item.instanceId}
                    type="button"
                    onClick={() => {
                      lastIntervalIdxRef.current = idx;
                      lastCountdownBeepRef.current = -1;
                      setElapsedMs(item.startAtSec * 1000);
                    }}
                    className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-xs transition-colors min-h-[44px] ${
                      isCurrent
                        ? 'border border-cyan-500/50 bg-cyan-500/10 text-white'
                        : isDone
                        ? 'text-slate-500 hover:bg-slate-800/50'
                        : 'text-slate-300 hover:bg-slate-800/60'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium">{item.step.title}</div>
                      <div className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-400">
                        <span className={pMeta.textClass}>{pMeta.label}</span>
                        <span aria-hidden="true">·</span>
                        <span>Target Z{item.step.targetZone}</span>
                        {item.roundNumber > 0 && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>R{item.roundNumber}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <span className="font-mono-tabular shrink-0 text-slate-300">
                      {formatDuration(item.step.durationSec)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Live Biometrics + Camera Monitor */}
        <div className="flex flex-col gap-4 lg:col-span-7">
          {/* 3-Column Live Telemetry Strip */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {/* Heart Rate Card */}
            <div className="rounded-xl border border-slate-800 bg-[#0F141D] p-4">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Frequenza Cardiaca</span>
                {activeSource === 'bluetooth' ? (
                  <span className="inline-flex items-center gap-1 text-cyan-400 font-medium">
                    <BluetoothConnected className="h-3.5 w-3.5" /> BLE
                  </span>
                ) : activeSource === 'video' ? (
                  <span className="inline-flex items-center gap-1 text-rose-400 font-medium">
                    <Video className="h-3.5 w-3.5" /> rPPG
                  </span>
                ) : (
                  <span>Nessuna fonte</span>
                )}
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <Heart className="h-5 w-5 text-rose-500 shrink-0" />
                <span className="font-mono-tabular text-4xl font-bold text-white">
                  {activeBpm ?? '--'}
                </span>
                <span className="font-mono-tabular text-xs uppercase text-slate-400">BPM</span>
              </div>
              <div className={`mt-2 text-xs font-medium ${activeBpm ? currentZone.textClass : 'text-slate-500'}`}>
                {activeBpm ? currentZone.name : 'Attiva camera o fascia BLE'}
              </div>
            </div>

            {/* Movement Intensity Card */}
            <div className="rounded-xl border border-slate-800 bg-[#0F141D] p-4">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Intensità Video</span>
                <span className="font-mono-tabular">
                  {videoTelemetry ? `${videoTelemetry.cadencePerMin} mov/m` : '-- mov/m'}
                </span>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <Activity className="h-5 w-5 text-cyan-400 shrink-0" />
                <span className="font-mono-tabular text-4xl font-bold text-white">
                  {videoTelemetry ? videoTelemetry.motionIntensity : '--'}
                </span>
                <span className="font-mono-tabular text-xs uppercase text-slate-400">%</span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full bg-cyan-400 transition-all duration-150"
                  style={{ width: `${videoTelemetry?.motionIntensity ?? 0}%` }}
                />
              </div>
            </div>

            {/* Session Burn & Target Zone Card */}
            <div className="rounded-xl border border-slate-800 bg-[#0F141D] p-4">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Dispendio Stimato</span>
                <span>Target Z{currentInterval?.step.targetZone ?? 2}</span>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <Flame className="h-5 w-5 text-amber-400 shrink-0" />
                <span className="font-mono-tabular text-4xl font-bold text-white">
                  {Math.round(kcalRef.current)}
                </span>
                <span className="font-mono-tabular text-xs uppercase text-slate-400">kcal</span>
              </div>
              <div className="mt-2 flex items-center gap-1">
                {HR_ZONES.map((z) => {
                  const isActiveZone = activeBpm !== null && currentZone.id === z.id;
                  return (
                    <div
                      key={z.id}
                      className="flex-1 text-center"
                      title={z.name}
                    >
                      <div
                        className={`h-1.5 rounded-xs transition-opacity ${
                          isActiveZone ? 'opacity-100' : 'opacity-25'
                        }`}
                        style={{ backgroundColor: z.colorHex }}
                      />
                      <span
                        className={`mt-1 block font-mono-tabular text-[10px] ${
                          isActiveZone ? 'font-bold text-white' : 'text-slate-500'
                        }`}
                      >
                        Z{z.id}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Camera + Bluetooth Monitor */}
          <CameraMonitor
            onTelemetry={setVideoTelemetry}
            telemetry={videoTelemetry}
            bluetooth={bluetooth}
          />
        </div>
      </div>

      {/* Session Completion Summary Modal */}
      {completedSummary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-xl border border-slate-800 bg-[#0F141D] p-6 shadow-2xl">
            <div className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
              Allenamento Completato
            </div>
            <h3 className="font-display mt-1 text-3xl font-bold text-white">
              {completedSummary.programName}
            </h3>

            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-lg border border-slate-800 bg-[#07090E] p-3">
                <div className="text-xs text-slate-400">Durata</div>
                <div className="font-mono-tabular mt-1 text-xl font-bold text-white">
                  {formatDuration(completedSummary.durationSec)}
                </div>
              </div>
              <div className="rounded-lg border border-slate-800 bg-[#07090E] p-3">
                <div className="text-xs text-slate-400">FC Media</div>
                <div className="font-mono-tabular mt-1 text-xl font-bold text-rose-400">
                  {completedSummary.avgBpm ?? '--'}
                </div>
              </div>
              <div className="rounded-lg border border-slate-800 bg-[#07090E] p-3">
                <div className="text-xs text-slate-400">Intensità Media</div>
                <div className="font-mono-tabular mt-1 text-xl font-bold text-cyan-400">
                  {completedSummary.avgIntensity}%
                </div>
              </div>
              <div className="rounded-lg border border-slate-800 bg-[#07090E] p-3">
                <div className="text-xs text-slate-400">Calorie</div>
                <div className="font-mono-tabular mt-1 text-xl font-bold text-amber-400">
                  {completedSummary.estimatedKcal}
                </div>
              </div>
            </div>

            <div className="mt-5">
              <div className="mb-2 text-xs font-medium text-slate-300">Distribuzione Zone Cardiache</div>
              <div className="space-y-1.5">
                {HR_ZONES.map((z) => {
                  const sec = completedSummary.zoneSeconds[z.id] ?? 0;
                  const pct =
                    completedSummary.durationSec > 0
                      ? Math.round((sec / completedSummary.durationSec) * 100)
                      : 0;
                  return (
                    <div key={z.id} className="flex items-center gap-3 text-xs">
                      <span className="w-24 shrink-0 text-slate-400">{z.shortLabel}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-800">
                        <div
                          className="h-full"
                          style={{ width: `${pct}%`, backgroundColor: z.colorHex }}
                        />
                      </div>
                      <span className="font-mono-tabular w-12 text-right text-slate-300">
                        {formatDuration(sec)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setCompletedSummary(null);
                  resetWorkout();
                }}
                className="rounded-lg bg-cyan-500 px-5 py-2.5 text-sm font-semibold text-slate-950 hover:bg-cyan-400 min-h-[44px]"
              >
                Chiudi e salva nello storico
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
