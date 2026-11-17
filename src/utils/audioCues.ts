class AudioCueEngine {
  private ctx: AudioContext | null = null;
  public muted = false;

  private ensureContext(): AudioContext | null {
    if (this.muted || typeof window === 'undefined') return null;
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    if (!this.ctx) {
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  private playTone(freq: number, durationMs: number, type: OscillatorType = 'sine', gainLevel = 0.16, delayMs = 0) {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime + delayMs / 1000;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(gainLevel, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + durationMs / 1000 + 0.02);
  }

  public playCountdownTick() {
    this.playTone(740, 120, 'triangle', 0.18);
  }

  public playWorkStart() {
    this.playTone(880, 140, 'triangle', 0.2, 0);
    this.playTone(1174, 220, 'triangle', 0.22, 130);
  }

  public playRestStart() {
    this.playTone(587, 150, 'sine', 0.16, 0);
    this.playTone(440, 220, 'sine', 0.15, 140);
  }

  public playWarmupOrCooldown() {
    this.playTone(523, 180, 'sine', 0.14, 0);
  }

  public playWorkoutComplete() {
    this.playTone(523.25, 160, 'triangle', 0.18, 0);
    this.playTone(659.25, 160, 'triangle', 0.18, 150);
    this.playTone(783.99, 180, 'triangle', 0.2, 300);
    this.playTone(1046.5, 360, 'triangle', 0.22, 460);
  }
}

export const audioCues = new AudioCueEngine();

export async function requestScreenWakeLock(): Promise<WakeLockSentinel | null> {
  try {
    if ('wakeLock' in navigator && navigator.wakeLock) {
      return await navigator.wakeLock.request('screen');
    }
  } catch {
    // Ignore wake lock failures on unsupported platforms or low battery mode
  }
  return null;
}
