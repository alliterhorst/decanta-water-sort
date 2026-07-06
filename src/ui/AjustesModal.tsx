/**
 * General "Settings" modal: Quality · Language · Skip victory screen · Danger zone.
 * Audio and Fullscreen are NOT here — they are rows in the main menu itself (Sound and Fullscreen
 * as rows). Opened from the "Settings" row of the menu.
 */
import { useState } from 'react';
import { loadPrefs, savePrefs, resetAllData } from '../game/settings';
import { useT, useLanguage } from '../i18n/context';
import { LANG_NAMES, LANG_FLAGS, type Lang } from '../i18n/types';
import { Toggle } from './AudioControls';

type PerfMode = 'auto' | 'low' | 'high';

const LANG_ORDER: Lang[] = ['pt-BR', 'en', 'es'];

interface Props {
  onClose: () => void;
  onPerfModeChange?: (mode: PerfMode) => void;
  /** Current state of "skip victory screen" and callback to keep the App in sync. */
  skipVictory?: boolean;
  onSkipVictoryChange?: (v: boolean) => void;
}

export function AjustesModal({ onClose, onPerfModeChange, skipVictory = false, onSkipVictoryChange }: Props) {
  const t = useT();
  const { lang, setLang } = useLanguage();
  const [prefs, setPrefs] = useState(() => loadPrefs());
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [resetting, setResetting] = useState(false);

  const update = (partial: Partial<typeof prefs>) => {
    const next = { ...prefs, ...partial };
    setPrefs(next);
    savePrefs(next);
    if (partial.perfMode !== undefined) onPerfModeChange?.(partial.perfMode as PerfMode);
  };

  const handleConfirmReset = () => {
    setResetting(true);
    void resetAllData();
  };

  const toggleSkipVictory = (v: boolean) => {
    savePrefs({ ...loadPrefs(), skipVictory: v });
    onSkipVictoryChange?.(v);
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={confirmingReset ? undefined : onClose}
    >
      <div
        className="max-h-[85dvh] w-full max-w-md overflow-y-auto overscroll-contain rounded-2xl bg-slate-900 px-5 pt-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {confirmingReset ? (
          // ── Confirmation (2nd step) — replaces the modal content instead of stacking another on top ──
          <>
            <div className="mb-5 flex items-center justify-between">
              <div className="text-base font-semibold text-slate-100">{t.ajustes.apagarConfirmTitle}</div>
            </div>
            <div className="rounded-xl bg-rose-500/10 px-4 py-3 text-sm text-rose-200 ring-1 ring-rose-400/30">
              {t.ajustes.apagarConfirmBody}
            </div>
            <div className="mt-4 flex flex-col gap-2">
              <button
                onClick={handleConfirmReset}
                disabled={resetting}
                className="w-full rounded-xl bg-rose-500 py-3 text-base font-semibold text-white transition active:scale-95 disabled:opacity-60"
              >
                {resetting ? t.ajustes.apagando : t.ajustes.simApagarTudo}
              </button>
              <button
                onClick={() => setConfirmingReset(false)}
                disabled={resetting}
                className="w-full rounded-xl bg-slate-800 py-3 text-base font-medium text-slate-300 transition active:scale-95 disabled:opacity-60"
              >
                {t.common.cancelar}
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Header */}
            <div className="mb-5 flex items-center justify-between">
              <div className="text-base font-semibold text-slate-100">{t.ajustes.title}</div>
              <button
                onClick={onClose}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition active:scale-90"
              >
                ✕
              </button>
            </div>

            {/* Graphics quality */}
            <div className="rounded-xl bg-slate-800 px-4 py-3">
              <div className="mb-2 text-sm font-medium text-slate-100">{t.ajustes.qualidade}</div>
              <div className="grid grid-cols-3 gap-2">
                {([['auto', t.ajustes.auto, t.ajustes.detecta], ['high', t.ajustes.alta, t.ajustes.maisDetalhes], ['low', t.ajustes.baixa, t.ajustes.maisFluido]] as [PerfMode, string, string][]).map(([id, label, desc]) => (
                  <button
                    key={id}
                    onClick={() => update({ perfMode: id })}
                    className={`flex flex-col items-center rounded-xl py-2.5 text-xs transition active:scale-95 ${
                      (prefs.perfMode ?? 'auto') === id
                        ? 'bg-teal-500/20 text-teal-300 ring-1 ring-teal-400/60'
                        : 'bg-slate-700/60 text-slate-400'
                    }`}
                  >
                    <span className="font-medium">{label}</span>
                    <span className="mt-0.5 text-[10px] opacity-70">{desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Language */}
            <div className="mt-3 rounded-xl bg-slate-800 px-4 py-3">
              <div className="mb-2 text-sm font-medium text-slate-100">{t.ajustes.idioma}</div>
              <div className="grid grid-cols-3 gap-2">
                {LANG_ORDER.map((code) => (
                  <button
                    key={code}
                    onClick={() => setLang(code)}
                    className={`flex flex-col items-center gap-0.5 rounded-xl py-2.5 text-xs transition active:scale-95 ${
                      lang === code
                        ? 'bg-teal-500/20 text-teal-300 ring-1 ring-teal-400/60'
                        : 'bg-slate-700/60 text-slate-400'
                    }`}
                  >
                    <span className="text-base leading-none">{LANG_FLAGS[code]}</span>
                    <span className="font-medium">{LANG_NAMES[code]}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Skip victory screen */}
            <div className="mt-3 flex items-center justify-between rounded-xl bg-slate-800 px-4 py-3">
              <div className="text-sm font-medium text-slate-100">{t.v2.pularTelaVitoria}</div>
              <Toggle value={skipVictory} onChange={toggleSkipVictory} />
            </div>

            {/* Danger zone */}
            <div className="mt-3 rounded-xl bg-slate-800 px-4 py-3">
              <div className="mb-2 text-sm font-medium text-slate-100">{t.ajustes.zonaDePerigo}</div>
              <button
                onClick={() => setConfirmingReset(true)}
                className="w-full rounded-xl bg-rose-500/10 py-2.5 text-sm font-medium text-rose-300 ring-1 ring-rose-400/30 transition active:scale-95"
              >
                {t.ajustes.apagarTodosOsDados}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
