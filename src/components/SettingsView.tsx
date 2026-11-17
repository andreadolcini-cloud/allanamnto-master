import React, { useState } from 'react';
import { Check, Plus, Trash2, User, UserCheck, Users, Volume2, VolumeX } from 'lucide-react';
import type {
  BluetoothHRState,
  CameraSettings,
  UserAccount,
  UserProfile,
} from '../types/fitness';
import { HR_ZONES, computeMaxHr } from '../utils/hrZones';
import { CameraMonitor, type CameraControllerProps } from './CameraMonitor';

interface SettingsViewProps {
  users: UserAccount[];
  activeUser: UserAccount;
  onSelectUser: (userId: string) => void;
  onCreateUser: (name: string) => void;
  onRenameUser: (userId: string, newName: string) => void;
  onDeleteUser: (userId: string) => void;
  onUpdateProfile: (profile: UserProfile) => void;
  onToggleAudioMuted: (muted: boolean) => void;
  camera: CameraControllerProps;
  onUpdateCameraSettings: (patch: Partial<CameraSettings>) => void;
  bluetooth: BluetoothHRState & {
    connect: () => Promise<void>;
    disconnect: () => void;
  };
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  users,
  activeUser,
  onSelectUser,
  onCreateUser,
  onRenameUser,
  onDeleteUser,
  onUpdateProfile,
  onToggleAudioMuted,
  camera,
  onUpdateCameraSettings,
  bluetooth,
}) => {
  const [newUserName, setNewUserName] = useState('');
  const [editingName, setEditingName] = useState(activeUser.name);

  // Keep rename input synced when switching active user
  React.useEffect(() => {
    setEditingName(activeUser.name);
  }, [activeUser.id, activeUser.name]);

  const maxHr = computeMaxHr(activeUser.profile.age);

  const handleAddUser = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newUserName.trim();
    if (!trimmed) return;
    onCreateUser(trimmed);
    setNewUserName('');
  };

  return (
    <div className="space-y-6">
      {/* Multi-User Device Profiles */}
      <section className="rounded-xl border border-slate-800 bg-[#0F141D] p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-cyan-400" />
            <h2 className="font-display text-2xl font-bold tracking-tight text-white">
              Profili Utente sul Dispositivo
            </h2>
          </div>
          <span className="text-xs text-slate-400">
            Ogni utente mantiene i propri dati fisiologici, schede e storico in locale
          </span>
        </div>

        {/* User Switcher Cards */}
        <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          {users.map((u) => {
            const isActive = u.id === activeUser.id;
            return (
              <div
                key={u.id}
                className={`flex items-center justify-between gap-2 rounded-lg border p-3 transition-colors ${
                  isActive
                    ? 'border-cyan-500/60 bg-cyan-500/10'
                    : 'border-slate-800 bg-[#07090E] hover:border-slate-700'
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelectUser(u.id)}
                  className="flex min-w-0 flex-1 items-center gap-2.5 text-left min-h-[40px]"
                >
                  <div
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                      isActive ? 'bg-cyan-500 text-slate-950' : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    {isActive ? <UserCheck className="h-4 w-4" /> : <User className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-white">{u.name}</div>
                    <div className="font-mono-tabular text-[11px] text-slate-400">
                      {u.profile.age}a · {u.profile.weightKg}kg · {u.history.length} sess.
                    </div>
                  </div>
                </button>

                {users.length > 1 && (
                  <button
                    type="button"
                    onClick={() => onDeleteUser(u.id)}
                    aria-label={`Elimina profilo ${u.name}`}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-rose-400"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Add New User Form */}
        <form onSubmit={handleAddUser} className="mt-4 flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            value={newUserName}
            onChange={(e) => setNewUserName(e.target.value)}
            placeholder="Nome nuovo utente (es. Marco, Giulia)..."
            maxLength={28}
            className="flex-1 rounded-lg border border-slate-700 bg-[#07090E] px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none min-h-[44px]"
          />
          <button
            type="submit"
            disabled={!newUserName.trim()}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 transition-colors hover:bg-cyan-400 disabled:opacity-40 min-h-[44px] whitespace-nowrap"
          >
            <Plus className="h-4 w-4" />
            <span>Aggiungi Utente</span>
          </button>
        </form>
      </section>

      {/* Active User Physiological Data & Preferences */}
      <section className="rounded-xl border border-slate-800 bg-[#0F141D] p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-cyan-400" />
            <h2 className="font-display text-2xl font-bold tracking-tight text-white">
              Dati Fisiologici · {activeUser.name}
            </h2>
          </div>
          <span className="font-mono-tabular text-xs text-slate-400">
            FC Massima (Tanaka): <strong className="text-white">{maxHr} BPM</strong>
          </span>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <label className="block text-xs font-medium text-slate-300">Nome Profilo</label>
            <div className="mt-1 flex gap-2">
              <input
                type="text"
                value={editingName}
                maxLength={28}
                onChange={(e) => setEditingName(e.target.value)}
                onBlur={() => {
                  if (editingName.trim() && editingName.trim() !== activeUser.name) {
                    onRenameUser(activeUser.id, editingName.trim());
                  }
                }}
                className="flex-1 rounded-lg border border-slate-700 bg-[#07090E] px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none min-h-[42px]"
              />
              {editingName.trim() !== activeUser.name && editingName.trim() && (
                <button
                  type="button"
                  onClick={() => onRenameUser(activeUser.id, editingName.trim())}
                  aria-label="Salva nome profilo"
                  className="inline-flex items-center justify-center rounded-lg bg-cyan-500 px-3 text-slate-950 hover:bg-cyan-400 min-h-[42px]"
                >
                  <Check className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300">Età (anni)</label>
            <input
              type="number"
              min={14}
              max={90}
              value={activeUser.profile.age}
              onChange={(e) =>
                onUpdateProfile({
                  ...activeUser.profile,
                  age: Math.max(14, Math.min(90, Number(e.target.value) || 40)),
                })
              }
              className="font-mono-tabular mt-1 w-full rounded-lg border border-slate-700 bg-[#07090E] px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none min-h-[42px]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300">Peso (kg)</label>
            <input
              type="number"
              min={35}
              max={200}
              value={activeUser.profile.weightKg}
              onChange={(e) =>
                onUpdateProfile({
                  ...activeUser.profile,
                  weightKg: Math.max(35, Math.min(200, Number(e.target.value) || 70)),
                })
              }
              className="font-mono-tabular mt-1 w-full rounded-lg border border-slate-700 bg-[#07090E] px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none min-h-[42px]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300">FC a Riposo (BPM)</label>
            <input
              type="number"
              min={35}
              max={110}
              value={activeUser.profile.restingBpm}
              onChange={(e) =>
                onUpdateProfile({
                  ...activeUser.profile,
                  restingBpm: Math.max(35, Math.min(110, Number(e.target.value) || 60)),
                })
              }
              className="font-mono-tabular mt-1 w-full rounded-lg border border-slate-700 bg-[#07090E] px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none min-h-[42px]"
            />
          </div>
        </div>

        {/* Heart Rate Zones Table */}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
          {HR_ZONES.map((z) => {
            const minBpm = Math.round((maxHr * z.minPct) / 100);
            const maxBpm = Math.round((maxHr * z.maxPct) / 100);
            return (
              <div
                key={z.id}
                className="rounded-lg border border-slate-800 bg-[#07090E] px-3 py-2 text-xs"
              >
                <div className={`font-semibold ${z.textClass}`}>{z.shortLabel}</div>
                <div className="font-mono-tabular mt-0.5 text-slate-300">
                  {minBpm}–{maxBpm} BPM
                </div>
              </div>
            );
          })}
        </div>

        {/* Audio Cues Preference */}
        <div className="mt-4 flex items-center justify-between border-t border-slate-800/80 pt-3">
          <div>
            <div className="text-xs font-semibold text-slate-200">Segnali Audio Intervalli</div>
            <div className="text-xs text-slate-400">
              Avvisi acustici su cambio fase, 3-2-1 e fine sessione
            </div>
          </div>
          <button
            type="button"
            onClick={() => onToggleAudioMuted(!activeUser.audioMuted)}
            className={`inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-xs font-semibold min-h-[40px] ${
              activeUser.audioMuted
                ? 'border-rose-500/40 bg-rose-500/15 text-rose-300'
                : 'border-cyan-500/40 bg-cyan-500/15 text-cyan-300'
            }`}
          >
            {activeUser.audioMuted ? (
              <>
                <VolumeX className="h-4 w-4" />
                <span>Audio Disattivato</span>
              </>
            ) : (
              <>
                <Volume2 className="h-4 w-4" />
                <span>Audio Attivo</span>
              </>
            )}
          </button>
        </div>
      </section>

      {/* Analisi Video & Sensori */}
      <CameraMonitor
        camera={camera}
        settings={activeUser.cameraSettings}
        onUpdateSettings={onUpdateCameraSettings}
        bluetooth={bluetooth}
      />
    </div>
  );
};
