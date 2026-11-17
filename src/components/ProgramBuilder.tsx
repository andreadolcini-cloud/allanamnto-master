import React, { useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Calendar,
  Copy,
  Play,
  Plus,
  Save,
  Trash2,
} from 'lucide-react';
import { EXERCISE_LIBRARY, inferAnimationId } from '../data/exerciseLibrary';
import type {
  ExerciseAnimationId,
  HeartRateZoneId,
  StepPhase,
  WeekdayKey,
  WeeklySchedule,
  WorkoutProgram,
  WorkoutStep,
} from '../types/fitness';
import { WEEKDAYS, formatDuration, getProgramTotalDuration, getTodayWeekdayKey } from '../utils/hrZones';
import { ExerciseAnimation } from './ExerciseAnimation';

interface ProgramBuilderProps {
  programs: WorkoutProgram[];
  onSaveProgram: (program: WorkoutProgram) => void;
  onDeleteProgram: (id: string) => void;
  schedule: WeeklySchedule;
  onUpdateSchedule: (day: WeekdayKey, programId: string | null) => void;
  onStartProgram: (programId: string) => void;
}

const CATEGORIES: WorkoutProgram['category'][] = [
  'HIIT',
  'Tabata',
  'Resistenza',
  'Mobilità & Cardio',
];

const PHASES: { value: StepPhase; label: string }[] = [
  { value: 'warmup', label: 'Riscaldamento' },
  { value: 'work', label: 'Lavoro' },
  { value: 'rest', label: 'Recupero' },
  { value: 'cooldown', label: 'Defaticamento' },
];

