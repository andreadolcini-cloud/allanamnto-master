import type { SignalQuality, VideoHRMode, VideoTelemetry } from '../types/fitness';

interface ColorSample {
  t: number; // ms
  r: number;
  g: number;
  b: number;
}

interface MotionSample {
  t: number;
  energy: number;
}

const FRAME_W = 160;
const FRAME_H = 120;
const GRID_COLS = 8;
const GRID_ROWS = 6;
const WINDOW_MS = 10500; // 10.5s rolling rPPG window
const MIN_CALIBRATION_MS = 4500;

/**
 * Real-time Computer Vision & Remote Photoplethysmography (rPPG) Analyzer.
 * - Optical motion energy & cadence estimation via frame luminance differencing
 * - Skin-masked POS (Plane-Orthogonal-to-Skin) rPPG & fingertip PPG spectral BPM estimation
 */
export class VideoBiometricAnalyzer {
  private prevLuma: Float32Array | null = null;
  private colorBuffer: ColorSample[] = [];
  private motionBuffer: MotionSample[] = [];
  private pulseDisplayWave: number[] = [];
  private motionDisplayWave: number[] = [];

  private smoothedIntensity = 0;
  private smoothedBpm: number | null = null;
  private lastBpmComputeTs = 0;
  private lastQuality: SignalQuality = 'calibrating';
  private lastCadence = 0;
  private startTs: number | null = null;

  public roiRect = { x: 0.34, y: 0.14, w: 0.32, h: 0.28 };

  public reset() {
    this.prevLuma = null;
    this.colorBuffer = [];
    this.motionBuffer = [];
    this.pulseDisplayWave = [];
    this.motionDisplayWave = [];
    this.smoothedIntensity = 0;
    this.smoothedBpm = null;
    this.lastBpmComputeTs = 0;
    this.lastQuality = 'calibrating';
    this.lastCadence = 0;
    this.startTs = null;
  }

  public setRoiCenter(normX: number, normY: number) {
    const w = this.roiRect.w;
    const h = this.roiRect.h;
    this.roiRect = {
      x: Math.max(0.05, Math.min(0.95 - w, normX - w / 2)),
      y: Math.max(0.05, Math.min(0.95 - h, normY - h / 2)),
      w,
      h,
    };
  }

  public processFrame(
    imageData: ImageData,
    timestampMs: number,
    mode: VideoHRMode
  ): VideoTelemetry {
    if (this.startTs === null) {
      this.startTs = timestampMs;
    }

    const { data, width, height } = imageData;
    const totalPixels = width * height;

    // 1. Optical Motion Energy + 8x6 Spatial Grid
    const currLuma = new Float32Array(totalPixels);
    const gridSums = new Float32Array(GRID_COLS * GRID_ROWS);
    const gridCounts = new Uint32Array(GRID_COLS * GRID_ROWS);

    const cellW = width / GRID_COLS;
    const cellH = height / GRID_ROWS;

    let motionDiffSum = 0;
    let activeMotionPixels = 0;

    // ROI bounds in pixel coordinates
    const roiX0 = Math.floor((mode === 'finger' ? 0.2 : this.roiRect.x) * width);
    const roiY0 = Math.floor((mode === 'finger' ? 0.2 : this.roiRect.y) * height);
    const roiX1 = Math.floor((mode === 'finger' ? 0.8 : this.roiRect.x + this.roiRect.w) * width);
    const roiY1 = Math.floor((mode === 'finger' ? 0.8 : this.roiRect.y + this.roiRect.h) * height);

    let rSum = 0;
    let gSum = 0;
    let bSum = 0;
    let roiTotalPixels = 0;
    let roiSkinPixels = 0;

    for (let y = 0; y < height; y++) {
      const gRow = Math.min(GRID_ROWS - 1, Math.floor(y / cellH));
      const inRoiY = y >= roiY0 && y < roiY1;

      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        const p = idx * 4;
        const r = data[p];
        const g = data[p + 1];
        const b = data[p + 2];

        const luma = 0.299 * r + 0.587 * g + 0.114 * b;
        currLuma[idx] = luma;

        if (this.prevLuma) {
          const diff = Math.abs(luma - this.prevLuma[idx]);
          // Reject sensor noise below 7 luma levels
          const cleanDiff = diff > 7 ? diff - 7 : 0;
          motionDiffSum += cleanDiff;
          if (diff > 14) activeMotionPixels++;

          const gCol = Math.min(GRID_COLS - 1, Math.floor(x / cellW));
          const gIdx = gRow * GRID_COLS + gCol;
          gridSums[gIdx] += cleanDiff;
          gridCounts[gIdx]++;
        }

        // Skin / Blood-volume ROI accumulation
        if (inRoiY && x >= roiX0 && x < roiX1) {
          roiTotalPixels++;
          if (mode === 'finger') {
            // Fingertip covering camera: high red dominance or warm flesh transmission
            rSum += r;
            gSum += g;
            bSum += b;
            if (r > 60 && r >= g) {
              roiSkinPixels++;
            }
          } else {
            // Face/forehead skin chrominance filter (Peer et al. + YCbCr guard)
            const isSkin =
              r > 65 &&
              g > 35 &&
              b > 20 &&
              r > g &&
              r > b &&
              Math.abs(r - g) > 10 &&
              Math.max(r, g, b) - Math.min(r, g, b) > 12;

            if (isSkin) {
              rSum += r;
              gSum += g;
              bSum += b;
              roiSkinPixels++;
            }
          }
        }
      }
    }

