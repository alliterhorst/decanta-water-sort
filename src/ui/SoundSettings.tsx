import { AudioControls } from './AudioControls';
import { useT } from '../i18n/context';

interface Props {
  onClose: () => void;
}

/**
 * Standalone Sound modal — used only by the classic UI (the 'classic' feature toggle). In the
 * newer UI, audio is unified inside the settings modal, so this modal is not mounted there.
 * All of the actual controls live in AudioControls (reused in both places).
 */
export function SoundSettings({ onClose }: Props) {
  const t = useT();
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="max-h-[85dvh] w-full max-w-md overflow-y-auto overscroll-contain rounded-2xl bg-slate-900 px-5 pt-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <div className="text-base font-semibold text-slate-100">{t.sound.title}</div>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition active:scale-90"
          >
            ✕
          </button>
        </div>
        <AudioControls />
      </div>
    </div>
  );
}
