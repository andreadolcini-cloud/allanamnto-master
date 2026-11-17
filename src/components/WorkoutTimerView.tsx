import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  ArrowLeft,
  Bluetooth,
  BluetoothConnected,
  Camera,
  CameraOff,
  Flame,
  Heart,
  Pause,
  PersonStanding,
  Play,
  SlidersHorizontal,
  User,
  Video,
} from 'lucide-react';
import type {
  BluetoothHRState,
  HeartRateSource,
  HeartRateZoneId,
  StepPhase,
  TelemetrySample,
  UserAccount,
  VideoTelemetry,
  WorkoutIntensity,
  WorkoutProgram,
  WorkoutSessionLog,
  WorkoutStep,
} from '../types/fitness';
import { audioCues, requestScreenWakeLock } from '../utils/audioCues';
import { filterStandingOnlySteps, inferAnimationId } from '../data/exerciseLibrary';
import {
  HR_ZONES,
  computeMaxHr,
  estimateKcalPerSecond,
  formatDuration,
  getHeartRateZone,
  getZoneBpmRange,
  scaleStepForIntensity,
} from '../utils/hrZones';
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
    label: 'Recupero · Pausa Animazione',
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
  users: UserAccount[];
  activeUser: UserAccount;
  onSelectUser: (userId: string) => void;
  selectedProgramId: string;
  onSelectProgram: (id: string) => void;
  onChangeIntensity: (level: WorkoutIntensity) => void;
  onToggleStandingOnly: (standingOnly: boolean) => void;
  videoTelemetry: VideoTelemetry | null;
  cameraActive: boolean;
  cameraError: string | null;
  onStartCamera: () => void;
  onStopCamera: () => void;
  bluetooth: BluetoothHRState & {
    connect: () => Promise<void>;
    disconnect: () => void;
  };
  onSaveSession: (session: WorkoutSessionLog) => void;
  onOpenSettings: () => void;
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
  users,
  activeUser,
  onSelectUser,
  selectedProgramId,
  onSelectProgram,
  onChangeIntensity,
  onToggleStandingOnly,
  videoTelemetry,
  cameraActive,
  cameraError,
  onStartCamera,
  onStopCamera,
  bluetooth,
  onSaveSession,
  onOpenSettings,
  todayScheduledProgramName,
}) => {
  const { programs, workoutIntensity, profile: userProfile } = activeUser;
  const standingOnly = activeUser.standingOnly ?? true;

  const activeProgram = useMemo(
    () => programs.find((p) => p.id === selectedProgramId) ?? programs[0],
    [programs, selectedProgramId]
  );

  const { filteredSteps, removedFloorCount } = useMemo(() => {
    if (!standingOnly) {
      return { filteredSteps: activeProgram.steps, removedFloorCount: 0 };
    }
    const res = filterStandingOnlySteps(activeProgram.steps);
    return { filteredSteps: res.filtered, removedFloorCount: res.removedCount };
  }, [activeProgram.steps, standingOnly]);

  const scaledProgram = useMemo(
    () => ({
      ...activeProgram,
      steps: filteredSteps.map((s) => scaleStepForIntensity(s, workoutIntensity)),
    }),
    [activeProgram, filteredSteps, workoutIntensity]
  );

  const intervals = useMemo(() => flattenProgram(scaledProgram), [scaledProgram]);
  const totalDurationSec = intervals.length > 0 ? intervals[intervals.length - 1].endAtSec : 0;
  const activeIntensityOption =
    INTENSITY_OPTIONS.find((o) => o.id === workoutIntensity) ?? INTENSITY_OPTIONS[1];

  const [workoutFullscreen, setWorkoutFullscreen] = useState(false);
  const [preStartSec, setPreStartSec] = useState<number | null>(null);
  const [countdownPaused, setCountdownPaused] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [completedSummary, setCompletedSummary] = useState<WorkoutSessionLog | null>(null);

  // Live session accumulators
  const samplesRef = useRef<TelemetrySample[]>([]);
  const zoneSecondsRef = useRef<Record<HeartRateZoneId, number>>({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 });
  const kcalRef = useRef<number>(0);
  const lastRecordedSecRef = useRef<number>(-1);
  const lastCountdownBeepRef = useRef<number>(-1);
  const lastIntervalIdxRef = useRef<number>(0);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  // Authoritative Heart Rate & Source
  const activeBpm =
    bluetooth.isConnected && bluetooth.bpm
      ? bluetooth.bpm
      : videoTelemetry?.estimatedBpm ?? null;

  const activeSource: HeartRateSource =
    bluetooth.isConnected && bluetooth.bpm
      ? 'bluetooth'
      : videoTelemetry?.estimatedBpm
      ? 'video'
      : 'none';

  const activeIntensity = videoTelemetry?.motionIntensity ?? 0;
  const currentZone = getHeartRateZone(activeBpm, userProfile);
  const maxHr = computeMaxHr(userProfile.age);

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

  const resetWorkout = useCallback(() => {
    setIsRunning(false);
    setPreStartSec(null);
    setCountdownPaused(false);
    setElapsedMs(0);
    samplesRef.current = [];
    zoneSecondsRef.current = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    kcalRef.current = 0;
    lastRecordedSecRef.current = -1;
    lastCountdownBeepRef.current = -1;
    lastIntervalIdxRef.current = 0;
  }, []);

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
      setWorkoutFullscreen(false);
    },
    [activeProgram.id, activeProgram.name, elapsedMs, onSaveSession]
  );

  // Reset when changing selected program, user, or standingOnly mode
  useEffect(() => {
    setWorkoutFullscreen(false);
    resetWorkout();
  }, [selectedProgramId, activeUser.id, standingOnly, resetWorkout]);

  // Screen Wake Lock while full-screen workout or countdown is active
  useEffect(() => {
    let active = true;
    if (workoutFullscreen && (isRunning || (preStartSec !== null && !countdownPaused))) {
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
  }, [countdownPaused, isRunning, preStartSec, workoutFullscreen]);

  // 3-Second Pre-Start Countdown Loop with Audio Ticks
  useEffect(() => {
    if (!workoutFullscreen || preStartSec === null || countdownPaused) return;

    const timer = window.setTimeout(() => {
      if (preStartSec > 1) {
        audioCues.playCountdownTick();
        setPreStartSec(preStartSec - 1);
      } else {
        setPreStartSec(null);
        setCountdownPaused(false);
        const firstPhase = intervals[0]?.step.phase ?? 'work';
        if (firstPhase === 'work') audioCues.playWorkStart();
        else audioCues.playWarmupOrCooldown();
        setIsRunning(true);
      }
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [countdownPaused, intervals, preStartSec, workoutFullscreen]);

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

        // 3-2-1 countdown cue at end of interval before next exercise starts
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

  const handleStartWorkoutFullscreen = () => {
    if (intervals.length === 0) return;
    setWorkoutFullscreen(true);
    setCountdownPaused(false);
    setPreStartSec(3);
    audioCues.playCountdownTick();
  };

  const handleTogglePauseFullscreen = () => {
    if (preStartSec !== null) {
      setCountdownPaused((p) => {
        const nextPaused = !p;
        if (!nextPaused) {
          audioCues.playCountdownTick();
        }
        return nextPaused;
      });
      return;
    }
    setIsRunning((r) => !r);
  };

  const handleReturnToMenu = () => {
    setIsRunning(false);
    setPreStartSec(null);
    setCountdownPaused(false);
    setWorkoutFullscreen(false);
    if (elapsedMs >= 10000) {
      finalizeSession(elapsedMs / 1000);
    } else {
      resetWorkout();
    }
  };

  const phaseStyle = currentInterval
    ? PHASE_META[currentInterval.step.phase]
    : PHASE_META.work;

  const isRestInterval = currentInterval?.step.phase === 'rest';
  const isCountingPreStart = preStartSec !== null;
  const isPausedState = isCountingPreStart ? countdownPaused : !isRunning;
  const animateExercise = isRunning && !isRestInterval && !isCountingPreStart;
  const transitionCountdown =
    isRunning &&
    !isCountingPreStart &&
    nextInterval !== null &&
    intervalRemainingSec > 0 &&
    intervalRemainingSec <= 3
      ? Math.ceil(intervalRemainingSec)
      : null;

  return (
    <div className="space-y-5">
      {/* MENU LAUNCHER (Pre-workout setup & sequence preview) */}
      <div className="rounded-xl border border-slate-800 bg-[#0F141D] p-4 sm:p-6">
        <div className="flex flex-col gap-4 border-b border-slate-800/80 pb-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <span>
                Utente: <strong className="text-white">{activeUser.name}</strong>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                {userProfile.age} anni · FC max {maxHr} BPM
              </span>
              {todayScheduledProgramName && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-cyan-400">Oggi: {todayScheduledProgramName}</span>
                </>
              )}
            </div>
            <h1 className="font-display mt-1 text-3xl font-bold tracking-tight text-white">
              Prepara Sessione Aerobica
            </h1>
          </div>

          {/* Quick User Switcher */}
          {users.length > 1 && (
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 shrink-0 text-cyan-400" />
              <select
                aria-label="Cambia profilo utente attivo"
                value={activeUser.id}
                onChange={(e) => onSelectUser(e.target.value)}
                className="min-h-[42px] rounded-lg border border-slate-700 bg-[#07090E] px-3 py-2 text-xs font-semibold text-white focus:border-cyan-500 focus:outline-none"
              >
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.profile.age}a)
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Program + Intensity + Standing Only + Start Action */}
        <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-5">
            <label className="block text-xs font-medium text-slate-400">Scheda Allenamento</label>
            <select
              aria-label="Seleziona programma di allenamento"
              value={activeProgram.id}
              onChange={(e) => onSelectProgram(e.target.value)}
              className="mt-1.5 min-h-[46px] w-full rounded-lg border border-slate-700 bg-[#07090E] px-3 py-2.5 text-sm font-semibold text-white focus:border-cyan-500 focus:outline-none"
            >
              {programs.map((prog) => (
                <option key={prog.id} value={prog.id}>
                  {prog.name} ({prog.category})
                </option>
              ))}
            </select>
            <p className="mt-1.5 line-clamp-2 text-xs text-slate-400">{activeProgram.description}</p>
          </div>

          <div className="lg:col-span-4">
            <div className="flex items-center justify-between gap-2 text-xs text-slate-400">
              <span>Intensità</span>
              <span className="font-medium text-cyan-400">{activeIntensityOption.hint}</span>
            </div>
            <div className="mt-1.5 grid grid-cols-3 gap-1 rounded-lg border border-slate-800 bg-[#07090E] p-1">
              {INTENSITY_OPTIONS.map((opt) => {
                const active = opt.id === workoutIntensity;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onChangeIntensity(opt.id)}
                    className={`min-h-[40px] whitespace-nowrap rounded-md px-2.5 py-2 text-xs font-semibold transition-colors ${
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

          <div className="lg:col-span-3">
            <button
              type="button"
              disabled={intervals.length === 0}
              onClick={handleStartWorkoutFullscreen}
              className="flex min-h-[52px] w-full items-center justify-center gap-2.5 rounded-lg bg-cyan-500 px-5 py-3 text-base font-bold text-slate-950 shadow-lg shadow-cyan-500/15 transition-colors hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Play className="h-5 w-5 fill-current" />
              <span>Avvia Allenamento</span>
            </button>
          </div>
        </div>

        {/* Standing-Only Mode Selector */}
        <div className="mt-5 flex flex-col gap-3 rounded-lg border border-slate-800 bg-[#07090E] p-3.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                standingOnly ? 'bg-cyan-500/15 text-cyan-400' : 'bg-slate-800 text-slate-400'
              }`}
            >
              <PersonStanding className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-semibold text-white">
                Modalità Solo Esercizi in Piedi
              </div>
              <div className="text-xs text-slate-400">
                {standingOnly
                  ? removedFloorCount > 0
                    ? `Attiva: rimossi ${removedFloorCount} esercizi a terra da questa scheda (Burpees, Plank, Mountain Climbers)`
                    : 'Attiva: nessun esercizio a terra presente in questa scheda'
                  : 'Disattivata: include anche gli esercizi in cui si scende a terra'}
              </div>
            </div>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={standingOnly}
            aria-label="Attiva o disattiva modalità solo esercizi in piedi"
            onClick={() => onToggleStandingOnly(!standingOnly)}
            className={`inline-flex min-h-[42px] shrink-0 items-center justify-center gap-2 rounded-lg border px-4 py-2 text-xs font-bold transition-colors ${
              standingOnly
                ? 'border-cyan-500/60 bg-cyan-500 text-slate-950 hover:bg-cyan-400'
                : 'border-slate-700 bg-[#0F141D] text-slate-300 hover:border-slate-500 hover:text-white'
            }`}
          >
            <span>{standingOnly ? 'Attiva (Solo in Piedi)' : 'Disattivata (Tutti)'}</span>
          </button>
        </div>

        {/* Readiness Summary Strip */}
        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-800/80 pt-4 sm:grid-cols-4">
          <div className="rounded-lg border border-slate-800 bg-[#07090E] p-3">
            <div className="text-xs text-slate-400">Durata Totale</div>
            <div className="font-mono-tabular mt-1 text-xl font-bold text-white">
              {formatDuration(totalDurationSec)}
            </div>
          </div>
          <div className="rounded-lg border border-slate-800 bg-[#07090E] p-3">
            <div className="text-xs text-slate-400">Blocchi / Round</div>
            <div className="font-mono-tabular mt-1 text-xl font-bold text-white">
              {intervals.length} · {activeProgram.rounds}R
            </div>
          </div>
          <div className="rounded-lg border border-slate-800 bg-[#07090E] p-3">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Telecamera</span>
              {cameraActive ? (
                <Camera className="h-3.5 w-3.5 text-emerald-400" />
              ) : (
                <CameraOff className="h-3.5 w-3.5 text-slate-400" />
              )}
            </div>
            <div className="mt-1.5 flex items-center justify-between gap-2">
              <span
                className={`text-sm font-semibold ${
                  cameraActive ? 'text-emerald-400' : 'text-slate-300'
                }`}
              >
                {cameraActive ? 'Attiva' : 'Spenta'}
              </span>
              <button
                type="button"
                onClick={cameraActive ? onStopCamera : onStartCamera}
                className={`min-h-[34px] rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                  cameraActive
                    ? 'border border-rose-500/40 bg-rose-500/15 text-rose-300 hover:bg-rose-500/25'
                    : 'bg-cyan-500 text-slate-950 hover:bg-cyan-400'
                }`}
              >
                {cameraActive ? 'Disattiva' : 'Attiva'}
              </button>
            </div>
          </div>
          <div className="rounded-lg border border-slate-800 bg-[#07090E] p-3">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Fascia BLE</span>
              <Bluetooth className="h-3.5 w-3.5 text-slate-400" />
            </div>
            <div className="mt-1.5 flex items-center justify-between gap-2">
              <span
                className={`truncate text-sm font-semibold ${
                  bluetooth.isConnected ? 'text-cyan-400' : 'text-slate-300'
                }`}
              >
                {bluetooth.isConnected ? bluetooth.deviceName || 'Connessa' : 'Non connessa'}
              </span>
              {bluetooth.isSupported && (
                <button
                  type="button"
                  disabled={bluetooth.isConnecting}
                  onClick={bluetooth.isConnected ? bluetooth.disconnect : () => void bluetooth.connect()}
                  className={`min-h-[34px] shrink-0 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors disabled:opacity-50 ${
                    bluetooth.isConnected
                      ? 'border border-slate-700 bg-[#0F141D] text-slate-200 hover:border-slate-500'
                      : 'border border-cyan-500/40 bg-cyan-500/15 text-cyan-300 hover:bg-cyan-500/25'
                  }`}
                >
                  {bluetooth.isConnecting ? '...' : bluetooth.isConnected ? 'Scollega' : 'Collega'}
                </button>
              )}
            </div>
          </div>
        </div>

        {cameraError && (
          <div className="mt-3 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
            {cameraError}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="text-slate-400">
            Prima della partenza parte un conto alla rovescia sonoro di 3 secondi; l’allenamento prosegue a pieno schermo.
          </span>
          <button
            type="button"
            onClick={onOpenSettings}
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-700 bg-[#07090E] px-3 py-2 text-xs font-semibold text-slate-200 hover:border-cyan-500/60 hover:text-white"
          >
            <SlidersHorizontal className="h-3.5 w-3.5 text-cyan-400" />
            <span>Configura Sensori &amp; Profilo in Impostazioni</span>
          </button>
        </div>
      </div>

      {/* Sequence Preview Card */}
      <div className="rounded-xl border border-slate-800 bg-[#0F141D] p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-2xl font-bold text-white">Sequenza Esercizi</h2>
          <span className="text-xs text-slate-400">
            {activeProgram.name} · {activeIntensityOption.label}
            {standingOnly ? ' · Solo in piedi' : ''}
          </span>
        </div>

        {intervals.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-700 bg-[#07090E] p-6 text-center text-xs text-slate-400">
            Tutti gli esercizi di questa scheda sono a terra. Disattiva la modalità “Solo esercizi in piedi” oppure scegli un’altra scheda.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {intervals.map((item, idx) => {
              const pMeta = PHASE_META[item.step.phase];
              const range = getZoneBpmRange(item.step.targetZone, userProfile);
              return (
                <div
                  key={item.instanceId}
                  className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-[#07090E] px-3 py-2.5 text-xs"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <ExerciseAnimation
                      animationId={
                        item.step.animationId ??
                        inferAnimationId(item.step.title, item.step.phase)
                      }
                      active={false}
                      accentColor={pMeta.hex}
                      size="sm"
                    />
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-white">
                        {idx + 1}. {item.step.title}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
                        <span className={pMeta.textClass}>{pMeta.label}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono-tabular">
                          Z{item.step.targetZone} ({range.min}–{range.max})
                        </span>
                      </div>
                    </div>
                  </div>
                  <span className="font-mono-tabular shrink-0 font-semibold text-slate-200">
                    {formatDuration(item.step.durationSec)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* FULL-SCREEN ACTIVE WORKOUT MODE */}
      {workoutFullscreen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Allenamento a pieno schermo"
          className="fixed inset-0 z-50 flex flex-col justify-between overflow-y-auto bg-[#07090E] px-4 py-4 sm:px-8 sm:py-6"
        >
          {/* Top Metadata Strip (no extra buttons) */}
          <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-3 text-xs sm:text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-white">{activeProgram.name}</span>
              <span aria-hidden="true" className="text-slate-600">
                ·
              </span>
              <span
                className={`font-semibold uppercase tracking-wider ${
                  isCountingPreStart ? 'text-amber-400' : phaseStyle.textClass
                }`}
              >
                {isCountingPreStart ? 'Conto alla rovescia iniziale' : phaseStyle.label}
              </span>
            </div>
            <div className="font-mono-tabular text-slate-300">
              {currentInterval && currentInterval.roundNumber > 0
                ? `Round ${currentInterval.roundNumber}/${currentInterval.totalRounds}`
                : `Blocco ${currentIntervalIndex + 1}/${intervals.length}`}{' '}
              · Target Z{currentInterval?.step.targetZone ?? 2} (
              {(() => {
                const r = getZoneBpmRange(currentInterval?.step.targetZone ?? 2, userProfile);
                return `${r.min}–${r.max} BPM`;
              })()}
              )
            </div>
          </div>

          {/* Center Core: Large Animation + Giant Timer / 3-2-1 Countdown + Interval Progress */}
          <div className="mx-auto my-auto flex w-full max-w-5xl flex-col items-center justify-center gap-5 py-3">
            <div className="flex w-full flex-col items-center justify-center gap-5 md:flex-row md:gap-10">
              <div className="flex flex-col items-center">
                <ExerciseAnimation
                  animationId={
                    currentInterval
                      ? currentInterval.step.animationId ??
                        inferAnimationId(currentInterval.step.title, currentInterval.step.phase)
                      : 'warmup-march'
                  }
                  active={animateExercise}
                  accentColor={phaseStyle.hex}
                  speedMultiplier={activeIntensityOption.speed}
                  size="xl"
                />
                {isCountingPreStart && (
                  <span className="mt-2 text-xs font-semibold uppercase tracking-wider text-amber-400">
                    Posizionati · Avvio tra {preStartSec}s
                  </span>
                )}
                {!isCountingPreStart && isRestInterval && (
                  <span className="mt-2 text-xs font-semibold uppercase tracking-wider text-amber-400">
                    Intervallo di recupero · Animazione ferma
                  </span>
                )}
              </div>

              <div className="flex flex-col items-center text-center md:items-start md:text-left">
                {isCountingPreStart ? (
                  <>
                    <div className="text-xs font-semibold uppercase tracking-widest text-amber-400 sm:text-sm">
                      Preparati ad iniziare
                    </div>
                    <h2 className="font-display mt-1 text-4xl font-bold tracking-tight text-white sm:text-5xl">
                      {currentInterval?.step.title ?? 'Pronto'}
                    </h2>
                    <div className="mt-4 flex items-baseline gap-4">
                      <div className="font-mono-tabular text-8xl font-bold leading-none tracking-tight text-amber-400 sm:text-9xl">
                        {preStartSec}
                      </div>
                      <div className="text-left text-xs text-slate-400 sm:text-sm">
                        {countdownPaused ? 'Conto alla rovescia in pausa' : 'Partenza automatica al termine'}
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <h2 className="font-display text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl">
                      {currentInterval?.step.title ?? 'Pronto'}
                    </h2>
                    {currentInterval?.step.notes && (
                      <p className="mt-1.5 max-w-md text-xs text-slate-400 sm:text-sm">
                        {currentInterval.step.notes}
                      </p>
                    )}

                    <div className="mt-4 flex items-baseline gap-5">
                      <div
                        className={`font-mono-tabular text-7xl font-bold leading-none tracking-tight sm:text-8xl ${
                          transitionCountdown !== null ? 'text-amber-400' : 'text-white'
                        }`}
                      >
                        {formatDuration(Math.ceil(intervalRemainingSec))}
                      </div>
                      <div className="text-left">
                        <div className="text-[11px] uppercase tracking-wider text-slate-400">
                          Totale
                        </div>
                        <div className="font-mono-tabular text-lg font-bold text-slate-200 sm:text-xl">
                          {formatDuration(elapsedSecFloat)} / {formatDuration(totalDurationSec)}
                        </div>
                      </div>
                    </div>

                    {nextInterval && (
                      <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-xs text-slate-400 md:justify-start">
                        <span>
                          Prossimo:{' '}
                          <span className="font-semibold text-slate-200">
                            {nextInterval.step.title}
                          </span>{' '}
                          ({formatDuration(nextInterval.step.durationSec)})
                        </span>
                        {transitionCountdown !== null && (
                          <span className="font-mono-tabular font-bold text-amber-400">
                            · Tra {transitionCountdown}…
                          </span>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Interval & Total Progress Bars */}
            <div className="w-full space-y-2.5">
              <div>
                <div className="mb-1 flex justify-between text-xs font-medium text-slate-300">
                  <span>Avanzamento intervallo</span>
                  <span className="font-mono-tabular">
                    {isCountingPreStart ? '0%' : `${Math.round(intervalProgressPct)}%`}
                  </span>
                </div>
                <div className="h-3 w-full overflow-hidden rounded-full bg-slate-800">
                  <div
                    className={`h-full transition-all duration-100 ${phaseStyle.barClass}`}
                    style={{ width: isCountingPreStart ? '0%' : `${intervalProgressPct}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="mb-1 flex justify-between text-[11px] text-slate-400">
                  <span>Avanzamento allenamento</span>
                  <span className="font-mono-tabular">
                    {isCountingPreStart ? '0%' : `${Math.round(totalProgressPct)}%`}
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full bg-slate-300 transition-all duration-150"
                    style={{ width: isCountingPreStart ? '0%' : `${totalProgressPct}%` }}
                  />
                </div>
              </div>
            </div>

            {/* 3 Live Biometric Cards: Frequenza Cardiaca, Intensità, Dispendio Stimato */}
            <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-3">
              {/* Heart Rate */}
              <div className="rounded-xl border border-slate-800 bg-[#0F141D] p-4">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Frequenza Cardiaca</span>
                  {activeSource === 'bluetooth' ? (
                    <span className="inline-flex items-center gap-1 font-medium text-cyan-400">
                      <BluetoothConnected className="h-3.5 w-3.5" /> BLE
                    </span>
                  ) : activeSource === 'video' ? (
                    <span className="inline-flex items-center gap-1 font-medium text-rose-400">
                      <Video className="h-3.5 w-3.5" /> rPPG
                    </span>
                  ) : (
                    <span>In attesa</span>
                  )}
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <Heart className="h-5 w-5 shrink-0 text-rose-500" />
                  <span className="font-mono-tabular text-4xl font-bold text-white">
                    {activeBpm ?? '--'}
                  </span>
                  <span className="font-mono-tabular text-xs uppercase text-slate-400">BPM</span>
                </div>
                <div
                  className={`mt-1.5 text-xs font-medium ${
                    activeBpm ? currentZone.textClass : 'text-slate-500'
                  }`}
                >
                  {activeBpm ? currentZone.name : 'Sensore non attivo'}
                </div>
              </div>

              {/* Intensity */}
              <div className="rounded-xl border border-slate-800 bg-[#0F141D] p-4">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Intensità</span>
                  <span className="font-mono-tabular">
                    {videoTelemetry ? `${videoTelemetry.cadencePerMin} mov/m` : '-- mov/m'}
                  </span>
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <Activity className="h-5 w-5 shrink-0 text-cyan-400" />
                  <span className="font-mono-tabular text-4xl font-bold text-white">
                    {videoTelemetry ? videoTelemetry.motionIntensity : '--'}
                  </span>
                  <span className="font-mono-tabular text-xs uppercase text-slate-400">%</span>
                </div>
                <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full bg-cyan-400 transition-all duration-150"
                    style={{ width: `${videoTelemetry?.motionIntensity ?? 0}%` }}
                  />
                </div>
              </div>

              {/* Estimated Energy Burn */}
              <div className="rounded-xl border border-slate-800 bg-[#0F141D] p-4">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Dispendio Stimato</span>
                  <span>{activeIntensityOption.label}</span>
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <Flame className="h-5 w-5 shrink-0 text-amber-400" />
                  <span className="font-mono-tabular text-4xl font-bold text-white">
                    {Math.round(kcalRef.current)}
                  </span>
                  <span className="font-mono-tabular text-xs uppercase text-slate-400">kcal</span>
                </div>
                <div className="mt-1.5 text-xs text-slate-400">
                  Calcolato su {userProfile.weightKg} kg · {userProfile.age} anni
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Controls: STRICTLY ONLY TWO BUTTONS (Pausa/Riprendi & Torna al menu) */}
          <div className="mx-auto grid w-full max-w-5xl grid-cols-2 gap-3 border-t border-slate-800/80 pt-3">
            <button
              type="button"
              onClick={handleTogglePauseFullscreen}
              className={`flex min-h-[54px] items-center justify-center gap-2 rounded-xl text-base font-bold transition-colors ${
                isPausedState
                  ? 'bg-cyan-500 text-slate-950 hover:bg-cyan-400'
                  : 'bg-amber-500 text-slate-950 hover:bg-amber-400'
              }`}
            >
              {isPausedState ? <Play className="h-5 w-5" /> : <Pause className="h-5 w-5" />}
              <span>{isPausedState ? 'Riprendi' : 'Pausa'}</span>
            </button>

            <button
              type="button"
              onClick={handleReturnToMenu}
              className="flex min-h-[54px] items-center justify-center gap-2 rounded-xl border border-slate-700 bg-[#0F141D] text-base font-bold text-slate-100 transition-colors hover:border-slate-500 hover:bg-slate-800"
            >
              <ArrowLeft className="h-5 w-5" />
              <span>Torna al menu</span>
            </button>
          </div>
        </div>
      )}

      {/* Session Completion Summary Modal */}
      {completedSummary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-xl border border-slate-800 bg-[#0F141D] p-6 shadow-2xl">
            <div className="flex items-center gap-4">
              <img
                src="/assets/aistudio/Designer1_6722ae60.png"
                alt="Logo Rafting Team Ivrea River Stones"
                referrerPolicy="no-referrer"
                className="h-14 w-14 shrink-0 rounded-lg border border-slate-800 bg-[#07090E] p-1 object-contain"
              />
              <div className="min-w-0">
                <div className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
                  Allenamento Completato · {activeUser.name}
                </div>
                <h3 className="font-display mt-0.5 truncate text-3xl font-bold text-white">
                  {completedSummary.programName}
                </h3>
              </div>
            </div>

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
              <div className="mb-2 text-xs font-medium text-slate-300">
                Distribuzione Zone Cardiache
              </div>
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
                className="min-h-[44px] rounded-lg bg-cyan-500 px-5 py-2.5 text-sm font-semibold text-slate-950 hover:bg-cyan-400"
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
