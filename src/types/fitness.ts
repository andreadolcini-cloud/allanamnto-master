export type StepPhase = 'warmup' | 'work' | 'rest' | 'cooldown';

export type HeartRateZoneId = 1 | 2 | 3 | 4 | 5;

export type WorkoutIntensity = 'light' | 'moderate' | 'vigorous';

export type ExerciseAnimationId =
  | 'jumping-jacks'
  | 'high-knees'
  | 'burpees'
  | 'mountain-climbers'
  | 'squat-jump'
  | 'shadow-boxing'
  | 'skater-hops'
  | 'butt-kicks'
  | 'plank-jacks'
  | 'lunge-split'
  | 'warmup-march'
  | 'breathing-cooldown';

export interface WorkoutStep {
  id: string;
  title: string;
  phase: StepPhase;
  durationSec: number;
  targetZone: HeartRateZoneId;
  animationId?: ExerciseAnimationId;
  notes?: string;
}

export interface WorkoutProgram {
  id: string;
  name: string;
  category: 'HIIT' | 'Tabata' | 'Resistenza' | 'Mobilità & Cardio';
  description: string;
  rounds: number;
  steps: WorkoutStep[];
  createdAt: string;
}

export type WeekdayKey = 'lun' | 'mar' | 'mer' | 'gio' | 'ven' | 'sab' | 'dom';

export type WeeklySchedule = Record<WeekdayKey, string | null>;

export type VideoHRMode = 'face' | 'finger';

export type SignalQuality = 'calibrating' | 'low' | 'medium' | 'high';

export interface VideoTelemetry {
  motionIntensity: number; // 0-100
  cadencePerMin: number; // estimated movement cycles/min
  estimatedBpm: number | null;
  signalQuality: SignalQuality;
  skinRatio: number; // 0-1
  pulseWaveform: number[]; // normalized -1..1 samples for oscilloscope
  motionWaveform: number[]; // 0..100 samples
  motionGrid: number[]; // 8x6 block motion energy (0..1)
  roiRect: { x: number; y: number; w: number; h: number }; // normalized 0..1
  calibrationProgress: number; // 0..100
}

export interface BluetoothHRState {
  isSupported: boolean;
  isConnecting: boolean;
  isConnected: boolean;
  deviceName: string | null;
  bpm: number | null;
  sensorContact: 'supported-detected' | 'supported-none' | 'not-supported' | 'unknown';
  batteryLevel: number | null;
  hrvRmssdMs: number | null;
  error: string | null;
}

export type HeartRateSource = 'bluetooth' | 'video' | 'none';

export interface TelemetrySample {
  elapsedSec: number;
  bpm: number | null;
  intensity: number;
  source: HeartRateSource;
}

export interface WorkoutSessionLog {
  id: string;
  programId: string;
  programName: string;
  completedAt: string;
  durationSec: number;
  avgBpm: number | null;
  maxBpm: number | null;
  avgIntensity: number;
  estimatedKcal: number;
  hrSourceUsed: HeartRateSource | 'mixed';
  zoneSeconds: Record<HeartRateZoneId, number>;
  samples: TelemetrySample[];
}

export interface UserProfile {
  age: number;
  weightKg: number;
  restingBpm: number;
}

export interface CameraSettings {
  facingMode: 'user' | 'environment';
  selectedDeviceId: string;
  mirrored: boolean;
  hrMode: VideoHRMode;
  showOverlay: boolean;
}

export interface UserAccount {
  id: string;
  name: string;
  profile: UserProfile;
  workoutIntensity: WorkoutIntensity;
  standingOnly: boolean;
  programs: WorkoutProgram[];
  schedule: WeeklySchedule;
  history: WorkoutSessionLog[];
  audioMuted: boolean;
  cameraSettings: CameraSettings;
}