    this.prevLuma = currLuma;

    // Normalize spatial grid (0..1)
    const motionGrid: number[] = [];
    for (let i = 0; i < GRID_COLS * GRID_ROWS; i++) {
      const avg = gridCounts[i] > 0 ? gridSums[i] / gridCounts[i] : 0;
      motionGrid.push(Math.min(1, avg / 28));
    }

    // Instantaneous movement intensity (0..100)
    const meanDiff = motionDiffSum / Math.max(1, totalPixels);
    const activePct = (activeMotionPixels / Math.max(1, totalPixels)) * 100;
    const rawIntensity = Math.min(100, meanDiff * 2.4 + activePct * 1.35);
    this.smoothedIntensity = this.smoothedIntensity * 0.8 + rawIntensity * 0.2;

    this.motionBuffer.push({ t: timestampMs, energy: this.smoothedIntensity });
    const motionCutoff = timestampMs - 10000;
    while (this.motionBuffer.length > 0 && this.motionBuffer[0].t < motionCutoff) {
      this.motionBuffer.shift();
    }

    this.motionDisplayWave.push(this.smoothedIntensity);
    if (this.motionDisplayWave.length > 140) {
      this.motionDisplayWave.shift();
    }

    // Estimate movement cadence (oscillation peaks/min)
    this.lastCadence = this.estimateCadence();

    // 2. rPPG Color Sample Ingestion
    const skinRatio = roiTotalPixels > 0 ? roiSkinPixels / roiTotalPixels : 0;
    const enoughSkin = mode === 'finger' ? roiTotalPixels > 0 : skinRatio > 0.12 && roiSkinPixels > 25;

    if (enoughSkin && roiSkinPixels > 0) {
      this.colorBuffer.push({
        t: timestampMs,
        r: rSum / roiSkinPixels,
        g: gSum / roiSkinPixels,
        b: bSum / roiSkinPixels,
      });
    } else if (roiTotalPixels > 0 && mode === 'face') {
      // Fallback to full ROI average if lighting shifts skin threshold slightly
      let fr = 0, fg = 0, fb = 0, fc = 0;
      for (let y = roiY0; y < roiY1; y += 2) {
        for (let x = roiX0; x < roiX1; x += 2) {
          const p = (y * width + x) * 4;
          fr += data[p]; fg += data[p + 1]; fb += data[p + 2]; fc++;
        }
      }
      if (fc > 0) {
        this.colorBuffer.push({ t: timestampMs, r: fr / fc, g: fg / fc, b: fb / fc });
      }
    }

    const rppgCutoff = timestampMs - WINDOW_MS;
    while (this.colorBuffer.length > 0 && this.colorBuffer[0].t < rppgCutoff) {
      this.colorBuffer.shift();
    }

    // 3. Spectral BPM Estimation (every ~450ms once calibrated)
    const elapsedSinceStart = timestampMs - (this.startTs ?? timestampMs);
    const calibrationProgress = Math.min(100, Math.round((elapsedSinceStart / MIN_CALIBRATION_MS) * 100));