export const ProgramBuilder: React.FC<ProgramBuilderProps> = ({
  programs,
  onSaveProgram,
  onDeleteProgram,
  schedule,
  onUpdateSchedule,
  onStartProgram,
}) => {
  const todayKey = getTodayWeekdayKey();
  const [editing, setEditing] = useState<WorkoutProgram | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);

  const createEmptyProgram = (firstExercise?: (typeof EXERCISE_LIBRARY)[number]): WorkoutProgram => ({
    id: `prog-${Date.now()}`,
    name: firstExercise ? `Circuito ${firstExercise.title}` : 'Nuovo Potenziamento Aerobico',
    category: 'HIIT',
    description: 'Sequenza aerobica variata per migliorare resistenza e capacità cardiorespiratoria.',
    rounds: 3,
    createdAt: new Date().toISOString(),
    steps: [
      {
        id: `s-${Date.now()}-1`,
        title: 'Marcia & Mobilità Spalle',
        phase: 'warmup',
        durationSec: 60,
        targetZone: 1,
        animationId: 'warmup-march',
      },
      {
        id: `s-${Date.now()}-2`,
        title: firstExercise ? firstExercise.title : 'Jumping Jacks',
        phase: firstExercise ? firstExercise.defaultPhase : 'work',
        durationSec: firstExercise ? firstExercise.defaultDurationSec : 35,
        targetZone: firstExercise ? firstExercise.defaultZone : 3,
        animationId: firstExercise ? firstExercise.animationId : 'jumping-jacks',
        notes: firstExercise?.cue,
      },
      {
        id: `s-${Date.now()}-3`,
        title: 'Recupero Attivo',
        phase: 'rest',
        durationSec: 15,
        targetZone: 2,
        animationId: 'breathing-cooldown',
      },
      {
        id: `s-${Date.now()}-4`,
        title: 'Defaticamento & Respiro',
        phase: 'cooldown',
        durationSec: 60,
        targetZone: 1,
        animationId: 'breathing-cooldown',
      },
    ],
  });

  const handleDuplicate = (prog: WorkoutProgram) => {
    const copy: WorkoutProgram = {
      ...prog,
      id: `prog-${Date.now()}`,
      name: `${prog.name} (Copia)`,
      createdAt: new Date().toISOString(),
      steps: prog.steps.map((s, idx) => ({ ...s, id: `s-${Date.now()}-${idx}` })),
    };
    onSaveProgram(copy);
    setEditing(copy);
  };

  const handleAddStep = () => {
    if (!editing) return;
    const newStep: WorkoutStep = {
      id: `step-${Date.now()}`,
      title: 'Skip Alto (Corsa sul Posto)',
      phase: 'work',
      durationSec: 30,
      targetZone: 4,
      animationId: 'high-knees',
    };
    setEditing({ ...editing, steps: [...editing.steps, newStep] });
  };

  const handleInsertFromLibrary = (item: (typeof EXERCISE_LIBRARY)[number]) => {
    if (!editing) {
      setEditing(createEmptyProgram(item));
      return;
    }

    const newStep: WorkoutStep = {
      id: `step-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: item.title,
      phase: item.defaultPhase,
      durationSec: item.defaultDurationSec,
      targetZone: item.defaultZone,
      animationId: item.animationId,
      notes: item.cue,
    };

    // Insert before final cooldown if one exists
    const lastIdx = editing.steps.length - 1;
    if (lastIdx >= 0 && editing.steps[lastIdx].phase === 'cooldown') {
      const next = [...editing.steps];
      next.splice(lastIdx, 0, newStep);
      setEditing({ ...editing, steps: next });
    } else {
      setEditing({ ...editing, steps: [...editing.steps, newStep] });
    }
  };

  const handleUpdateStep = (index: number, patch: Partial<WorkoutStep>) => {
    if (!editing) return;
    const nextSteps = editing.steps.map((s, i) => (i === index ? { ...s, ...patch } : s));
    setEditing({ ...editing, steps: nextSteps });
  };

  const handleMoveStep = (index: number, dir: -1 | 1) => {
    if (!editing) return;
    const target = index + dir;
    if (target < 0 || target >= editing.steps.length) return;
    const nextSteps = [...editing.steps];
    const [removed] = nextSteps.splice(index, 1);
    nextSteps.splice(target, 0, removed);
    setEditing({ ...editing, steps: nextSteps });
  };

  const handleRemoveStep = (index: number) => {
    if (!editing || editing.steps.length <= 1) return;
    setEditing({
      ...editing,
      steps: editing.steps.filter((_, i) => i !== index),
    });
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    onSaveProgram({
      ...editing,
      name: editing.name.trim() || 'Allenamento Senza Nome',
      rounds: Math.max(1, Math.min(20, editing.rounds)),
    });
    setSavedNotice(true);
    window.setTimeout(() => setSavedNotice(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Weekly Schedule Planner */}
      <section className="rounded-xl border border-slate-800 bg-[#0F141D] p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-cyan-400" />
            <h2 className="font-display text-2xl font-bold tracking-tight text-white">
              Programmazione Settimanale · Potenziamento Aerobico
            </h2>
          </div>
          <span className="text-xs text-slate-400">
            Alterna base aerobica Z2, circuiti misti Z3–Z4 e picchi VO2max
          </span>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-7">
          {WEEKDAYS.map((day) => {
            const isToday = day.key === todayKey;
            const assignedId = schedule[day.key] ?? '';
            const assignedProg = programs.find((p) => p.id === assignedId) ?? null;

            return (
              <div
                key={day.key}
                className={`flex flex-col justify-between rounded-lg border p-3 ${
                  isToday
                    ? 'border-cyan-500/60 bg-cyan-500/10'
                    : 'border-slate-800 bg-[#07090E]'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between text-xs">
                    <span className={`font-semibold ${isToday ? 'text-cyan-300' : 'text-slate-200'}`}>
                      {day.label}
                    </span>
                    {isToday && <span className="text-[11px] font-semibold text-cyan-400">Oggi</span>}
                  </div>

                  <select
                    aria-label={`Allenamento di ${day.label}`}
                    value={assignedProg ? assignedProg.id : ''}
                    onChange={(e) => onUpdateSchedule(day.key, e.target.value || null)}
                    className="mt-2 w-full rounded-md border border-slate-800 bg-[#0F141D] px-2 py-2 text-xs text-slate-200 focus:border-cyan-500 focus:outline-none min-h-[40px]"
                  >
                    <option value="">Riposo</option>
                    {programs.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                {assignedProg && (
                  <button
                    type="button"
                    onClick={() => onStartProgram(assignedProg.id)}
                    className="mt-2.5 inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-cyan-500 hover:text-slate-950 transition-colors min-h-[36px]"
                  >
                    <Play className="h-3 w-3" />
                    <span>Avvia ({formatDuration(getProgramTotalDuration(assignedProg))})</span>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Program Library & Editor Split */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Saved Programs List */}
        <div className="space-y-3 lg:col-span-5">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-2xl font-bold tracking-tight text-white">
              Schede Aerobiche ({programs.length})
            </h2>
            <button
              type="button"
              onClick={() => setEditing(createEmptyProgram())}
              className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-500 px-3.5 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-400 min-h-[40px]"
            >
              <Plus className="h-4 w-4" />
              <span>Nuova Scheda</span>
            </button>
          </div>

          <div className="space-y-2.5">
            {programs.map((prog) => {
              const totalSec = getProgramTotalDuration(prog);
              const isSelectedForEdit = editing?.id === prog.id;
              const workSteps = prog.steps.filter((s) => s.phase === 'work');

              return (
                <div
                  key={prog.id}
                  className={`rounded-xl border p-4 transition-colors ${
                    isSelectedForEdit
                      ? 'border-cyan-500/60 bg-[#121A26]'
                      : 'border-slate-800 bg-[#0F141D]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                        <span className="text-cyan-400 font-medium">{prog.category}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono-tabular">{formatDuration(totalSec)}</span>
                        <span aria-hidden="true">·</span>
                        <span>{workSteps.length} esercizi × {prog.rounds} round</span>
                      </div>
                      <h3 className="mt-1 truncate text-base font-semibold text-white">
                        {prog.name}
                      </h3>
                      <p className="mt-1 line-clamp-2 text-xs text-slate-400">
                        {prog.description}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3.5 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onStartProgram(prog.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-cyan-400 min-h-[38px]"
                    >
                      <Play className="h-3.5 w-3.5" />
                      <span>Avvia Timer</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setEditing(structuredClone(prog))}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-[#07090E] px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-slate-500 hover:text-white min-h-[38px]"
                    >
                      <span>Modifica</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDuplicate(prog)}
                      aria-label={`Duplica ${prog.name}`}
                      className="inline-flex items-center justify-center rounded-lg border border-slate-800 bg-[#07090E] p-2 text-slate-400 hover:text-white min-h-[38px] min-w-[38px]"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>

                    {programs.length > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          if (editing?.id === prog.id) setEditing(null);
                          onDeleteProgram(prog.id);
                        }}
                        aria-label={`Elimina ${prog.name}`}
                        className="inline-flex items-center justify-center rounded-lg border border-slate-800 bg-[#07090E] p-2 text-slate-400 hover:border-rose-500/40 hover:text-rose-400 min-h-[38px] min-w-[38px]"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Program Step Editor */}
        <div className="lg:col-span-7">
          {editing ? (
            <form
              onSubmit={handleSave}
              className="rounded-xl border border-slate-800 bg-[#0F141D] p-5 space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
                <div>
                  <h3 className="font-display text-2xl font-bold text-white">
                    Editor Scheda Aerobica
                  </h3>
                  <p className="text-xs text-slate-400">
                    Durata totale calcolata:{' '}
                    <span className="font-mono-tabular font-semibold text-cyan-400">
                      {formatDuration(getProgramTotalDuration(editing))}
                    </span>
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {savedNotice && (
                    <span className="text-xs font-medium text-emerald-400">Salvato!</span>
                  )}
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-400 min-h-[40px]"
                  >
                    <Save className="h-4 w-4" />
                    <span>Salva Scheda</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-300">Nome Scheda</label>
                  <input
                    type="text"
                    required
                    value={editing.name}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-[#07090E] px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none min-h-[42px]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300">Tipologia</label>
                  <select
                    value={editing.category}
                    onChange={(e) =>
                      setEditing({ ...editing, category: e.target.value as WorkoutProgram['category'] })
                    }
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-[#07090E] px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none min-h-[42px]"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300">Round (Lavoro/Rec.)</label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={editing.rounds}
                    onChange={(e) =>
                      setEditing({ ...editing, rounds: Math.max(1, Number(e.target.value) || 1) })
                    }
                    className="font-mono-tabular mt-1 w-full rounded-lg border border-slate-700 bg-[#07090E] px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none min-h-[42px]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300">Descrizione</label>
                <input
                  type="text"
                  value={editing.description}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-[#07090E] px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none min-h-[42px]"
                />
              </div>

              {/* Steps List */}
              <div className="space-y-2.5 pt-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-200">
                    Blocchi &amp; Sequenza ({editing.steps.length})
                  </span>
                  <button
                    type="button"
                    onClick={handleAddStep}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-700 bg-[#07090E] px-3 py-1.5 text-xs font-medium text-cyan-300 hover:border-cyan-500/50 min-h-[36px]"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Aggiungi Blocco</span>
                  </button>
                </div>

                {editing.steps.map((step, idx) => {
                  const animId = step.animationId ?? inferAnimationId(step.title, step.phase);
                  return (
                    <div
                      key={step.id}
                      className="flex flex-col gap-3 rounded-lg border border-slate-800 bg-[#07090E] p-3 sm:flex-row sm:items-end"
                    >
                      <ExerciseAnimation animationId={animId} active={true} size="sm" />

                      <div className="grid flex-1 grid-cols-1 gap-2.5 sm:grid-cols-12 sm:items-end">
                        <div className="sm:col-span-4">
                          <label className="block text-[11px] text-slate-400">Esercizio</label>
                          <input
                            type="text"
                            required
                            value={step.title}
                            onChange={(e) => handleUpdateStep(idx, { title: e.target.value })}
                            className="mt-1 w-full rounded-md border border-slate-800 bg-[#0F141D] px-2.5 py-1.5 text-xs text-white focus:border-cyan-500 focus:outline-none min-h-[38px]"
                          />
                        </div>

                        <div className="sm:col-span-3">
                          <label className="block text-[11px] text-slate-400">Animazione</label>
                          <select
                            value={animId}
                            onChange={(e) =>
                              handleUpdateStep(idx, {
                                animationId: e.target.value as ExerciseAnimationId,
                              })
                            }
                            className="mt-1 w-full rounded-md border border-slate-800 bg-[#0F141D] px-2 py-1.5 text-xs text-white focus:border-cyan-500 focus:outline-none min-h-[38px]"
                          >
                            {EXERCISE_LIBRARY.map((lib) => (
                              <option key={lib.animationId} value={lib.animationId}>
                                {lib.title}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="sm:col-span-2">
                          <label className="block text-[11px] text-slate-400">Fase</label>
                          <select
                            value={step.phase}
                            onChange={(e) =>
                              handleUpdateStep(idx, { phase: e.target.value as StepPhase })
                            }
                            className="mt-1 w-full rounded-md border border-slate-800 bg-[#0F141D] px-2 py-1.5 text-xs text-white focus:border-cyan-500 focus:outline-none min-h-[38px]"
                          >
                            {PHASES.map((p) => (
                              <option key={p.value} value={p.value}>
                                {p.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="grid grid-cols-2 gap-2 sm:col-span-3">
                          <div>
                            <label className="block text-[11px] text-slate-400">Sec</label>
                            <input
                              type="number"
                              min={5}
                              max={3600}
                              value={step.durationSec}
                              onChange={(e) =>
                                handleUpdateStep(idx, {
                                  durationSec: Math.max(5, Number(e.target.value) || 5),
                                })
                              }
                              className="font-mono-tabular mt-1 w-full rounded-md border border-slate-800 bg-[#0F141D] px-2 py-1.5 text-xs text-white focus:border-cyan-500 focus:outline-none min-h-[38px]"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] text-slate-400">Zona</label>
                            <select
                              value={step.targetZone}
                              onChange={(e) =>
                                handleUpdateStep(idx, {
                                  targetZone: Number(e.target.value) as HeartRateZoneId,
                                })
                              }
                              className="font-mono-tabular mt-1 w-full rounded-md border border-slate-800 bg-[#0F141D] px-2 py-1.5 text-xs text-white focus:border-cyan-500 focus:outline-none min-h-[38px]"
                            >
                              {[1, 2, 3, 4, 5].map((z) => (
                                <option key={z} value={z}>
                                  Z{z}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-end gap-1 shrink-0">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => handleMoveStep(idx, -1)}
                          aria-label="Sposta su"
                          className="flex h-9 w-9 items-center justify-center rounded border border-slate-800 text-slate-400 hover:text-white disabled:opacity-30"
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === editing.steps.length - 1}
                          onClick={() => handleMoveStep(idx, 1)}
                          aria-label="Sposta giù"
                          className="flex h-9 w-9 items-center justify-center rounded border border-slate-800 text-slate-400 hover:text-white disabled:opacity-30"
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={editing.steps.length <= 1}
                          onClick={() => handleRemoveStep(idx)}
                          aria-label="Rimuovi blocco"
                          className="flex h-9 w-9 items-center justify-center rounded border border-slate-800 text-slate-400 hover:text-rose-400 disabled:opacity-30"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </form>
          ) : (
            <div className="flex h-full min-h-[260px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-800 bg-[#0F141D]/60 p-8 text-center">
              <p className="text-sm font-semibold text-slate-200">
                Seleziona una scheda da modificare oppure aggiungi esercizi dalla libreria qui sotto
              </p>
              <p className="mt-1 max-w-md text-xs text-slate-400">
                Ogni esercizio include un&apos;animazione dimostrativa e un target di zona cardiaca per il potenziamento aerobico.
              </p>
              <button
                type="button"
                onClick={() => setEditing(createEmptyProgram())}
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-cyan-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-400 min-h-[42px]"
              >
                <Plus className="h-4 w-4" />
                <span>Crea Nuova Scheda</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Animated Exercise Catalog for Potenziamento Aerobico */}
      <section className="rounded-xl border border-slate-800 bg-[#0F141D] p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
          <div>
            <h2 className="font-display text-2xl font-bold tracking-tight text-white">
              Libreria Esercizi con Animazione
            </h2>
            <p className="text-xs text-slate-400">
              Movimenti selezionati per il potenziamento aerobico: clicca &quot;Inserisci&quot; per aggiungerli in sequenza alla scheda.
            </p>
          </div>
          <span className="text-xs text-cyan-400 font-medium">
            {editing ? `Inserimento in: ${editing.name}` : 'Clicca per creare una nuova sequenza'}
          </span>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {EXERCISE_LIBRARY.map((item) => (
            <div
              key={item.animationId}
              className="flex items-start gap-3.5 rounded-lg border border-slate-800 bg-[#07090E] p-3.5"
            >
              <ExerciseAnimation
                animationId={item.animationId}
                active={true}
                accentColor={
                  item.defaultPhase === 'warmup'
                    ? '#10B981'
                    : item.defaultPhase === 'cooldown'
                    ? '#94A3B8'
                    : '#06B6D4'
                }
                size="md"
              />

              <div className="flex min-w-0 flex-1 flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 text-[11px] text-slate-400">
                    <span className="text-cyan-400 font-medium">{item.focus}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono-tabular">
                      {item.defaultDurationSec}s · Z{item.defaultZone}
                    </span>
                  </div>
                  <h3 className="mt-0.5 text-sm font-semibold text-white">{item.title}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-slate-400">{item.cue}</p>
                </div>

                <div className="mt-2.5">
                  <button
                    type="button"
                    onClick={() => handleInsertFromLibrary(item)}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-cyan-300 hover:border-cyan-500/50 hover:bg-cyan-500/15 min-h-[36px]"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>{editing ? 'Inserisci in scheda' : 'Crea sequenza con questo'}</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
