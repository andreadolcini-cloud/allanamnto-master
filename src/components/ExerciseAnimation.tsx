import React, { useEffect, useState } from 'react';
import type { ExerciseAnimationId } from '../types/fitness';

interface Vec2 {
  x: number;
  y: number;
}

interface Pose {
  head: Vec2;
  neck: Vec2;
  pelvis: Vec2;
  lShoulder: Vec2;
  rShoulder: Vec2;
  lElbow: Vec2;
  rElbow: Vec2;
  lHand: Vec2;
  rHand: Vec2;
  lHip: Vec2;
  rHip: Vec2;
  lKnee: Vec2;
  rKnee: Vec2;
  lFoot: Vec2;
  rFoot: Vec2;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpVec(a: Vec2, b: Vec2, t: number): Vec2 {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
}

function lerpPose(p1: Pose, p2: Pose, t: number): Pose {
  return {
    head: lerpVec(p1.head, p2.head, t),
    neck: lerpVec(p1.neck, p2.neck, t),
    pelvis: lerpVec(p1.pelvis, p2.pelvis, t),
    lShoulder: lerpVec(p1.lShoulder, p2.lShoulder, t),
    rShoulder: lerpVec(p1.rShoulder, p2.rShoulder, t),
    lElbow: lerpVec(p1.lElbow, p2.lElbow, t),
    rElbow: lerpVec(p1.rElbow, p2.rElbow, t),
    lHand: lerpVec(p1.lHand, p2.lHand, t),
    rHand: lerpVec(p1.rHand, p2.rHand, t),
    lHip: lerpVec(p1.lHip, p2.lHip, t),
    rHip: lerpVec(p1.rHip, p2.rHip, t),
    lKnee: lerpVec(p1.lKnee, p2.lKnee, t),
    rKnee: lerpVec(p1.rKnee, p2.rKnee, t),
    lFoot: lerpVec(p1.lFoot, p2.lFoot, t),
    rFoot: lerpVec(p1.rFoot, p2.rFoot, t),
  };
}

function computePose(id: ExerciseAnimationId, phase01: number): Pose {
  const tau = Math.PI * 2;
  const s = (Math.sin(phase01 * tau) + 1) * 0.5; // 0..1 smooth oscillation
  const c = (Math.cos(phase01 * tau) + 1) * 0.5;

  switch (id) {
    case 'jumping-jacks': {
      // Smooth 0..1..0 jack cycle with mid-transition hop and circular arm arc
      const spread = s;
      const hop = -Math.abs(Math.cos(phase01 * tau)) * 4.5;
      // Arm angle sweeps from +80 deg (down by sides) to -72 deg (overhead)
      const armAngle = lerp(1.38, -1.26, spread);
      const lArmX = 52 - Math.cos(armAngle) * 23;
      const lArmY = 33 + Math.sin(armAngle) * 23 + hop;
      const rArmX = 68 + Math.cos(armAngle) * 23;
      const rArmY = 33 + Math.sin(armAngle) * 23 + hop;
      return {
        head: { x: 60, y: 22 + hop },
        neck: { x: 60, y: 31 + hop },
        pelvis: { x: 60, y: 60 + hop },
        lShoulder: { x: 52, y: 33 + hop },
        rShoulder: { x: 68, y: 33 + hop },
        lElbow: { x: lerp(52, lArmX, 0.52), y: lerp(33 + hop, lArmY, 0.52) },
        rElbow: { x: lerp(68, rArmX, 0.52), y: lerp(33 + hop, rArmY, 0.52) },
        lHand: { x: lArmX, y: lArmY },
        rHand: { x: rArmX, y: rArmY },
        lHip: { x: 55, y: 60 + hop },
        rHip: { x: 65, y: 60 + hop },
        lKnee: { x: lerp(55, 42, spread), y: 81 + hop * 0.65 },
        rKnee: { x: lerp(65, 78, spread), y: 81 + hop * 0.65 },
        lFoot: { x: lerp(55, 33, spread), y: 103 + hop * 0.35 },
        rFoot: { x: lerp(65, 87, spread), y: 103 + hop * 0.35 },
      };
    }

    case 'high-knees': {
      const legWave = Math.sin(phase01 * tau); // -1..1
      const lUp = Math.max(0, legWave);
      const rUp = Math.max(0, -legWave);
      const bounce = -Math.abs(legWave) * 3;
      return {
        head: { x: 60, y: 21 + bounce },
        neck: { x: 60, y: 30 + bounce },
        pelvis: { x: 60, y: 59 + bounce },
        lShoulder: { x: 52, y: 33 + bounce },
        rShoulder: { x: 68, y: 33 + bounce },
        lElbow: { x: 46, y: lerp(47, 42, rUp) + bounce },
        rElbow: { x: 74, y: lerp(47, 42, lUp) + bounce },
        lHand: { x: 44, y: lerp(55, 32, rUp) + bounce },
        rHand: { x: 76, y: lerp(55, 32, lUp) + bounce },
        lHip: { x: 55, y: 59 + bounce },
        rHip: { x: 65, y: 59 + bounce },
        lKnee: { x: 53, y: lerp(81, 56, lUp) + bounce * 0.4 },
        rKnee: { x: 67, y: lerp(81, 56, rUp) + bounce * 0.4 },
        lFoot: { x: 53, y: lerp(103, 78, lUp) },
        rFoot: { x: 67, y: lerp(103, 78, rUp) },
      };
    }

    case 'butt-kicks': {
      const legWave = Math.sin(phase01 * tau);
      const lKick = Math.max(0, legWave);
      const rKick = Math.max(0, -legWave);
      const bounce = -Math.abs(legWave) * 2.5;
      return {
        head: { x: 62, y: 22 + bounce },
        neck: { x: 61, y: 31 + bounce },
        pelvis: { x: 59, y: 60 + bounce },
        lShoulder: { x: 54, y: 33 + bounce },
        rShoulder: { x: 68, y: 33 + bounce },
        lElbow: { x: 48, y: 46 + bounce },
        rElbow: { x: 74, y: 46 + bounce },
        lHand: { x: lerp(52, 62, rKick), y: lerp(52, 39, rKick) + bounce },
        rHand: { x: lerp(72, 80, lKick), y: lerp(52, 39, lKick) + bounce },
        lHip: { x: 56, y: 60 + bounce },
        rHip: { x: 63, y: 60 + bounce },
        lKnee: { x: lerp(56, 61, lKick), y: 82 + bounce * 0.4 },
        rKnee: { x: lerp(63, 68, rKick), y: 82 + bounce * 0.4 },
        lFoot: { x: lerp(55, 36, lKick), y: lerp(103, 68, lKick) },
        rFoot: { x: lerp(64, 42, rKick), y: lerp(103, 68, rKick) },
      };
    }

    case 'squat-jump': {
      // 0..0.45 squat down, 0.45..0.75 jump up, 0.75..1 land
      const stand: Pose = {
        head: { x: 60, y: 22 },
        neck: { x: 60, y: 31 },
        pelvis: { x: 60, y: 60 },
        lShoulder: { x: 52, y: 33 },
        rShoulder: { x: 68, y: 33 },
        lElbow: { x: 46, y: 47 },
        rElbow: { x: 74, y: 47 },
        lHand: { x: 45, y: 60 },
        rHand: { x: 75, y: 60 },
        lHip: { x: 54, y: 60 },
        rHip: { x: 66, y: 60 },
        lKnee: { x: 53, y: 82 },
        rKnee: { x: 67, y: 82 },
        lFoot: { x: 53, y: 103 },
        rFoot: { x: 67, y: 103 },
      };
      const squat: Pose = {
        head: { x: 62, y: 44 },
        neck: { x: 60, y: 52 },
        pelvis: { x: 55, y: 79 },
        lShoulder: { x: 53, y: 53 },
        rShoulder: { x: 67, y: 53 },
        lElbow: { x: 65, y: 61 },
        rElbow: { x: 74, y: 61 },
        lHand: { x: 76, y: 56 },
        rHand: { x: 84, y: 56 },
        lHip: { x: 51, y: 79 },
        rHip: { x: 60, y: 79 },
        lKnee: { x: 68, y: 81 },
        rKnee: { x: 75, y: 81 },
        lFoot: { x: 54, y: 103 },
        rFoot: { x: 68, y: 103 },
      };
      const jump: Pose = {
        head: { x: 60, y: 13 },
        neck: { x: 60, y: 22 },
        pelvis: { x: 60, y: 50 },
        lShoulder: { x: 52, y: 24 },
        rShoulder: { x: 68, y: 24 },
        lElbow: { x: 48, y: 14 },
        rElbow: { x: 72, y: 14 },
        lHand: { x: 50, y: 5 },
        rHand: { x: 70, y: 5 },
        lHip: { x: 55, y: 50 },
        rHip: { x: 65, y: 50 },
        lKnee: { x: 55, y: 72 },
        rKnee: { x: 65, y: 72 },
        lFoot: { x: 55, y: 92 },
        rFoot: { x: 65, y: 92 },
      };
      if (phase01 < 0.35) return lerpPose(stand, squat, phase01 / 0.35);
      if (phase01 < 0.6) return lerpPose(squat, jump, (phase01 - 0.35) / 0.25);
      if (phase01 < 0.85) return lerpPose(jump, squat, (phase01 - 0.6) / 0.25);
      return lerpPose(squat, stand, (phase01 - 0.85) / 0.15);
    }

    case 'mountain-climbers': {
      const drive = Math.sin(phase01 * tau);
      const lFwd = Math.max(0, drive);
      const rFwd = Math.max(0, -drive);
      return {
        head: { x: 93, y: 56 },
        neck: { x: 85, y: 63 },
        pelvis: { x: 51, y: 73 },
        lShoulder: { x: 84, y: 65 },
        rShoulder: { x: 86, y: 65 },
        lElbow: { x: 84, y: 84 },
        rElbow: { x: 87, y: 84 },
        lHand: { x: 84, y: 102 },
        rHand: { x: 88, y: 102 },
        lHip: { x: 50, y: 73 },
        rHip: { x: 53, y: 75 },
        lKnee: { x: lerp(34, 68, lFwd), y: lerp(88, 82, lFwd) },
        rKnee: { x: lerp(36, 70, rFwd), y: lerp(88, 84, rFwd) },
        lFoot: { x: lerp(18, 58, lFwd), y: lerp(102, 99, lFwd) },
        rFoot: { x: lerp(21, 61, rFwd), y: lerp(102, 100, rFwd) },
      };
    }

    case 'plank-jacks': {
      const open = s;
      return {
        head: { x: 92, y: 56 },
        neck: { x: 84, y: 63 },
        pelvis: { x: 50, y: 73 },
        lShoulder: { x: 83, y: 65 },
        rShoulder: { x: 86, y: 65 },
        lElbow: { x: 83, y: 84 },
        rElbow: { x: 87, y: 84 },
        lHand: { x: 83, y: 102 },
        rHand: { x: 88, y: 102 },
        lHip: { x: 49, y: lerp(73, 70, open) },
        rHip: { x: 52, y: lerp(74, 77, open) },
        lKnee: { x: 34, y: lerp(87, 81, open) },
        rKnee: { x: 36, y: lerp(88, 93, open) },
        lFoot: { x: 18, y: lerp(101, 90, open) },
        rFoot: { x: 20, y: lerp(102, 106, open) },
      };
    }

    case 'burpees': {
      const stand: Pose = {
        head: { x: 60, y: 22 },
        neck: { x: 60, y: 31 },
        pelvis: { x: 60, y: 60 },
        lShoulder: { x: 53, y: 33 },
        rShoulder: { x: 67, y: 33 },
        lElbow: { x: 48, y: 47 },
        rElbow: { x: 72, y: 47 },
        lHand: { x: 47, y: 60 },
        rHand: { x: 73, y: 60 },
        lHip: { x: 55, y: 60 },
        rHip: { x: 65, y: 60 },
        lKnee: { x: 55, y: 82 },
        rKnee: { x: 65, y: 82 },
        lFoot: { x: 55, y: 103 },
        rFoot: { x: 65, y: 103 },
      };
      const crouch: Pose = {
        head: { x: 70, y: 66 },
        neck: { x: 66, y: 73 },
        pelvis: { x: 49, y: 82 },
        lShoulder: { x: 65, y: 75 },
        rShoulder: { x: 69, y: 75 },
        lElbow: { x: 71, y: 89 },
        rElbow: { x: 75, y: 89 },
        lHand: { x: 73, y: 102 },
        rHand: { x: 77, y: 102 },
        lHip: { x: 48, y: 82 },
        rHip: { x: 52, y: 84 },
        lKnee: { x: 62, y: 86 },
        rKnee: { x: 66, y: 86 },
        lFoot: { x: 56, y: 103 },
        rFoot: { x: 60, y: 103 },
      };
      const plank: Pose = {
        head: { x: 92, y: 58 },
        neck: { x: 84, y: 65 },
        pelvis: { x: 50, y: 76 },
        lShoulder: { x: 83, y: 67 },
        rShoulder: { x: 86, y: 67 },
        lElbow: { x: 83, y: 85 },
        rElbow: { x: 87, y: 85 },
        lHand: { x: 83, y: 102 },
        rHand: { x: 87, y: 102 },
        lHip: { x: 49, y: 76 },
        rHip: { x: 52, y: 77 },
        lKnee: { x: 34, y: 89 },
        rKnee: { x: 36, y: 90 },
        lFoot: { x: 18, y: 102 },
        rFoot: { x: 21, y: 103 },
      };
      const jump: Pose = {
        head: { x: 60, y: 13 },
        neck: { x: 60, y: 22 },
        pelvis: { x: 60, y: 50 },
        lShoulder: { x: 53, y: 24 },
        rShoulder: { x: 67, y: 24 },
        lElbow: { x: 49, y: 14 },
        rElbow: { x: 71, y: 14 },
        lHand: { x: 51, y: 5 },
        rHand: { x: 69, y: 5 },
        lHip: { x: 55, y: 50 },
        rHip: { x: 65, y: 50 },
        lKnee: { x: 55, y: 72 },
        rKnee: { x: 65, y: 72 },
        lFoot: { x: 55, y: 93 },
        rFoot: { x: 65, y: 93 },
      };

      if (phase01 < 0.2) return lerpPose(stand, crouch, phase01 / 0.2);
      if (phase01 < 0.42) return lerpPose(crouch, plank, (phase01 - 0.2) / 0.22);
      if (phase01 < 0.62) return lerpPose(plank, crouch, (phase01 - 0.42) / 0.2);
      if (phase01 < 0.82) return lerpPose(crouch, jump, (phase01 - 0.62) / 0.2);
      return lerpPose(jump, stand, (phase01 - 0.82) / 0.18);
    }

    case 'shadow-boxing': {
      const punch = Math.sin(phase01 * tau);
      const lPunch = Math.max(0, punch);
      const rPunch = Math.max(0, -punch);
      const sway = punch * 3;
      return {
        head: { x: 60 + sway * 0.5, y: 22 },
        neck: { x: 60 + sway * 0.4, y: 31 },
        pelvis: { x: 60, y: 61 },
        lShoulder: { x: 51 + sway * 0.4, y: 34 },
        rShoulder: { x: 69 + sway * 0.4, y: 34 },
        lElbow: { x: lerp(48, 66, lPunch), y: lerp(46, 34, lPunch) },
        rElbow: { x: lerp(72, 85, rPunch), y: lerp(46, 34, rPunch) },
        lHand: { x: lerp(56, 86, lPunch), y: lerp(33, 30, lPunch) },
        rHand: { x: lerp(65, 98, rPunch), y: lerp(33, 30, rPunch) },
        lHip: { x: 54, y: 61 },
        rHip: { x: 66, y: 61 },
        lKnee: { x: 49, y: 82 },
        rKnee: { x: 71, y: 82 },
        lFoot: { x: 45, y: 103 },
        rFoot: { x: 75, y: 103 },
      };
    }

    case 'skater-hops': {
      const lat = Math.sin(phase01 * tau); // -1 left .. +1 right
      const cx = 60 + lat * 20;
      const bounce = -Math.abs(Math.cos(phase01 * tau)) * 5;
      const goRight = lat >= 0;
      return {
        head: { x: cx + (goRight ? 3 : -3), y: 26 + bounce },
        neck: { x: cx + (goRight ? 2 : -2), y: 35 + bounce },
        pelvis: { x: cx, y: 63 + bounce },
        lShoulder: { x: cx - 7, y: 37 + bounce },
        rShoulder: { x: cx + 7, y: 37 + bounce },
        lElbow: { x: cx + (goRight ? 8 : -16), y: 49 + bounce },
        rElbow: { x: cx + (goRight ? 16 : -8), y: 49 + bounce },
        lHand: { x: cx + (goRight ? 15 : -22), y: 44 + bounce },
        rHand: { x: cx + (goRight ? 22 : -15), y: 44 + bounce },
        lHip: { x: cx - 4, y: 63 + bounce },
        rHip: { x: cx + 4, y: 63 + bounce },
        lKnee: { x: goRight ? cx - 14 : cx - 4, y: goRight ? 79 : 83 },
        rKnee: { x: goRight ? cx + 4 : cx + 14, y: goRight ? 83 : 79 },
        lFoot: { x: goRight ? cx - 24 : cx - 3, y: goRight ? 94 : 103 },
        rFoot: { x: goRight ? cx + 3 : cx + 24, y: goRight ? 103 : 94 },
      };
    }

    case 'lunge-split': {
      const drop = s;
      return {
        head: { x: 60, y: lerp(22, 34, drop) },
        neck: { x: 60, y: lerp(31, 43, drop) },
        pelvis: { x: 60, y: lerp(60, 72, drop) },
        lShoulder: { x: 52, y: lerp(33, 45, drop) },
        rShoulder: { x: 68, y: lerp(33, 45, drop) },
        lElbow: { x: 47, y: lerp(46, 56, drop) },
        rElbow: { x: 73, y: lerp(46, 56, drop) },
        lHand: { x: 49, y: lerp(56, 46, drop) },
        rHand: { x: 71, y: lerp(56, 46, drop) },
        lHip: { x: 55, y: lerp(60, 72, drop) },
        rHip: { x: 65, y: lerp(60, 72, drop) },
        lKnee: { x: lerp(54, 42, drop), y: lerp(82, 92, drop) },
        rKnee: { x: lerp(66, 78, drop), y: lerp(82, 76, drop) },
        lFoot: { x: lerp(54, 34, drop), y: 103 },
        rFoot: { x: lerp(66, 79, drop), y: 103 },
      };
    }

    case 'warmup-march': {
      const wave = Math.sin(phase01 * tau);
      const lUp = Math.max(0, wave);
      const rUp = Math.max(0, -wave);
      const angle = phase01 * tau;
      return {
        head: { x: 60, y: 22 },
        neck: { x: 60, y: 31 },
        pelvis: { x: 60, y: 60 },
        lShoulder: { x: 52, y: 33 },
        rShoulder: { x: 68, y: 33 },
        lElbow: { x: 52 - Math.cos(angle) * 14, y: 33 + Math.sin(angle) * 14 },
        rElbow: { x: 68 + Math.cos(angle) * 14, y: 33 + Math.sin(angle) * 14 },
        lHand: { x: 52 - Math.cos(angle) * 24, y: 33 + Math.sin(angle) * 24 },
        rHand: { x: 68 + Math.cos(angle) * 24, y: 33 + Math.sin(angle) * 24 },
        lHip: { x: 55, y: 60 },
        rHip: { x: 65, y: 60 },
        lKnee: { x: 54, y: lerp(82, 68, lUp) },
        rKnee: { x: 66, y: lerp(82, 68, rUp) },
        lFoot: { x: 54, y: lerp(103, 90, lUp) },
        rFoot: { x: 66, y: lerp(103, 90, rUp) },
      };
    }

    case 'breathing-cooldown':
    default: {
      const breath = c;
      return {
        head: { x: 60, y: lerp(23, 20, breath) },
        neck: { x: 60, y: lerp(32, 29, breath) },
        pelvis: { x: 60, y: 60 },
        lShoulder: { x: 52, y: lerp(34, 31, breath) },
        rShoulder: { x: 68, y: lerp(34, 31, breath) },
        lElbow: { x: lerp(45, 39, breath), y: lerp(49, 22, breath) },
        rElbow: { x: lerp(75, 81, breath), y: lerp(49, 22, breath) },
        lHand: { x: lerp(44, 52, breath), y: lerp(62, 11, breath) },
        rHand: { x: lerp(76, 68, breath), y: lerp(62, 11, breath) },
        lHip: { x: 55, y: 60 },
        rHip: { x: 65, y: 60 },
        lKnee: { x: 54, y: 82 },
        rKnee: { x: 66, y: 82 },
        lFoot: { x: 54, y: 103 },
        rFoot: { x: 66, y: 103 },
      };
    }
  }
}

const CYCLE_MS: Record<ExerciseAnimationId, number> = {
  'jumping-jacks': 950,
  'high-knees': 720,
  'butt-kicks': 740,
  'squat-jump': 1450,
  'mountain-climbers': 850,
  'plank-jacks': 900,
  'burpees': 2100,
  'shadow-boxing': 880,
  'skater-hops': 1250,
  'lunge-split': 1350,
  'warmup-march': 1400,
  'breathing-cooldown': 3200,
};

interface ExerciseAnimationProps {
  animationId: ExerciseAnimationId;
  active?: boolean;
  accentColor?: string;
  speedMultiplier?: number;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const ExerciseAnimation: React.FC<ExerciseAnimationProps> = ({
  animationId,
  active = true,
  accentColor = '#06B6D4',
  speedMultiplier = 1,
  size = 'md',
  className = '',
}) => {
  const [phase, setPhase] = useState(0.22);

  useEffect(() => {
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!active || prefersReduced) {
      return;
    }

    let rafId = 0;
    const baseCycle = CYCLE_MS[animationId] ?? 1100;
    const cycle = baseCycle / Math.max(0.5, speedMultiplier);
    const start = performance.now();

    const tick = (now: number) => {
      const p = ((now - start) % cycle) / cycle;
      setPhase(p);
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [active, animationId, speedMultiplier]);

  const pose = computePose(animationId, phase);

  const dims =
    size === 'sm'
      ? 'h-14 w-14'
      : size === 'lg'
      ? 'h-32 w-32 sm:h-36 sm:w-36'
      : 'h-24 w-24';

  return (
    <div
      className={`relative flex items-center justify-center rounded-lg border border-slate-800 bg-[#07090E] overflow-hidden shrink-0 ${dims} ${className}`}
    >
      <svg viewBox="0 0 120 116" className="h-full w-full" aria-hidden="true">
        {/* Floor reference line */}
        <line x1="14" y1="105" x2="106" y2="105" stroke="#1E293B" strokeWidth="2" strokeLinecap="round" />

        {/* Back/left limbs */}
        <g stroke="#64748B" strokeWidth="4.2" strokeLinecap="round" strokeLinejoin="round" fill="none">
          <polyline
            points={`${pose.lShoulder.x},${pose.lShoulder.y} ${pose.lElbow.x},${pose.lElbow.y} ${pose.lHand.x},${pose.lHand.y}`}
          />
          <polyline
            points={`${pose.lHip.x},${pose.lHip.y} ${pose.lKnee.x},${pose.lKnee.y} ${pose.lFoot.x},${pose.lFoot.y}`}
          />
        </g>

        {/* Torso & shoulders */}
        <g stroke="#E2E8F0" strokeWidth="4.8" strokeLinecap="round" strokeLinejoin="round" fill="none">
          <line x1={pose.neck.x} y1={pose.neck.y} x2={pose.pelvis.x} y2={pose.pelvis.y} />
          <line x1={pose.lShoulder.x} y1={pose.lShoulder.y} x2={pose.rShoulder.x} y2={pose.rShoulder.y} />
        </g>

        {/* Front/right active limbs in accent phosphor */}
        <g stroke={accentColor} strokeWidth="4.4" strokeLinecap="round" strokeLinejoin="round" fill="none">
          <polyline
            points={`${pose.rShoulder.x},${pose.rShoulder.y} ${pose.rElbow.x},${pose.rElbow.y} ${pose.rHand.x},${pose.rHand.y}`}
          />
          <polyline
            points={`${pose.rHip.x},${pose.rHip.y} ${pose.rKnee.x},${pose.rKnee.y} ${pose.rFoot.x},${pose.rFoot.y}`}
          />
        </g>

        {/* Head */}
        <circle cx={pose.head.x} cy={pose.head.y} r="7.5" fill="#F8FAFC" />
      </svg>
    </div>
  );
};
