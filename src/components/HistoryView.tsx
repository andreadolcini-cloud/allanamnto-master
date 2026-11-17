import React, { useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { WorkoutSessionLog } from '../types/fitness';
import { HR_ZONES, formatDuration } from '../utils/hrZones';

interface HistoryViewProps {
  userName: string;
  history: WorkoutSessionLog[];
  onDeleteSession: (id: string) => void;
}

export const HistoryView: React.FC<HistoryViewProps> = ({
  userName,
  history,
  onDeleteSession,
}) => {
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    history[0]?.id ?? null
  );

  const stats = useMemo(() => {
    const totalSessions = history.length;
    const totalSeconds = history.reduce((acc, s) => acc + s.durationSec, 0);
    const totalKcal = history.reduce((acc, s) => acc + s.estimatedKcal, 0);
    const bpmList = history.map((s) => s.avgBpm).filter((b): b is number => b !== null && b > 0);
    const avgBpm =
      bpmList.length > 0 ? Math.round(bpmList.reduce((a, b) => a + b, 0) / bpmList.length) : null;
    return { totalSessions, totalSeconds, totalKcal, avgBpm };
  }, [history]);

  const recentForChart = useMemo(() => [...history].slice(0, 10).reverse(), [history]);
  const selectedSession = history.find((s) => s.id === selectedSessionId) ?? history[0] ?? null;

  const sourceLabel = (src: WorkoutSessionLog['hrSourceUsed']) => {
    if (src === 'bluetooth') return 'Fascia BLE';
    if (src === 'video') return 'Video rPPG';
    if (src === 'mixed') return 'BLE + rPPG';
    return 'Solo Timer';
  };

  return (
    <div className="space-y-6">
      {/* Header Context */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-3xl font-bold tracking-tight text-white">
          Storico Allenamenti · {userName}
        </h2>
        <span className="text-xs text-slate-400">
          Dati fisiologici e sensori configurabili in Impostazioni
        </span>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-800 bg-[#0F141D] p-4">
          <div className="text-xs text-slate-400">Sessioni Totali</div>
          <div className="font-mono-tabular mt-1 text-3xl font-bold text-white">
            {stats.totalSessions}
          </div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-[#0F141D] p-4">
          <div className="text-xs text-slate-400">Tempo Totale</div>
          <div className="font-mono-tabular mt-1 text-3xl font-bold text-cyan-400">
            {Math.round(stats.totalSeconds / 60)}{' '}
            <span className="text-sm font-normal text-slate-400">min</span>
          </div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-[#0F141D] p-4">
          <div className="text-xs text-slate-400">FC Media Storica</div>
          <div className="font-mono-tabular mt-1 text-3xl font-bold text-rose-400">
            {stats.avgBpm ?? '--'}{' '}
            <span className="text-sm font-normal text-slate-400">BPM</span>
          </div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-[#0F141D] p-4">
          <div className="text-xs text-slate-400">Energia Stimata</div>
          <div className="font-mono-tabular mt-1 text-3xl font-bold text-amber-400">
            {stats.totalKcal}{' '}
            <span className="text-sm font-normal text-slate-400">kcal</span>
          </div>
        </div>
      </div>

      {/* History List & Detail Chart */}
      {history.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-800 bg-[#0F141D]/60 p-10 text-center">
          <p className="text-sm font-semibold text-slate-200">
            Nessun allenamento registrato per {userName}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Completa una sessione nella scheda Allenamento per visualizzare grafici di frequenza cardiaca, intensità e tempo nelle zone.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          {/* Sessions List */}
          <div className="rounded-xl border border-slate-800 bg-[#0F141D] p-4 lg:col-span-6">
            <h3 className="font-display mb-3 text-2xl font-bold text-white">Registro Sessioni</h3>
            <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
              {history.map((s) => {
                const isSelected = selectedSession?.id === s.id;
                const dateStr = new Date(s.completedAt).toLocaleDateString('it-IT', {
                  day: '2-digit',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                });
                return (
                  <div
                    key={s.id}
                    className={`flex items-center justify-between gap-3 rounded-lg border p-3 transition-colors ${
                      isSelected
                        ? 'border-cyan-500/50 bg-cyan-500/10'
                        : 'border-slate-800 bg-[#07090E] hover:border-slate-700'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedSessionId(s.id)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="truncate text-sm font-semibold text-white">
                        {s.programName}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                        <span>{dateStr}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono-tabular text-slate-200">
                          {formatDuration(s.durationSec)}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono-tabular text-rose-400">
                          {s.avgBpm ? `${s.avgBpm} BPM` : 'No BPM'}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{sourceLabel(s.hrSourceUsed)}</span>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => onDeleteSession(s.id)}
                      aria-label={`Elimina sessione ${s.programName}`}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-rose-400"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Trend & Session Detail SVG Chart */}
          <div className="space-y-4 lg:col-span-6">
            {recentForChart.length >= 2 && (
              <div className="rounded-xl border border-slate-800 bg-[#0F141D] p-4">
                <div className="mb-3 flex items-center justify-between text-xs">
                  <span className="font-semibold text-white">Trend Ultime Sessioni</span>
                  <div className="flex items-center gap-3 text-slate-400">
                    <span className="flex items-center gap-1">
                      <span className="inline-block h-1.5 w-3 bg-rose-500" /> FC Media
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="inline-block h-1.5 w-3 bg-cyan-400" /> Intensità %
                    </span>
                  </div>
                </div>
                <svg viewBox="0 0 400 130" className="h-[130px] w-full overflow-visible">
                  {[0.25, 0.5, 0.75].map((f) => (
                    <line
                      key={f}
                      x1="0"
                      y1={130 * f}
                      x2="400"
                      y2={130 * f}
                      stroke="#1E293B"
                      strokeWidth="1"
                    />
                  ))}
                  {/* Intensity polyline */}
                  <polyline
                    fill="none"
                    stroke="#06B6D4"
                    strokeWidth="2"
                    points={recentForChart
                      .map((s, idx) => {
                        const x = (idx / Math.max(1, recentForChart.length - 1)) * 380 + 10;
                        const y = 120 - (s.avgIntensity / 100) * 100;
                        return `${x},${y}`;
                      })
                      .join(' ')}
                  />
                  {/* BPM polyline */}
                  {recentForChart.some((s) => s.avgBpm !== null) && (
                    <polyline
                      fill="none"
                      stroke="#F43F5E"
                      strokeWidth="2"
                      points={recentForChart
                        .map((s, idx) => {
                          const x = (idx / Math.max(1, recentForChart.length - 1)) * 380 + 10;
                          const bpmVal = s.avgBpm ?? 65;
                          const y = 120 - (Math.max(40, Math.min(200, bpmVal)) - 40) * (100 / 160);
                          return `${x},${y}`;
                        })
                        .join(' ')}
                    />
                  )}
                </svg>
              </div>
            )}

            {selectedSession && (
              <div className="rounded-xl border border-slate-800 bg-[#0F141D] p-4">
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
                  <div>
                    <div className="text-xs text-slate-400">Dettaglio Sessione</div>
                    <h4 className="text-base font-semibold text-white">
                      {selectedSession.programName}
                    </h4>
                  </div>
                  <div className="font-mono-tabular text-right text-xs text-slate-300">
                    <div>Max: {selectedSession.maxBpm ?? '--'} BPM</div>
                    <div>{selectedSession.estimatedKcal} kcal</div>
                  </div>
                </div>

                {/* Time in Zones */}
                <div className="mt-3 space-y-1.5">
                  {HR_ZONES.map((z) => {
                    const sec = selectedSession.zoneSeconds[z.id] ?? 0;
                    const pct =
                      selectedSession.durationSec > 0
                        ? Math.round((sec / selectedSession.durationSec) * 100)
                        : 0;
                    return (
                      <div key={z.id} className="flex items-center gap-3 text-xs">
                        <span className="w-24 shrink-0 text-slate-400">{z.shortLabel}</span>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-800">
                          <div
                            className="h-full"
                            style={{ width: `${pct}%`, backgroundColor: z.colorHex }}
                          />
                        </div>
                        <span className="font-mono-tabular w-12 text-right text-slate-300">
                          {formatDuration(sec)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
