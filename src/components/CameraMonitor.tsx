import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity,
  Bluetooth,
  BluetoothConnected,
  Camera,
  CameraOff,
  FlipHorizontal2,
  RefreshCw,
  SlidersHorizontal,
} from 'lucide-react';
import type { BluetoothHRState, VideoHRMode, VideoTelemetry } from '../types/fitness';
import { FRAME_H, FRAME_W, VideoBiometricAnalyzer } from '../utils/videoAnalyzer';

interface CameraMonitorProps {
  onTelemetry: (telemetry: VideoTelemetry | null) => void;
  telemetry: VideoTelemetry | null;
  bluetooth: BluetoothHRState & {
    connect: () => Promise<void>;
    disconnect: () => void;
  };
}

export const CameraMonitor: React.FC<CameraMonitorProps> = ({
  onTelemetry,
  telemetry,
  bluetooth,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const processCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const waveCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const analyzerRef = useRef<VideoBiometricAnalyzer>(new VideoBiometricAnalyzer());
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);

  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [mirrored, setMirrored] = useState(true);
  const [hrMode, setHrMode] = useState<VideoHRMode>('face');
  const [showOverlay, setShowOverlay] = useState(true);

  const stopCamera = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    analyzerRef.current.reset();
    setCameraActive(false);
    onTelemetry(null);
  }, [onTelemetry]);

  const startCamera = useCallback(
    async (targetFacing: 'user' | 'environment' = facingMode, deviceId?: string) => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError('Fotocamera non supportata in questo browser o contesto non sicuro.');
        return;
      }

      stopCamera();
      setCameraError(null);

      try {
        const videoConstraint: MediaTrackConstraints = deviceId
          ? { deviceId: { exact: deviceId }, width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } }
          : { facingMode: targetFacing, width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } };

        const stream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraint,
          audio: false,
        });

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        // Refresh available cameras after permission grant
        try {
          const allDevices = await navigator.mediaDevices.enumerateDevices();
          const videoInputs = allDevices.filter((d) => d.kind === 'videoinput');
          setDevices(videoInputs);
          const activeTrack = stream.getVideoTracks()[0];
          const activeId = activeTrack?.getSettings()?.deviceId;
          if (activeId) setSelectedDeviceId(activeId);
        } catch {
          // Ignore device enumeration errors
        }

        analyzerRef.current.reset();
        setCameraActive(true);
      } catch (err) {
        const e = err as DOMException | Error;
        if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
          setCameraError('Permesso telecamera negato. Consenti l’accesso alla webcam dalle impostazioni del browser.');
        } else if (e.name === 'NotFoundError' || e.name === 'DevicesNotFoundError') {
          setCameraError('Nessuna webcam o telecamera rilevata su questo dispositivo.');
        } else {
          setCameraError(e.message || 'Impossibile avviare la telecamera.');
        }
        setCameraActive(false);
      }
    },
    [facingMode, stopCamera]
  );

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  // Draw live overlay on camera feed
  const drawOverlay = useCallback(
    (tel: VideoTelemetry) => {
      const canvas = overlayCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      if (!showOverlay) return;

      // 8x6 motion heat grid
      const cols = 8;
      const rows = 6;
      const cellW = w / cols;
      const cellH = h / rows;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const val = tel.motionGrid[r * cols + c] ?? 0;
          if (val > 0.08) {
            const drawCol = mirrored ? cols - 1 - c : c;
            ctx.fillStyle = `rgba(6, 182, 212, ${Math.min(0.42, val * 0.48)})`;
            ctx.fillRect(drawCol * cellW + 1, r * cellH + 1, cellW - 2, cellH - 2);
          }
        }
      }

      // Draw rPPG ROI target box
      const roi = hrMode === 'finger' ? { x: 0.2, y: 0.2, w: 0.6, h: 0.6 } : tel.roiRect;
      const rx = (mirrored && hrMode === 'face' ? 1 - roi.x - roi.w : roi.x) * w;
      const ry = roi.y * h;
      const rw = roi.w * w;
      const rh = roi.h * h;

      ctx.strokeStyle =
        tel.signalQuality === 'high'
          ? '#10B981'
          : tel.signalQuality === 'medium'
          ? '#06B6D4'
          : '#F59E0B';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(rx, ry, rw, rh);
      ctx.setLineDash([]);

      // Corner ticks
      const tick = 10;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(rx, ry + tick); ctx.lineTo(rx, ry); ctx.lineTo(rx + tick, ry);
      ctx.moveTo(rx + rw - tick, ry); ctx.lineTo(rx + rw, ry); ctx.lineTo(rx + rw, ry + tick);
      ctx.moveTo(rx, ry + rh - tick); ctx.lineTo(rx, ry + rh); ctx.lineTo(rx + tick, ry + rh);
      ctx.moveTo(rx + rw - tick, ry + rh); ctx.lineTo(rx + rw, ry + rh); ctx.lineTo(rx + rw, ry + rh - tick);
      ctx.stroke();
    },
    [hrMode, mirrored, showOverlay]
  );

  // Draw live dual-channel oscilloscope (PPG pulse + Movement Intensity)
  const drawOscilloscope = useCallback((tel: VideoTelemetry | null) => {
    const canvas = waveCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Subtle scientific grid
    ctx.strokeStyle = 'rgba(30, 41, 59, 0.8)';
    ctx.lineWidth = 1;
    for (let y = 1; y < 4; y++) {
      const py = (h / 4) * y;
      ctx.beginPath();
      ctx.moveTo(0, py);
      ctx.lineTo(w, py);
      ctx.stroke();
    }

    if (!tel) return;

    // 1. Motion Intensity curve (Cyan fill)
    if (tel.motionWaveform.length > 1) {
      ctx.beginPath();
      const len = tel.motionWaveform.length;
      for (let i = 0; i < len; i++) {
        const x = (i / (len - 1)) * w;
        const y = h - (tel.motionWaveform[i] / 100) * (h * 0.82) - 4;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = '#06B6D4';
      ctx.lineWidth = 1.75;
      ctx.stroke();
    }

    // 2. rPPG Pulse Waveform (Rose / Emerald)
    if (tel.pulseWaveform.length > 1) {
      ctx.beginPath();
      const len = tel.pulseWaveform.length;
      const mid = h * 0.5;
      for (let i = 0; i < len; i++) {
        const x = (i / (len - 1)) * w;
        const y = mid - tel.pulseWaveform[i] * (h * 0.34);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = '#F43F5E';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }, []);

  // Vision processing loop (~28fps)
  useEffect(() => {
    if (!cameraActive) return;

    let lastProcessTs = 0;
    const loop = (now: number) => {
      rafRef.current = requestAnimationFrame(loop);

      if (now - lastProcessTs < 34) return;
      lastProcessTs = now;

      const video = videoRef.current;
      const procCanvas = processCanvasRef.current;
      if (!video || !procCanvas || video.readyState < 2) return;

      const ctx = procCanvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;

      ctx.drawImage(video, 0, 0, FRAME_W, FRAME_H);
      const imageData = ctx.getImageData(0, 0, FRAME_W, FRAME_H);
      const tel = analyzerRef.current.processFrame(imageData, performance.now(), hrMode);

      onTelemetry(tel);
      drawOverlay(tel);
      drawOscilloscope(tel);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [cameraActive, drawOscilloscope, drawOverlay, hrMode, onTelemetry]);

  const handleVideoClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cameraActive || hrMode !== 'face') return;
    const rect = e.currentTarget.getBoundingClientRect();
    let nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;
    if (mirrored) nx = 1 - nx;
    analyzerRef.current.setRoiCenter(nx, ny);
  };

  const handleSwitchFacing = () => {
    const next = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(next);
    setMirrored(next === 'user');
    if (cameraActive) {
      void startCamera(next);
    }
  };

  const qualityLabel: Record<string, { text: string; tone: string }> = {
    calibrating: { text: `Calibrazione ${telemetry?.calibrationProgress ?? 0}%`, tone: 'text-amber-400' },
    low: { text: 'Segnale debole · stabilizza viso/luce', tone: 'text-amber-400' },
    medium: { text: 'Qualità discreta', tone: 'text-cyan-400' },
    high: { text: 'Segnale rPPG ottimale', tone: 'text-emerald-400' },
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-[#0F141D] p-4">
      {/* Toolbar Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-white">Analisi Video &amp; Sensori</h3>
          <span className="text-xs text-slate-400">
            {cameraActive ? 'Fotocamera attiva · 100% locale' : 'Telecamera in standby'}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Mode Switch: Face rPPG vs Finger PPG */}
          <div className="flex items-center rounded-lg border border-slate-800 bg-[#07090E] p-0.5">
            <button
              type="button"
              onClick={() => {
                setHrMode('face');
                analyzerRef.current.reset();
              }}
              className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                hrMode === 'face' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Viso (rPPG)
            </button>
            <button
              type="button"
              onClick={() => {
                setHrMode('finger');
                analyzerRef.current.reset();
              }}
              className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                hrMode === 'finger' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Dito su Lente
            </button>
          </div>

          {cameraActive ? (
            <button
              type="button"
              onClick={stopCamera}
              className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-500/15 px-3 py-1.5 text-xs font-semibold text-rose-300 transition-colors hover:bg-rose-500/25 min-h-[36px] whitespace-nowrap"
            >
              <CameraOff className="h-3.5 w-3.5" />
              <span>Disattiva</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void startCamera(facingMode, selectedDeviceId || undefined)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-500 px-3.5 py-1.5 text-xs font-semibold text-slate-950 transition-colors hover:bg-cyan-400 min-h-[36px] whitespace-nowrap"
            >
              <Camera className="h-3.5 w-3.5" />
              <span>Attiva Telecamera</span>
            </button>
          )}
        </div>
      </div>

      {/* Camera Viewport + Controls */}
      <div className="mt-3 grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="xl:col-span-7">
          <div
            onClick={handleVideoClick}
            title={cameraActive && hrMode === 'face' ? 'Tocca o clicca per riposizionare l’area di rilevamento viso' : undefined}
            className={`relative aspect-video w-full overflow-hidden rounded-lg border border-slate-800 bg-[#07090E] ${
              cameraActive && hrMode === 'face' ? 'cursor-crosshair' : ''
            }`}
          >
            <video
              ref={videoRef}
              playsInline
              muted
              className={`h-full w-full object-cover ${mirrored ? '-scale-x-100' : ''} ${
                cameraActive ? 'opacity-100' : 'opacity-0'
              }`}
            />
            <canvas
              ref={overlayCanvasRef}
              width={320}
              height={180}
              className="pointer-events-none absolute inset-0 h-full w-full"
            />
            <canvas ref={processCanvasRef} width={FRAME_W} height={FRAME_H} className="hidden" />

            {!cameraActive && (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-5 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full border border-slate-800 bg-slate-900 text-cyan-400">
                  <Camera className="h-6 w-6" />
                </div>
                <p className="mt-3 text-sm font-medium text-slate-200">
                  Monitoraggio Ottico Intensità &amp; Frequenza Cardiaca
                </p>
                <p className="mt-1 max-w-sm text-xs leading-relaxed text-slate-400">
                  Attiva la webcam o la fotocamera per misurare l&apos;energia di movimento, la cadenza e stimare i BPM via rPPG in tempo reale sul dispositivo.
                </p>
                {cameraError && (
                  <p className="mt-3 rounded-md border border-rose-500/30 bg-rose-950/60 px-3 py-1.5 text-xs text-rose-200">
                    {cameraError}
                  </p>
                )}
              </div>
            )}

            {cameraActive && telemetry && (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/85 via-black/45 to-transparent px-3 py-2 text-xs">
                <span className={`font-medium ${qualityLabel[telemetry.signalQuality]?.tone ?? 'text-slate-300'}`}>
                  {qualityLabel[telemetry.signalQuality]?.text}
                </span>
                <span className="font-mono-tabular text-slate-300">
                  {hrMode === 'face' ? 'Tocca il viso per centrare ROI' : 'Appoggia il dito sulla lente'}
                </span>
              </div>
            )}
          </div>

          {/* Camera secondary controls */}
          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleSwitchFacing}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-800 bg-[#07090E] px-2.5 py-1.5 text-slate-300 hover:border-slate-700 hover:text-white min-h-[36px]"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>{facingMode === 'user' ? 'Camera Frontale' : 'Camera Posteriore'}</span>
              </button>

              <button
                type="button"
                onClick={() => setMirrored((m) => !m)}
                className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 min-h-[36px] ${
                  mirrored
                    ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300'
                    : 'border-slate-800 bg-[#07090E] text-slate-400 hover:text-white'
                }`}
              >
                <FlipHorizontal2 className="h-3.5 w-3.5" />
                <span>Specchia</span>
              </button>

              <button
                type="button"
                onClick={() => setShowOverlay((s) => !s)}
                className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 min-h-[36px] ${
                  showOverlay
                    ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300'
                    : 'border-slate-800 bg-[#07090E] text-slate-400 hover:text-white'
                }`}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                <span>Griglia Analisi</span>
              </button>
            </div>

            {devices.length > 1 && (
              <select
                aria-label="Seleziona telecamera"
                value={selectedDeviceId}
                onChange={(e) => {
                  const id = e.target.value;
                  setSelectedDeviceId(id);
                  if (cameraActive) void startCamera(facingMode, id);
                }}
                className="max-w-[180px] rounded-md border border-slate-800 bg-[#07090E] px-2 py-1.5 text-xs text-slate-200 focus:border-cyan-500 focus:outline-none"
              >
                {devices.map((d, idx) => (
                  <option key={d.deviceId || idx} value={d.deviceId}>
                    {d.label || `Telecamera ${idx + 1}`}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Right Side: Bluetooth HR + Real-Time Waveforms */}
        <div className="flex flex-col justify-between gap-3 xl:col-span-5">
          {/* Bluetooth Heart Rate Monitor Card */}
          <div className="rounded-lg border border-slate-800 bg-[#07090E] p-3.5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
                  {bluetooth.isConnected ? (
                    <BluetoothConnected className="h-4 w-4 text-cyan-400" />
                  ) : (
                    <Bluetooth className="h-4 w-4 text-slate-400" />
                  )}
                  <span>Cardiofrequenzimetro Bluetooth</span>
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  {bluetooth.isConnected
                    ? `${bluetooth.deviceName} · Prioritario su stima video`
                    : 'Associa fascia toracica o sensore ottico BLE (GATT 0x180D)'}
                </p>
              </div>
            </div>

            {bluetooth.isConnected ? (
              <div className="mt-3 space-y-2.5">
                <div className="grid grid-cols-3 gap-2 border-t border-slate-800/80 pt-2.5 text-xs">
                  <div>
                    <div className="text-slate-400">Battito BLE</div>
                    <div className="font-mono-tabular mt-0.5 text-base font-bold text-white">
                      {bluetooth.bpm ?? '--'} <span className="text-[11px] font-normal text-slate-400">BPM</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-400">HRV (RMSSD)</div>
                    <div className="font-mono-tabular mt-0.5 text-base font-bold text-cyan-400">
                      {bluetooth.hrvRmssdMs !== null ? `${bluetooth.hrvRmssdMs}` : '--'}{' '}
                      <span className="text-[11px] font-normal text-slate-400">ms</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-400">Batteria</div>
                    <div className="font-mono-tabular mt-0.5 text-base font-bold text-emerald-400">
                      {bluetooth.batteryLevel !== null ? `${bluetooth.batteryLevel}%` : '--'}
                    </div>
                  </div>
                </div>

                {bluetooth.sensorContact === 'supported-none' && (
                  <p className="text-xs text-amber-400">
                    Contatto pelle non rilevato dalla fascia: inumidisci gli elettrodi.
                  </p>
                )}

                <button
                  type="button"
                  onClick={bluetooth.disconnect}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 py-2 text-xs font-semibold text-slate-200 transition-colors hover:border-rose-500/40 hover:text-rose-300 min-h-[40px]"
                >
                  Disconnetti Fascia BLE
                </button>
              </div>
            ) : (
              <div className="mt-3 space-y-2">
                {bluetooth.error && (
                  <p className="rounded-md border border-rose-500/30 bg-rose-950/60 px-2.5 py-1.5 text-xs text-rose-200">
                    {bluetooth.error}
                  </p>
                )}
                <button
                  type="button"
                  disabled={!bluetooth.isSupported || bluetooth.isConnecting}
                  onClick={() => void bluetooth.connect()}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-cyan-500/40 bg-cyan-500/15 px-3 py-2 text-xs font-semibold text-cyan-300 transition-colors hover:bg-cyan-500/25 disabled:cursor-not-allowed disabled:opacity-50 min-h-[42px]"
                >
                  <Bluetooth className="h-4 w-4" />
                  <span>
                    {!bluetooth.isSupported
                      ? 'Web Bluetooth non disponibile su questo browser'
                      : bluetooth.isConnecting
                      ? 'Ricerca dispositivi BLE...'
                      : 'Connetti Cardiofrequenzimetro BLE'}
                  </span>
                </button>
              </div>
            )}
          </div>

          {/* Dual-Channel Oscilloscope */}
          <div className="rounded-lg border border-slate-800 bg-[#07090E] p-3">
            <div className="mb-2 flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5 font-medium text-slate-300">
                <Activity className="h-3.5 w-3.5 text-cyan-400" />
                <span>Oscilloscopio Segnale</span>
              </div>
              <div className="flex items-center gap-3 text-[11px] text-slate-400">
                <span className="flex items-center gap-1">
                  <span className="inline-block h-1.5 w-3 bg-rose-500" /> Polso rPPG
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-1.5 w-3 bg-cyan-400" /> Intensità
                </span>
              </div>
            </div>
            <canvas
              ref={waveCanvasRef}
              width={320}
              height={88}
              className="h-[88px] w-full rounded border border-slate-800/70 bg-[#05070B]"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
