import { useCallback, useEffect, useRef, useState } from 'react';
import type { CameraSettings, VideoHRMode, VideoTelemetry } from '../types/fitness';
import { FRAME_H, FRAME_W, VideoBiometricAnalyzer } from '../utils/videoAnalyzer';

export function useCameraBiometrics(
  settings: CameraSettings,
  onUpdateSettings: (patch: Partial<CameraSettings>) => void
) {
  const hiddenVideoRef = useRef<HTMLVideoElement | null>(null);
  const processCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const analyzerRef = useRef<VideoBiometricAnalyzer>(new VideoBiometricAnalyzer());

  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [telemetry, setTelemetry] = useState<VideoTelemetry | null>(null);

  const ensureHiddenElements = useCallback(() => {
    if (typeof document === 'undefined') return;
    if (!hiddenVideoRef.current) {
      const video = document.createElement('video');
      video.playsInline = true;
      video.muted = true;
      video.autoplay = true;
      hiddenVideoRef.current = video;
    }
    if (!processCanvasRef.current) {
      const canvas = document.createElement('canvas');
      canvas.width = FRAME_W;
      canvas.height = FRAME_H;
      processCanvasRef.current = canvas;
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (hiddenVideoRef.current) {
      hiddenVideoRef.current.srcObject = null;
    }
    analyzerRef.current.reset();
    setCameraActive(false);
    setTelemetry(null);
  }, []);

  const startCamera = useCallback(
    async (
      targetFacing: 'user' | 'environment' = settings.facingMode,
      deviceId: string = settings.selectedDeviceId
    ) => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError('Fotocamera non supportata in questo browser o contesto non sicuro.');
        return;
      }

      ensureHiddenElements();
      stopCamera();
      setCameraError(null);

      try {
        const videoConstraint: MediaTrackConstraints = deviceId
          ? {
              deviceId: { exact: deviceId },
              width: { ideal: 640 },
              height: { ideal: 480 },
              frameRate: { ideal: 30 },
            }
          : {
              facingMode: targetFacing,
              width: { ideal: 640 },
              height: { ideal: 480 },
              frameRate: { ideal: 30 },
            };

        const stream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraint,
          audio: false,
        });

        streamRef.current = stream;
        if (hiddenVideoRef.current) {
          hiddenVideoRef.current.srcObject = stream;
          await hiddenVideoRef.current.play();
        }

        try {
          const allDevices = await navigator.mediaDevices.enumerateDevices();
          const videoInputs = allDevices.filter((d) => d.kind === 'videoinput');
          setDevices(videoInputs);
          const activeTrack = stream.getVideoTracks()[0];
          const activeId = activeTrack?.getSettings()?.deviceId;
          if (activeId) {
            onUpdateSettings({ selectedDeviceId: activeId });
          }
        } catch {
          // Ignore device enumeration errors
        }

        analyzerRef.current.reset();
        setCameraActive(true);
      } catch (err) {
        const e = err as DOMException | Error;
        if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
          setCameraError(
            'Permesso telecamera negato. Consenti l’accesso alla webcam dalle impostazioni del browser.'
          );
        } else if (e.name === 'NotFoundError' || e.name === 'DevicesNotFoundError') {
          setCameraError('Nessuna webcam o telecamera rilevata su questo dispositivo.');
        } else {
          setCameraError(e.message || 'Impossibile avviare la telecamera.');
        }
        setCameraActive(false);
      }
    },
    [ensureHiddenElements, onUpdateSettings, settings.facingMode, settings.selectedDeviceId, stopCamera]
  );

  const resetAnalyzer = useCallback(() => {
    analyzerRef.current.reset();
  }, []);

  const setRoiCenter = useCallback((nx: number, ny: number) => {
    analyzerRef.current.setRoiCenter(nx, ny);
  }, []);

  const setHrMode = useCallback(
    (mode: VideoHRMode) => {
      onUpdateSettings({ hrMode: mode });
      analyzerRef.current.reset();
    },
    [onUpdateSettings]
  );

  // Persistent ~28fps vision processing loop
  useEffect(() => {
    if (!cameraActive) return;

    let lastProcessTs = 0;
    const loop = (now: number) => {
      rafRef.current = requestAnimationFrame(loop);
      if (now - lastProcessTs < 34) return;
      lastProcessTs = now;

      const video = hiddenVideoRef.current;
      const canvas = processCanvasRef.current;
      if (!video || !canvas || video.readyState < 2) return;

      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;

      ctx.drawImage(video, 0, 0, FRAME_W, FRAME_H);
      const imageData = ctx.getImageData(0, 0, FRAME_W, FRAME_H);
      const nextTel = analyzerRef.current.processFrame(
        imageData,
        performance.now(),
        settings.hrMode
      );
      setTelemetry(nextTel);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [cameraActive, settings.hrMode]);

  // Clean up tracks only on root app unmount
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  return {
    cameraActive,
    cameraError,
    devices,
    telemetry,
    streamRef,
    startCamera,
    stopCamera,
    resetAnalyzer,
    setRoiCenter,
    setHrMode,
  };
}
