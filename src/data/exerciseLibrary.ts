import type { ExerciseAnimationId, HeartRateZoneId, StepPhase } from '../types/fitness';

export interface ExerciseTemplate {
  animationId: ExerciseAnimationId;
  title: string;
  defaultPhase: StepPhase;
  defaultDurationSec: number;
  defaultZone: HeartRateZoneId;
  focus: string;
  cue: string;
}

export const EXERCISE_LIBRARY: ExerciseTemplate[] = [
  {
    animationId: 'jumping-jacks',
    title: 'Jumping Jacks',
    defaultPhase: 'work',
    defaultDurationSec: 30,
    defaultZone: 3,
    focus: 'Cardio full-body',
    cue: 'Apri gambe e porta le braccia sopra la testa in modo fluido e ritmato.',
  },
  {
    animationId: 'high-knees',
    title: 'Skip Alto (Corsa sul Posto)',
    defaultPhase: 'work',
    defaultDurationSec: 30,
    defaultZone: 4,
    focus: 'Frequenza & agilità',
    cue: 'Solleva le ginocchia al livello del bacino alternando il movimento delle braccia.',
  },
  {
    animationId: 'mountain-climbers',
    title: 'Mountain Climbers',
    defaultPhase: 'work',
    defaultDurationSec: 35,
    defaultZone: 4,
    focus: 'Core & cardio',
    cue: 'Mani sotto le spalle in plank e porta le ginocchia verso il petto in alternanza.',
  },
  {
    animationId: 'squat-jump',
    title: 'Squat & Jump',
    defaultPhase: 'work',
    defaultDurationSec: 30,
    defaultZone: 4,
    focus: 'Potenza gambe',
    cue: 'Scendi in squat controllato e spingi verso l’alto atterrando morbido sugli avampiedi.',
  },
  {
    animationId: 'burpees',
    title: 'Burpees',
    defaultPhase: 'work',
    defaultDurationSec: 30,
    defaultZone: 5,
    focus: 'Massima intensità',
    cue: 'Appoggia le mani a terra, stendi le gambe in plank, richiama i piedi e salta in alto.',
  },
  {
    animationId: 'shadow-boxing',
    title: 'Shadow Boxing Jab-Cross',
    defaultPhase: 'work',
    defaultDurationSec: 45,
    defaultZone: 3,
    focus: 'Braccia & ritmo',
    cue: 'Guardia alta, ruota leggermente il busto ad ogni jab e diretto mantenendo il passo.',
  },
  {
    animationId: 'skater-hops',
    title: 'Pattinatori Laterali',
    defaultPhase: 'work',
    defaultDurationSec: 35,
    defaultZone: 3,
    focus: 'Equilibrio & glutei',
    cue: 'Balza lateralmente da un piede all’altro incrociando la gamba libera dietro.',
  },
  {
    animationId: 'butt-kicks',
    title: 'Calciata Dietro Dinamica',
    defaultPhase: 'work',
    defaultDurationSec: 35,
    defaultZone: 3,
    focus: 'Catena posteriore',
    cue: 'Porta i talloni verso i glutei mantenendo il busto eretto e cadenza rapida.',
  },
  {
    animationId: 'plank-jacks',
    title: 'Plank Jacks',
    defaultPhase: 'work',
    defaultDurationSec: 30,
    defaultZone: 4,
    focus: 'Addome & spalle',
    cue: 'In posizione plank stabile, apri e chiudi i piedi con piccoli saltelli controllati.',
  },
  {
    animationId: 'lunge-split',
    title: 'Affondi Alternati Dinamici',
    defaultPhase: 'work',
    defaultDurationSec: 40,
    defaultZone: 3,
    focus: 'Gambe & controllo',
    cue: 'Alterna gli affondi indietro mantenendo il ginocchio anteriore allineato al piede.',
  },
  {
    animationId: 'warmup-march',
    title: 'Marcia & Mobilità Spalle',
    defaultPhase: 'warmup',
    defaultDurationSec: 60,
    defaultZone: 1,
    focus: 'Riscaldamento',
    cue: 'Marcia sul posto con ampie circonduzioni delle braccia per preparare le articolazioni.',
  },
  {
    animationId: 'breathing-cooldown',
    title: 'Defaticamento & Respiro',
    defaultPhase: 'cooldown',
    defaultDurationSec: 60,
    defaultZone: 1,
    focus: 'Recupero',
    cue: 'Inspira sollevando le braccia in alto ed espira lentamente abbassandole.',
  },
];

export function inferAnimationId(title: string, phase: StepPhase): ExerciseAnimationId {
  const t = title.toLowerCase();
  if (t.includes('jumping') || t.includes('jack') && !t.includes('plank')) return 'jumping-jacks';
  if (t.includes('plank')) return 'plank-jacks';
  if (t.includes('mountain') || t.includes('climber')) return 'mountain-climbers';
  if (t.includes('burpee')) return 'burpees';
  if (t.includes('squat')) return 'squat-jump';
  if (t.includes('box') || t.includes('jab') || t.includes('pugni')) return 'shadow-boxing';
  if (t.includes('skater') || t.includes('pattin') || t.includes('laterale') || t.includes('footwork')) return 'skater-hops';
  if (t.includes('calciata') || t.includes('butt')) return 'butt-kicks';
  if (t.includes('affond') || t.includes('lunge')) return 'lunge-split';
  if (t.includes('skip') || t.includes('corsa') || t.includes('ginocchi') || t.includes('passo')) return 'high-knees';
  if (phase === 'warmup' || t.includes('marcia') || t.includes('mobilità') || t.includes('riscald')) return 'warmup-march';
  if (phase === 'cooldown' || phase === 'rest' || t.includes('recuper') || t.includes('defatic') || t.includes('respir')) {
    return 'breathing-cooldown';
  }
  return 'jumping-jacks';
}
