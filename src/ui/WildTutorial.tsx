import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { useT } from '../i18n/context';

interface WildTutorialProps {
  onDismiss: () => void;
}

/**
 * Wild-unit tutorial toast. Shown the first time the player encounters a wild
 * unit in play; explains the mechanic and dismisses itself automatically.
 */
export function WildTutorial({ onDismiss }: WildTutorialProps) {
  const t = useT();
  const cardRef = useRef<HTMLDivElement>(null);
  const dismissed = useRef(false);

  const dismiss = () => {
    if (dismissed.current) return;
    dismissed.current = true;
    const card = cardRef.current;
    if (!card) { onDismiss(); return; }
    gsap.to(card, {
      opacity: 0,
      y: 12,
      scale: 0.95,
      duration: 0.28,
      ease: 'power2.in',
      onComplete: onDismiss,
    });
  };

  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;

    // Entrance
    gsap.fromTo(
      card,
      { opacity: 0, y: -14, scale: 0.92 },
      { opacity: 1, y: 0, scale: 1, duration: 0.35, ease: 'back.out(1.5)' },
    );

    // Auto-dismiss after 5 seconds
    const timer = setTimeout(dismiss, 5000);
    return () => clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-[5.5rem] z-30 flex justify-center px-4"
      aria-live="polite"
    >
      <div
        ref={cardRef}
        className="pointer-events-auto w-full max-w-xs rounded-2xl bg-slate-800/96 px-5 py-4 shadow-2xl ring-1 ring-white/10 backdrop-blur"
        style={{ opacity: 0 }}
      >
        {/* Header */}
        <div className="mb-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-base font-bold"
              style={{ background: '#dfe7f520', color: '#dfe7f5' }}
            >
              ✦
            </span>
            <span className="text-sm font-bold text-slate-100">{t.wildTutorial.coringa}</span>
          </div>
          <button
            onClick={dismiss}
            className="rounded-lg px-2.5 py-1 text-xs font-semibold text-teal-400 transition hover:bg-teal-400/10 active:scale-95"
          >
            {t.wildTutorial.entendi}
          </button>
        </div>

        {/* Body */}
        <p className="text-xs leading-relaxed text-slate-400">
          {t.wildTutorial.intro}{' '}
          <span className="text-slate-300">{t.wildTutorial.podeReceber}</span> {t.wildTutorial.e}{' '}
          <span className="text-slate-300">{t.wildTutorial.qualquerCorPode}</span>
        </p>
      </div>
    </div>
  );
}
