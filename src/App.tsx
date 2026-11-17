import { useState } from 'react';
import { BarChart3, CalendarRange, Timer } from 'lucide-react';
import { HistoryView } from './components/HistoryView';
import { OfflineIndicator, PWAInstallButton } from './components/PWAInstallButton';
import { ProgramBuilder } from './components/ProgramBuilder';
import { WorkoutTimerView } from './components/WorkoutTimerView';
import { DEFAULT_PROGRAMS } from './data/defaultPrograms';
import { useBluetoothHR } from './hooks/useBluetoothHR';
import { useLocalStorage } from './hooks/useLocalStorage';
import type {
  UserProfile,
  WeekdayKey,
  WeeklySchedule,
  WorkoutIntensity,
  WorkoutProgram,
  WorkoutSessionLog,
} from './types/fitness';
import {
  DEFAULT_USER_PROFILE,
  DEFAULT_WEEKLY_SCHEDULE,
  getTodayWeekdayKey,
} from './utils/hrZones';

type AppTab = 'workout' | 'programs' | 'history';

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>('workout');
  const [programs, setPrograms] = useLocalStorage<WorkoutProgram[]>(
    'kinetica_programs_v4',
    DEFAULT_PROGRAMS
  );
  const [schedule, setSchedule] = useLocalStorage<WeeklySchedule>(
    'kinetica_schedule_v1',
    DEFAULT_WEEKLY_SCHEDULE
  );
  const [history, setHistory] = useLocalStorage<WorkoutSessionLog[]>(
    'kinetica_history_v1',
    []
  );
  const [userProfile, setUserProfile] = useLocalStorage<UserProfile>(
    'kinetica_profile_v2',
    DEFAULT_USER_PROFILE
  );
  const [workoutIntensity, setWorkoutIntensity] = useLocalStorage<WorkoutIntensity>(
    'kinetica_intensity_v1',
    'moderate'
  );

  const todayKey = getTodayWeekdayKey();
  const todayScheduledId = schedule[todayKey];
  const todayScheduledProgram = programs.find((p) => p.id === todayScheduledId) ?? null;

  const [selectedProgramId, setSelectedProgramId] = useState<string>(
    () => todayScheduledProgram?.id ?? programs[0]?.id ?? DEFAULT_PROGRAMS[0].id
  );

  const bluetooth = useBluetoothHR();

  const handleSaveProgram = (program: WorkoutProgram) => {
    setPrograms((prev) => {
      const exists = prev.some((p) => p.id === program.id);
      if (exists) {
        return prev.map((p) => (p.id === program.id ? program : p));
      }
      return [program, ...prev];
    });
  };

  const handleDeleteProgram = (id: string) => {
    setPrograms((prev) => {
      const next = prev.filter((p) => p.id !== id);
      if (selectedProgramId === id && next.length > 0) {
        setSelectedProgramId(next[0].id);
      }
      return next;
    });
    setSchedule((prev) => {
      const updated = { ...prev };
      (Object.keys(updated) as WeekdayKey[]).forEach((k) => {
        if (updated[k] === id) updated[k] = null;
      });
      return updated;
    });
  };

  const handleUpdateSchedule = (day: WeekdayKey, programId: string | null) => {
    setSchedule((prev) => ({ ...prev, [day]: programId }));
  };

  const handleStartProgram = (programId: string) => {
    setSelectedProgramId(programId);
    setActiveTab('workout');
  };

  const handleSaveSession = (session: WorkoutSessionLog) => {
    setHistory((prev) => [session, ...prev]);
  };

  const handleDeleteSession = (id: string) => {
    setHistory((prev) => prev.filter((s) => s.id !== id));
  };

  const navItems: { id: AppTab; label: string }[] = [
    { id: 'workout', label: 'Allenamento' },
    { id: 'programs', label: 'Programmi' },
    { id: 'history', label: 'Storico' },
  ];

  return (
    <div className="min-h-screen bg-[#07090E] text-slate-100 flex flex-col">
      {/* 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 h-[52px] md:h-16 border-b border-slate-800 bg-[#07090E]/95 backdrop-blur-md">
        <div className="mx-auto flex h-full max-w-7xl items-center justify-between gap-8 px-4 sm:px-6">
          {/* Zone 1: Single-line Brand Wordmark */}
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('workout');
            }}
            className="font-display text-lg sm:text-2xl font-bold tracking-tight text-white whitespace-nowrap truncate max-w-[62vw] sm:max-w-none shrink-0"
          >
            Allenamento Aerobico MASTER
          </a>

          {/* Zone 2: Clean Text Navigation Links */}
          <nav className="hidden md:flex items-center gap-8 text-sm font-medium">
            {navItems.map((item) => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`relative py-2 transition-colors whitespace-nowrap shrink-0 ${
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
          <div className="flex items-center shrink-0">
            <PWAInstallButton />
          </div>
        </div>
      </header>

      {/* Main Content Canvas */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-5 pb-24 sm:px-6 md:py-6 md:pb-8">
        {activeTab === 'workout' && (
          <WorkoutTimerView
            programs={programs}
            selectedProgramId={selectedProgramId}
            onSelectProgram={setSelectedProgramId}
            workoutIntensity={workoutIntensity}
            onChangeIntensity={setWorkoutIntensity}
            userProfile={userProfile}
            bluetooth={bluetooth}
            onSaveSession={handleSaveSession}
            todayScheduledProgramName={todayScheduledProgram?.name ?? null}
          />
        )}

        {activeTab === 'programs' && (
          <ProgramBuilder
            programs={programs}
            onSaveProgram={handleSaveProgram}
            onDeleteProgram={handleDeleteProgram}
            schedule={schedule}
            onUpdateSchedule={handleUpdateSchedule}
            onStartProgram={handleStartProgram}
          />
        )}

        {activeTab === 'history' && (
          <HistoryView
            history={history}
            onDeleteSession={handleDeleteSession}
            userProfile={userProfile}
            onUpdateProfile={setUserProfile}
          />
        )}
      </main>

      {/* Mobile Bottom Tab Bar (Thumb-Zone Anchor) */}
      <nav
        aria-label="Navigazione mobile"
        className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-800 bg-[#07090E]/95 backdrop-blur-md md:hidden pb-safe"
      >
        <div className="grid h-16 grid-cols-3 items-center">
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
        </div>
      </nav>

      <OfflineIndicator />
    </div>
  );
}
