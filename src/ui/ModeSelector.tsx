import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { MODES, type JourneyMode } from '../game/modes';
import { useT } from '../i18n/context';

interface Props {
  currentMode: JourneyMode;
  onSelect: (mode: JourneyMode) => void;
  onClose: () => void;
}

const MODE_ORDER: JourneyMode[] = ['zen', 'balanced', 'extreme'];

export function ModeSelector({ currentMode, onSelect, onClose }: Props) {
  const t = useT();
  const overlayRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    gsap.fromTo(overlayRef.current, { opacity: 0 }, { opacity: 1, duration: 0.2 });
    gsap.fromTo(panelRef.current, { scale: 0.94, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.22, ease: 'back.out(1.4)' });
  }, []);

  const handleSelect = (mode: JourneyMode) => {
    gsap.to(panelRef.current, { scale: 0.96, opacity: 0, duration: 0.18, ease: 'power2.in' });
    gsap.to(overlayRef.current, { opacity: 0, duration: 0.18, onComplete: () => onSelect(mode) });
  };

  // Centered: every modal, including on mobile, stays centered rather than as a bottom-sheet.
  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div ref={panelRef} className="w-full max-w-sm px-4">
        <div className="max-h-[85dvh] overflow-y-auto overscroll-contain rounded-2xl bg-slate-900 p-5 shadow-2xl">
          <div className="mb-4 text-center">
            <div className="text-xs font-medium uppercase tracking-widest text-slate-500">{t.modeSelector.jornada}</div>
            <div className="mt-1 text-lg font-bold text-slate-100">{t.modeSelector.escolhaOModo}</div>
          </div>

          <div className="flex flex-col gap-2.5">
            {MODE_ORDER.map((id) => {
              const m = MODES[id];
              const text = t.modes[id];
              const active = id === currentMode;
              return (
                <button
                  key={id}
                  onClick={() => handleSelect(id)}
                  className="flex items-start gap-3.5 rounded-xl px-4 py-3.5 text-left transition active:scale-[0.98] bg-slate-800/80 hover:bg-slate-800"
                  style={active ? {
                    background: `${m.accentColor}18`,
                    outline: `2px solid ${m.accentColor}`,
                    outlineOffset: '0px',
                  } : undefined}
                >
                  <span className="mt-0.5 text-2xl leading-none">{m.emoji}</span>
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-100">{text.name}</span>
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                        style={{ background: `${m.accentColor}25`, color: m.accentColor }}
                      >
                        {text.tagline}
                      </span>
                    </div>
                    <span className="text-xs text-slate-400">{text.description}</span>
                    {id === 'extreme' && (
                      <span className="mt-1 text-[10px] text-red-400">
                        {t.modeSelector.semDesfazerSemTuboDicas(MODES.extreme.maxHints)}
                      </span>
                    )}
                  </div>
                  {active && (
                    <span className="ml-auto mt-0.5 shrink-0 text-xs" style={{ color: m.accentColor }}>✓</span>
                  )}
                </button>
              );
            })}
          </div>

          <button
            onClick={onClose}
            className="mt-4 w-full rounded-xl bg-slate-800 py-2.5 text-sm text-slate-400 transition active:scale-95"
          >
            {t.common.cancelar}
          </button>
        </div>
      </div>
    </div>
  );
}
