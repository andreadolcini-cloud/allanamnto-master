import { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, CalendarRange, Settings, Timer } from 'lucide-react';
import { HistoryView } from './components/HistoryView';
import { OfflineIndicator, PWAInstallButton } from './components/PWAInstallButton';
import { ProgramBuilder } from './components/ProgramBuilder';
import { SettingsView } from './components/SettingsView';
import { WorkoutTimerView } from './components/WorkoutTimerView';
import { DEFAULT_PROGRAMS } from './data/defaultPrograms';
import { useBluetoothHR } from './hooks/useBluetoothHR';
import { useCameraBiometrics } from './hooks/useCameraBiometrics';
import { useLocalStorage } from './hooks/useLocalStorage';
import type {
  CameraSettings,
  UserAccount,
  UserProfile,
  WeekdayKey,
  WeeklySchedule,
  WorkoutIntensity,
  WorkoutProgram,
  WorkoutSessionLog,
} from './types/fitness';
import { audioCues } from './utils/audioCues';
import {
  DEFAULT_USER_PROFILE,
  DEFAULT_WEEKLY_SCHEDULE,
  getTodayWeekdayKey,
} from './utils/hrZones';

type AppTab = 'workout' | 'programs' | 'history' | 'settings';

const DEFAULT_CAMERA_SETTINGS: CameraSettings = {
  facingMode: 'user',
  selectedDeviceId: '',
  mirrored: true,
  hrMode: 'face',
  showOverlay: true,
};

function readLegacyJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function buildInitialUsers(): UserAccount[] {
  const legacyPrograms = readLegacyJson<WorkoutProgram[]>('kinetica_programs_v4', DEFAULT_PROGRAMS);
  const legacySchedule = readLegacyJson<WeeklySchedule>(
    'kinetica_schedule_v1',
    DEFAULT_WEEKLY_SCHEDULE
  );
  const legacyHistory = readLegacyJson<WorkoutSessionLog[]>('kinetica_history_v1', []);
  const legacyProfile = readLegacyJson<UserProfile>('kinetica_profile_v2', DEFAULT_USER_PROFILE);
  const legacyIntensity = readLegacyJson<WorkoutIntensity>('kinetica_intensity_v1', 'moderate');

  return [
    {
      id: 'user-default',
      name: 'Utente Principale',
      profile: legacyProfile,
      workoutIntensity: legacyIntensity,
      standingOnly: true,
      programs: legacyPrograms.length > 0 ? legacyPrograms : DEFAULT_PROGRAMS,
      schedule: legacySchedule,
      history: legacyHistory,
      audioMuted: false,
      cameraSettings: { ...DEFAULT_CAMERA_SETTINGS },
    },
  ];
}

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>('workout');
  const [users, setUsers] = useLocalStorage<UserAccount[]>(
    'aerobico_users_v1',
    buildInitialUsers()
  );
  const [activeUserId, setActiveUserId] = useLocalStorage<string>(
    'aerobico_active_user_v1',
    'user-default'
  );

  const activeUser = useMemo(() => {
    const found = users.find((u) => u.id === activeUserId) ?? users[0];
    return {
      ...found,
      standingOnly: found.standingOnly ?? true,
    };
  }, [users, activeUserId]);

  // Keep activeUserId synchronized if deleted/missing
  useEffect(() => {
    if (activeUser && activeUser.id !== activeUserId) {
      setActiveUserId(activeUser.id);
    }
  }, [activeUser, activeUserId, setActiveUserId]);

  // Sync audio mute state with active user
  useEffect(() => {
    audioCues.muted = activeUser.audioMuted;
  }, [activeUser.audioMuted]);

  const updateActiveUser = useCallback(
    (updater: (user: UserAccount) => UserAccount) => {
      setUsers((prev) =>
        prev.map((u) => (u.id === activeUser.id ? updater(u) : u))
      );
    },
    [activeUser.id, setUsers]
  );

  const handleUpdateCameraSettings = useCallback(
    (patch: Partial<CameraSettings>) => {
      updateActiveUser((u) => ({
        ...u,
        cameraSettings: { ...u.cameraSettings, ...patch },
      }));
    },
    [updateActiveUser]
  );

  const bluetooth = useBluetoothHR();
  const camera = useCameraBiometrics(activeUser.cameraSettings, handleUpdateCameraSettings);

  const todayKey = getTodayWeekdayKey();
  const todayScheduledId = activeUser.schedule[todayKey];
  const todayScheduledProgram =
    activeUser.programs.find((p) => p.id === todayScheduledId) ?? null;

  const [selectedProgramId, setSelectedProgramId] = useState<string>(
    () => todayScheduledProgram?.id ?? activeUser.programs[0]?.id ?? DEFAULT_PROGRAMS[0].id
  );

  // When switching users, select that user's today-scheduled or first program
  useEffect(() => {
    const todayId = activeUser.schedule[getTodayWeekdayKey()];
    const match =
      activeUser.programs.find((p) => p.id === todayId) ?? activeUser.programs[0];
    if (match) {
      setSelectedProgramId(match.id);
    }
  }, [activeUser.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // User account management handlers
  const handleCreateUser = (name: string) => {
    const newId = `user-${Date.now()}`;
    const newUser: UserAccount = {
      id: newId,
      name,
      profile: { ...DEFAULT_USER_PROFILE },
      workoutIntensity: 'moderate',
      standingOnly: true,
      programs: DEFAULT_PROGRAMS.map((p) => ({ ...p, steps: p.steps.map((s) => ({ ...s })) })),
      schedule: { ...DEFAULT_WEEKLY_SCHEDULE },
      history: [],
      audioMuted: false,
      cameraSettings: { ...DEFAULT_CAMERA_SETTINGS },
    };
    setUsers((prev) => [...prev, newUser]);
    setActiveUserId(newId);
  };

  const handleRenameUser = (userId: string, newName: string) => {
    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, name: newName } : u))
    );
  };

  const handleDeleteUser = (userId: string) => {
    setUsers((prev) => {
      if (prev.length <= 1) return prev;
      const next = prev.filter((u) => u.id !== userId);
      if (activeUserId === userId && next[0]) {
        setActiveUserId(next[0].id);
      }
      return next;
    });
  };

  // Active user data handlers
  const handleSaveProgram = (program: WorkoutProgram) => {
    updateActiveUser((u) => {
      const exists = u.programs.some((p) => p.id === program.id);
      return {
        ...u,
        programs: exists
          ? u.programs.map((p) => (p.id === program.id ? program : p))
          : [program, ...u.programs],
      };
    });
  };

  const handleDeleteProgram = (id: string) => {
    updateActiveUser((u) => {
      const nextPrograms = u.programs.filter((p) => p.id !== id);
      if (selectedProgramId === id && nextPrograms.length > 0) {
        setSelectedProgramId(nextPrograms[0].id);
      }
      const nextSchedule = { ...u.schedule };
      (Object.keys(nextSchedule) as WeekdayKey[]).forEach((k) => {
        if (nextSchedule[k] === id) nextSchedule[k] = null;
      });
      return { ...u, programs: nextPrograms, schedule: nextSchedule };
    });
  };

  const handleUpdateSchedule = (day: WeekdayKey, programId: string | null) => {
    updateActiveUser((u) => ({
      ...u,
      schedule: { ...u.schedule, [day]: programId },
    }));
  };

  const handleStartProgram = (programId: string) => {
    setSelectedProgramId(programId);
    setActiveTab('workout');
  };

  const handleSaveSession = (session: WorkoutSessionLog) => {
    updateActiveUser((u) => ({
      ...u,
      history: [session, ...u.history],
    }));
  };

  const handleDeleteSession = (id: string) => {
    updateActiveUser((u) => ({
      ...u,
      history: u.history.filter((s) => s.id !== id),
    }));
  };

  const handleUpdateProfile = (profile: UserProfile) => {
    updateActiveUser((u) => ({ ...u, profile }));
  };

  const handleChangeIntensity = (workoutIntensity: WorkoutIntensity) => {
    updateActiveUser((u) => ({ ...u, workoutIntensity }));
  };

  const handleToggleStandingOnly = (standingOnly: boolean) => {
    updateActiveUser((u) => ({ ...u, standingOnly }));
  };

  const handleToggleAudioMuted = (audioMuted: boolean) => {
    updateActiveUser((u) => ({ ...u, audioMuted }));
  };

  const navItems: { id: AppTab; label: string }[] = [
    { id: 'workout', label: 'Allenamento' },
    { id: 'programs', label: 'Programmi' },
    { id: 'history', label: 'Storico' },
    { id: 'settings', label: 'Impostazioni' },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-[#07090E] text-slate-100">
      {/* 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 h-[52px] border-b border-slate-800 bg-[#07090E]/95 backdrop-blur-md md:h-16">
        <div className="mx-auto flex h-full max-w-7xl items-center justify-between gap-6 px-4 sm:px-6">
          {/* Zone 1: Brand Wordmark + Team Logo */}
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('workout');
            }}
            className="flex min-w-0 shrink-0 items-center gap-2.5"
          >
            <img
              src="/assets/aistudio/Designer1_6722ae60.png"
              alt="Logo Rafting Team Ivrea River Stones"
              referrerPolicy="no-referrer"
              className="h-9 w-9 shrink-0 rounded-lg object-contain sm:h-11 sm:w-11"
            />
            <span className="font-display max-w-[48vw] truncate whitespace-nowrap text-lg font-bold tracking-tight text-white sm:max-w-none sm:text-2xl">
              Allenamento Aerobico MASTER
            </span>
          </a>

          {/* Zone 2: Clean Text Navigation Links */}
          <nav className="hidden items-center gap-7 text-sm font-medium md:flex">
            {navItems.map((item) => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`relative shrink-0 whitespace-nowrap py-2 transition-colors ${
                    active ? 'text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {item.label}
                  {active && (
                    <span className="absolute inset-x-0 -bottom-[1px] h-0.5 bg-cyan-400" />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Single Primary Action */}
          <div className="flex shrink-0 items-center gap-3">
            <span className="hidden text-xs text-slate-400 lg:inline">
              {activeUser.name}
            </span>
            <PWAInstallButton />
          </div>
        </div>
      </header>

      {/* Main Content Canvas */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-5 pb-24 sm:px-6 md:py-6 md:pb-8">
        {activeTab === 'workout' && (
          <WorkoutTimerView
            users={users}
            activeUser={activeUser}
            onSelectUser={setActiveUserId}
            selectedProgramId={selectedProgramId}
            onSelectProgram={setSelectedProgramId}
            onChangeIntensity={handleChangeIntensity}
            onToggleStandingOnly={handleToggleStandingOnly}
            videoTelemetry={camera.telemetry}
            cameraActive={camera.cameraActive}
            cameraError={camera.cameraError}
            onStartCamera={() => void camera.startCamera()}
            onStopCamera={camera.stopCamera}
            bluetooth={bluetooth}
            onSaveSession={handleSaveSession}
            onOpenSettings={() => setActiveTab('settings')}
            todayScheduledProgramName={todayScheduledProgram?.name ?? null}
          />
        )}

        {activeTab === 'programs' && (
          <ProgramBuilder
            programs={activeUser.programs}
            onSaveProgram={handleSaveProgram}
            onDeleteProgram={handleDeleteProgram}
            schedule={activeUser.schedule}
            onUpdateSchedule={handleUpdateSchedule}
            onStartProgram={handleStartProgram}
          />
        )}

        {activeTab === 'history' && (
          <HistoryView
            userName={activeUser.name}
            history={activeUser.history}
            onDeleteSession={handleDeleteSession}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsView
            users={users}
            activeUser={activeUser}
            onSelectUser={setActiveUserId}
            onCreateUser={handleCreateUser}
            onRenameUser={handleRenameUser}
            onDeleteUser={handleDeleteUser}
            onUpdateProfile={handleUpdateProfile}
            onToggleAudioMuted={handleToggleAudioMuted}
            camera={camera}
            onUpdateCameraSettings={handleUpdateCameraSettings}
            bluetooth={bluetooth}
          />
        )}
      </main>

      {/* Mobile Bottom Tab Bar (Thumb-Zone Anchor) */}
      <nav
        aria-label="Navigazione mobile"
        className="pb-safe fixed bottom-0 left-0 right-0 z-40 border-t border-slate-800 bg-[#07090E]/95 backdrop-blur-md md:hidden"
      >
        <div className="grid h-16 grid-cols-4 items-center">
          <button
            type="button"
            onClick={() => setActiveTab('workout')}
            className={`flex min-h-[48px] flex-col items-center justify-center gap-1 transition-colors ${
              activeTab === 'workout' ? 'text-cyan-400' : 'text-slate-400'
            }`}
          >
            <Timer className="h-5 w-5" />
            <span className="text-[11px] font-medium">Allenamento</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('programs')}
            className={`flex min-h-[48px] flex-col items-center justify-center gap-1 transition-colors ${
              activeTab === 'programs' ? 'text-cyan-400' : 'text-slate-400'
            }`}
          >
            <CalendarRange className="h-5 w-5" />
            <span className="text-[11px] font-medium">Programmi</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`flex min-h-[48px] flex-col items-center justify-center gap-1 transition-colors ${
              activeTab === 'history' ? 'text-cyan-400' : 'text-slate-400'
            }`}
          >
            <BarChart3 className="h-5 w-5" />
            <span className="text-[11px] font-medium">Storico</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            className={`flex min-h-[48px] flex-col items-center justify-center gap-1 transition-colors ${
              activeTab === 'settings' ? 'text-cyan-400' : 'text-slate-400'
            }`}
          >
            <Settings className="h-5 w-5" />
            <span className="text-[11px] font-medium">Impostazioni</span>
          </button>
        </div>
      </nav>

      <OfflineIndicator />
    </div>
  );
}