    if (elapsedSinceStart >= MIN_CALIBRATION_MS && timestampMs - this.lastBpmComputeTs >= 450) {
      this.lastBpmComputeTs = timestampMs;
      this.computeHeartRateSpectrum(mode, skinRatio);
    }

    return {
      motionIntensity: Math.round(this.smoothedIntensity),
      cadencePerMin: this.lastCadence,
      estimatedBpm: this.smoothedBpm,
      signalQuality: elapsedSinceStart < MIN_CALIBRATION_MS ? 'calibrating' : this.lastQuality,
      skinRatio,
      pulseWaveform: [...this.pulseDisplayWave],
      motionWaveform: [...this.motionDisplayWave],
      motionGrid,
      roiRect: this.roiRect,
      calibrationProgress,
    };
  }

  private estimateCadence(): number {
    if (this.motionBuffer.length < 20) return 0;
    const mean =
      this.motionBuffer.reduce((sum, s) => sum + s.energy, 0) / this.motionBuffer.length;
    if (mean < 7) return 0;

    let peaks = 0;
    let lastPeakT = 0;
    for (let i = 1; i < this.motionBuffer.length - 1; i++) {
      const prev = this.motionBuffer[i - 1].energy;
      const curr = this.motionBuffer[i].energy;
      const next = this.motionBuffer[i + 1].energy;
      if (
        curr > prev &&
        curr >= next &&
        curr > mean + 3.5 &&
        this.motionBuffer[i].t - lastPeakT > 260
      ) {
        peaks++;
        lastPeakT = this.motionBuffer[i].t;
      }
    }
    const spanSec =
      (this.motionBuffer[this.motionBuffer.length - 1].t - this.motionBuffer[0].t) / 1000;
    if (spanSec < 2) return 0;
    return Math.min(220, Math.round((peaks / spanSec) * 60));
  }

  private computeHeartRateSpectrum(mode: VideoHRMode, skinRatio: number) {
    if (this.colorBuffer.length < 60) return;

    const t0 = this.colorBuffer[0].t;
    const t1 = this.colorBuffer[this.colorBuffer.length - 1].t;
    const durationSec = (t1 - t0) / 1000;
    if (durationSec < 3.5) return;

    // Resample to uniform 30 Hz grid
    const fs = 30;
    const n = Math.min(300, Math.floor(durationSec * fs));
    if (n < 75) return;

    const rArr = new Float64Array(n);
    const gArr = new Float64Array(n);
    const bArr = new Float64Array(n);

    let bufIdx = 0;
    for (let i = 0; i < n; i++) {
      const targetT = t1 - ((n - 1 - i) / fs) * 1000;
      while (bufIdx < this.colorBuffer.length - 2 && this.colorBuffer[bufIdx + 1].t < targetT) {
        bufIdx++;
      }
      const s0 = this.colorBuffer[bufIdx];
      const s1 = this.colorBuffer[Math.min(bufIdx + 1, this.colorBuffer.length - 1)];
      const dt = s1.t - s0.t;
      const alpha = dt > 0 ? Math.max(0, Math.min(1, (targetT - s0.t) / dt)) : 0;
      rArr[i] = s0.r + (s1.r - s0.r) * alpha;
      gArr[i] = s0.g + (s1.g - s0.g) * alpha;
      bArr[i] = s0.b + (s1.b - s0.b) * alpha;
    }

    // Build pulse signal
    const rawPulse = new Float64Array(n);
    if (mode === 'finger') {
      // Fingertip PPG: inverted red/green AC pulsatile component
      const rMean = rArr.reduce((a, b) => a + b, 0) / n || 1;
      const gMean = gArr.reduce((a, b) => a + b, 0) / n || 1;
      for (let i = 0; i < n; i++) {
        rawPulse[i] = -(rArr[i] / rMean - 1) * 0.65 - (gArr[i] / gMean - 1) * 0.35;
      }
    } else {
      // POS (Plane-Orthogonal-to-Skin) projection for motion robustness
      const rMean = rArr.reduce((a, b) => a + b, 0) / n || 1;
      const gMean = gArr.reduce((a, b) => a + b, 0) / n || 1;
      const bMean = bArr.reduce((a, b) => a + b, 0) / n || 1;

      const s1 = new Float64Array(n);
      const s2 = new Float64Array(n);
      let s1Mean = 0;
      let s2Mean = 0;

      for (let i = 0; i < n; i++) {
        const rn = rArr[i] / rMean;
        const gn = gArr[i] / gMean;
        const bn = bArr[i] / bMean;
        s1[i] = gn - bn;
        s2[i] = gn + bn - 2 * rn;
        s1Mean += s1[i];
        s2Mean += s2[i];
      }
      s1Mean /= n;
      s2Mean /= n;

      let s1Var = 0;
      let s2Var = 0;
      for (let i = 0; i < n; i++) {
        s1Var += (s1[i] - s1Mean) ** 2;
        s2Var += (s2[i] - s2Mean) ** 2;
      }
      const alpha = s2Var > 1e-10 ? Math.sqrt(s1Var / s2Var) : 0;
      for (let i = 0; i < n; i++) {
        rawPulse[i] = (s1[i] - s1Mean) + alpha * (s2[i] - s2Mean);
      }
    }

    // Moving-average detrending (window ~ 0.67s = 20 samples at 30 Hz)
    const halfWin = 10;
    const detrended = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let sum = 0;
      let count = 0;
      const start = Math.max(0, i - halfWin);
      const end = Math.min(n - 1, i + halfWin);
      for (let j = start; j <= end; j++) {
        sum += rawPulse[j];
        count++;
      }
      detrended[i] = rawPulse[i] - sum / count;
    }

    // Normalize display waveform (-1..1) from last 120 samples
    const dispSlice = detrended.slice(Math.max(0, n - 120));
    let maxAbs = 1e-6;
    for (let i = 0; i < dispSlice.length; i++) {
      maxAbs = Math.max(maxAbs, Math.abs(dispSlice[i]));
    }
    this.pulseDisplayWave = Array.from(dispSlice, (v) => Math.max(-1, Math.min(1, v / maxAbs)));

    // Apply Hamming window & compute DFT over 45..200 BPM (0.75 Hz .. 3.33 Hz, step 1 BPM)
    const windowed = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const w = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (n - 1));
      windowed[i] = detrended[i] * w;
    }

    let bestBpm = 72;
    let bestPower = -1;
    let totalPower = 0;
    const powers: number[] = [];

    for (let bpm = 46; bpm <= 198; bpm++) {
      const freq = bpm / 60;
      let re = 0;
      let im = 0;
      const omega = (2 * Math.PI * freq) / fs;
      for (let i = 0; i < n; i++) {
        const angle = omega * i;
        re += windowed[i] * Math.cos(angle);
        im -= windowed[i] * Math.sin(angle);
      }
      const pwr = re * re + im * im;
      powers.push(pwr);
      totalPower += pwr;

      // Slight physiological prior around previous BPM to avoid sudden harmonic jumps
      let weightedPwr = pwr;
      if (this.smoothedBpm !== null) {
        const dist = Math.abs(bpm - this.smoothedBpm);
        weightedPwr *= Math.exp(-(dist * dist) / (2 * 28 * 28));
      }

      if (weightedPwr > bestPower) {
        bestPower = weightedPwr;
        bestBpm = bpm;
      }
    }

    const avgPower = totalPower / Math.max(1, powers.length);
    const snr = avgPower > 0 ? powers[bestBpm - 46] / avgPower : 0;

    if (snr >= 4.2 && (mode === 'finger' || skinRatio >= 0.15)) {
      this.lastQuality = 'high';
    } else if (snr >= 2.3) {
      this.lastQuality = 'medium';
    } else {
      this.lastQuality = 'low';
    }

    if (this.smoothedBpm === null) {
      this.smoothedBpm = bestBpm;
    } else {
      const alpha = this.lastQuality === 'high' ? 0.32 : this.lastQuality === 'medium' ? 0.2 : 0.08;
      // Clamp maximum physiological jump per update to 10 BPM
      const delta = Math.max(-10, Math.min(10, bestBpm - this.smoothedBpm));
      this.smoothedBpm = Math.round(this.smoothedBpm + delta * alpha);
    }
  }
}

export { FRAME_W, FRAME_H };
