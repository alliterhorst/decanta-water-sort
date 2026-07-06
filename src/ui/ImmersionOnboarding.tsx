import { useT } from '../i18n/context';
import { isFullscreenAvailable, toggleFullscreen } from '../lib/fullscreen';

interface Props {
  onClose: () => void;
}

/**
 * One-time immersion prompt, shown on the first "Play" on mobile when not installed.
 * - Android / where the Fullscreen API exists: invites the player into fullscreen (the click IS
 *   the user gesture the API requires). Dismissible.
 * - iPhone (no Fullscreen API): swaps the message for "Add to Home Screen" instead of leaving a
 *   dead control. Informational only.
 * The App decides WHETHER this appears (mobile && !standalone && not yet offered); this component
 * only renders the content. Always centered. The App sets the `fullscreenOnboarded` flag when it
 * mounts this, so dismissing it from outside won't make it reappear.
 */
export function ImmersionOnboarding({ onClose }: Props) {
  const t = useT();
  const canFullscreen = isFullscreenAvailable();

  const acceptFullscreen = () => {
    void toggleFullscreen(document.documentElement);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xs rounded-2xl bg-slate-900 px-6 py-6 text-center shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {canFullscreen ? (
          <>
            <div className="mb-2 text-lg font-bold text-slate-100">{t.v2.imersaoTitulo}</div>
            <div className="mb-5 text-sm text-slate-400">{t.v2.imersaoCorpo}</div>
            <div className="flex flex-col gap-2">
              <button
                onClick={acceptFullscreen}
                className="w-full rounded-xl bg-teal-400 py-3 text-base font-semibold text-slate-900 transition active:scale-95"
              >
                {t.v2.imersaoJogar}
              </button>
              <button
                onClick={onClose}
                className="w-full rounded-xl bg-slate-800 py-3 text-base font-medium text-slate-400 transition active:scale-95"
              >
                {t.v2.imersaoAgoraNao}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="mb-2 text-lg font-bold text-slate-100">{t.v2.imersaoIosTitulo}</div>
            <div className="mb-5 text-sm text-slate-400">{t.v2.imersaoIosCorpo}</div>
            <button
              onClick={onClose}
              className="w-full rounded-xl bg-teal-400 py-3 text-base font-semibold text-slate-900 transition active:scale-95"
            >
              {t.wildTutorial.entendi}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
