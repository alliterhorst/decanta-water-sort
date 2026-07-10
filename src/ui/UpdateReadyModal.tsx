import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { useT } from '../i18n/context';

interface Props {
  /** 'available' — an update is downloaded and waiting; offers to install now or later.
   *  'whatsNew' — the update ALREADY applied itself in the background (the player never saw the
   *  'available' prompt, e.g. it became ready mid-game and they closed the app before returning
   *  to the menu) — purely informational, shown once, single acknowledge action. */
  variant: 'available' | 'whatsNew';
  /** Short sale-y "what changed" lines (from t.updateReady.notas), rendered as a list. */
  notes: string[];
  onClose: () => void;
  /** Only called for variant 'available'. */
  onInstallNow?: () => void;
}

/** One component, two framings, sharing the same "what changed" notes area (direction's spec,
 *  2026-07-10): showing the update as an accomplished fact ("instalação já feita") read wrong to
 *  players even though that's technically what happens under the hood (the new service worker is
 *  already downloaded/waiting) — reframed as an offer ("nova atualização disponível" / "instalar
 *  agora"). Same visual pattern as ModeSelector/WildTutorial. */
export function UpdateReadyModal({ variant, notes, onClose, onInstallNow }: Props) {
  const t = useT();
  const overlayRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    gsap.fromTo(overlayRef.current, { opacity: 0 }, { opacity: 1, duration: 0.2 });
    gsap.fromTo(panelRef.current, { scale: 0.94, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.22, ease: 'back.out(1.4)' });
  }, []);

  // Once closing, ignore further clicks: a fast double-tap on "Instalar agora" would otherwise
  // start two exit animations and fire the action twice (verified by integration test — the
  // second applyNow would trigger a second reload/skipWaiting on top of the first).
  const closingRef = useRef(false);
  const dismiss = (after: () => void) => {
    if (closingRef.current) return;
    closingRef.current = true;
    gsap.to(panelRef.current, { scale: 0.96, opacity: 0, duration: 0.18, ease: 'power2.in' });
    gsap.to(overlayRef.current, { opacity: 0, duration: 0.18, onComplete: after });
  };

  const isAvailable = variant === 'available';

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={(e) => { if (e.target === overlayRef.current) dismiss(onClose); }}
    >
      <div ref={panelRef} className="w-full max-w-sm px-4">
        <div className="max-h-[85dvh] overflow-y-auto overscroll-contain rounded-2xl bg-slate-900 p-5 shadow-2xl">
          <div className="mb-4">
            <div className="text-center text-2xl">{isAvailable ? '🆕' : '✨'}</div>
            <div className="mt-1 text-center text-lg font-bold text-slate-100">
              {isAvailable ? t.updateReady.tituloDisponivel : t.updateReady.tituloNovidades}
            </div>
            {notes.length > 0 && (
              <ul className="mt-3 flex flex-col gap-1.5">
                {notes.map((line) => (
                  <li key={line} className="text-sm leading-snug text-slate-300">{line}</li>
                ))}
              </ul>
            )}
          </div>

          {isAvailable ? (
            <div className="flex flex-col gap-2.5">
              <button
                onClick={() => dismiss(() => onInstallNow?.())}
                className="w-full rounded-xl bg-teal-500 py-2.5 text-sm font-semibold text-slate-950 transition active:scale-95"
              >
                {t.updateReady.instalarAgora}
              </button>
              <button
                onClick={() => dismiss(onClose)}
                className="w-full rounded-xl bg-slate-800 py-2.5 text-sm text-slate-400 transition active:scale-95"
              >
                {t.updateReady.depois}
              </button>
            </div>
          ) : (
            <button
              onClick={() => dismiss(onClose)}
              className="w-full rounded-xl bg-teal-500 py-2.5 text-sm font-semibold text-slate-950 transition active:scale-95"
            >
              {t.updateReady.ok}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
