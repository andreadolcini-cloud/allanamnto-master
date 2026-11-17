import React, { useState } from 'react';
import { Download, Smartphone, WifiOff, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={() => void install()}
        className="inline-flex items-center justify-center gap-2 rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 transition-colors hover:bg-cyan-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 whitespace-nowrap shrink-0 min-h-[40px]"
      >
        <Download className="h-4 w-4" />
        <span>Installa App</span>
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setShowGuide(true)}
        className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3.5 py-2 text-sm font-medium text-slate-200 transition-colors hover:border-slate-500 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 whitespace-nowrap shrink-0 min-h-[40px]"
      >
        <Smartphone className="h-4 w-4 text-cyan-400" />
        <span>Installa PWA</span>
      </button>

      {showGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-xl border border-slate-800 bg-[#0F141D] p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <h3 className="font-display text-2xl font-bold tracking-tight text-white">
                Installa su Android, iOS o PC
              </h3>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                aria-label="Chiudi finestra"
                className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {isIOS ? (
              <div className="mt-4 space-y-3 text-sm leading-relaxed text-slate-300">
                <p>Su iPhone o iPad con Safari:</p>
                <ol className="list-decimal space-y-2 pl-5">
                  <li>
                    Tocca il pulsante <strong className="text-white">Condividi</strong> nella barra di Safari.
                  </li>
                  <li>
                    Scorri e seleziona <strong className="text-white">Aggiungi alla schermata Home</strong>.
                  </li>
                </ol>
              </div>
            ) : (
              <div className="mt-4 space-y-3 text-sm leading-relaxed text-slate-300">
                <p>Puoi installare Allenamento Aerobico MASTER come app nativa offline:</p>
                <ul className="list-disc space-y-2 pl-5">
                  <li>
                    <strong className="text-white">Android (Chrome):</strong> Apri il menu (⋮) e tocca{' '}
                    <strong className="text-white">Installa app</strong> oppure{' '}
                    <strong className="text-white">Aggiungi a schermata Home</strong>.
                  </li>
                  <li>
                    <strong className="text-white">PC (Chrome / Edge):</strong> Clicca l&apos;icona di installazione nella barra degli indirizzi in alto a destra.
                  </li>
                </ul>
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="mt-6 w-full rounded-lg bg-slate-800 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-700 min-h-[44px]"
            >
              Ho capito
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed bottom-20 left-4 z-40 flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-950/90 px-3 py-2 text-xs font-medium text-amber-200 shadow-lg md:bottom-4">
      <WifiOff className="h-3.5 w-3.5 text-amber-400" />
      <span>Modalità Offline · Dati salvati in locale</span>
    </div>
  );
};
