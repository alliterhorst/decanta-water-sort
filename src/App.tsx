import { useCallback, useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { Scene } from './render/scene';
import { seedFromString } from './core/generator';
import { cloneState } from './core/engine';
import { solverClient } from './core/worker/client';
import { levelConfig, diffKey, starsFor } from './game/levels';
import { MODES, type JourneyMode } from './game/modes';
import { loadWallet, saveWallet, rewardFor, activeBg, activeTube, type Wallet, type BgTheme, type TubeStyle, type ShopItem } from './game/economy';
import { loadProgress, saveProgress, loadDaily, saveDaily, loadSession, saveSession, clearSession, loadPrefs, savePrefs, type DailyRecord, type GameSession } from './game/settings';
import { ShopModal } from './ui/ShopModal';
import { BossIntroScreen } from './ui/BossIntroScreen';
import { SoundSettings } from './ui/SoundSettings';
import { AjustesModal } from './ui/AjustesModal';
import { ModeSelector } from './ui/ModeSelector';
import { WildTutorial } from './ui/WildTutorial';
import { bossAfterPhase, BOSSES, type BossData } from './game/boss';
import { audio, tracksByMood, MUSIC_TRACKS, ONBOARDING_TRACK } from './audio/engine';
import type { MusicTrack } from './audio/engine';
import type { LevelConfig, GeneratedLevel } from './core/generator';
import { isFullscreenAvailable, isFullscreenActive, toggleFullscreen, isMobileDevice, isStandalone } from './lib/fullscreen';
import { ImmersionOnboarding } from './ui/ImmersionOnboarding';
import { useT } from './i18n/context';

type Screen = 'menu' | 'game';
type GameMode = 'journey' | 'daily';

/** Selects the BGM track based on phase and boss state.
 *  If prefs.musicTrack is set to a specific track ID, that always wins.
 *  If 'dynamic' (or unset), the track is chosen by difficulty. */
function selectTrackForPhase(
  phaseIndex: number,
  bossActive: boolean,
  musicTrackPref?: string,
): MusicTrack {
  if (bossActive) return 'boss';
  // Specific track forced by player preference (must exist in the manifest)
  if (musicTrackPref && musicTrackPref !== 'dynamic'
      && MUSIC_TRACKS.some(t => t.id === musicTrackPref)) {
    return musicTrackPref;
  }
  // Phase 1 (index 0) explicitly reuses the same welcome track as the main menu — it does not
  // depend on the order of the MUSIC_TRACKS array. The dynamic algorithm only kicks in from
  // phase 2 onward. (Daily always calls with phaseIndex 0, so it gets the same fixed track on
  // every attempt.)
  if (phaseIndex === 0) return ONBOARDING_TRACK;
  // Dynamic selection by difficulty: calm in low phases, upbeat+epic in high ones.
  // Rotates within the mood pool so the journey doesn't repeat a single track.
  // 'upbeat' alone has only 1 track (Retro/calm4): above phase 8, every phase would get stuck on
  // it forever (pool[i % 1] === pool[0] always), and no preference change could "unstick" it
  // because the problem was never the preference — it was the pool having size 1. We merge it
  // with 'epic' (4 dramatic tracks, already normalized — see MUSIC_GAINS in engine.ts), which
  // was previously only reachable by manually choosing it in the picker, to give real variety in
  // the hard phases.
  const pool = phaseIndex > 8 ? [...tracksByMood('upbeat'), ...tracksByMood('epic')] : tracksByMood('calm');
  if (pool.length === 0) return MUSIC_TRACKS[0]?.id ?? 'menu';
  return pool[phaseIndex % pool.length].id;
}

/** MENU screen track: respects the player's preference (a specific chosen track always wins).
 *  'dynamic'/no preference (the factory default) falls back to ONBOARDING_TRACK — the same
 *  welcome track used in the journey's first phase, not the reserved 'menu' track (bgm_menu.mp3):
 *  the menu screen has no "phase" to scale difficulty on, but it needs a sonic identity
 *  consistent with the rest of the onboarding. */
function selectMenuTrack(musicTrackPref?: string): MusicTrack {
  if (musicTrackPref && musicTrackPref !== 'dynamic'
      && MUSIC_TRACKS.some(t => t.id === musicTrackPref)) {
    return musicTrackPref;
  }
  return ONBOARDING_TRACK;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function App() {
  const t = useT();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<Scene | null>(null);
  const wonHandled = useRef(false);
  const savedLevelRef = useRef<GeneratedLevel | null>(null);
  const sessionMetaRef = useRef({ mode: 'journey' as GameMode, phase: 0, optimalMoves: 0, bossId: undefined as string | undefined, parentPhase: undefined as number | undefined, journeyMode: undefined as JourneyMode | undefined });
  const coinHudRef = useRef<HTMLButtonElement>(null);
  const bossPhaseRef = useRef(0);
  const currentBossRef = useRef<BossData | null>(null);
  const journeyModeRef = useRef<JourneyMode>('balanced');
  const skipVictoryRef = useRef(false);
  const savedSessionDataRef = useRef<GameSession | null>(null);

  // Persistence
  const [wallet, setWallet] = useState<Wallet>(() => loadWallet());
  const [journeyPhase, setJourneyPhase] = useState(() => loadProgress());
  const [dailyRecord, setDailyRecord] = useState<DailyRecord | null>(() => loadDaily());

  // Session state
  const [screen, setScreen] = useState<Screen>('menu');
  const [mode, setMode] = useState<GameMode>('journey');
  const [phase, setPhase] = useState(0);
  const [moves, setMoves] = useState(0);
  const [won, setWon] = useState(false);
  const [optimalMoves, setOptimalMoves] = useState(0);
  const [canUndo, setCanUndo] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [showShop, setShowShop] = useState(false);
  const [deadlocked, setDeadlocked] = useState(false);
  const [wonCoins, setWonCoins] = useState(0);
  const [showVictoryAnim, setShowVictoryAnim] = useState(false);
  const [pendingBoss, setPendingBoss] = useState<BossData | null>(null);
  const [bossActive, setBossActive] = useState(false);
  const [showSoundSettings, setShowSoundSettings] = useState(false);
  const [showAjustes, setShowAjustes] = useState(false);
  const [showModeSelector, setShowModeSelector] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [skipVictory, setSkipVictory] = useState(false);
  const [journeyMode, setJourneyMode] = useState<JourneyMode>('balanced');
  const [hasSavedSession, setHasSavedSession] = useState(false);
  const [toast, setToast] = useState<{ msg: string; id: number } | null>(null);
  // Visual pulse triggered by the Hint button when there are no moves (points to the way out).
  // May light up more than one button at once (e.g. Restart + Undo).
  const [hintNudge, setHintNudge] = useState<Array<'tube' | 'undo' | 'restart'>>([]);
  // Hint is computing in the worker — disable the button so requests don't stack up
  const [hintPending, setHintPending] = useState(false);
  const [showWildTutorial, setShowWildTutorial] = useState(false);
  // power-up limits from scene (-1 = unlimited)
  const [undosLeft, setUndosLeft] = useState(-1);
  const [hintsLeft, setHintsLeft] = useState(-1);
  const [tubesLeft, setTubesLeft] = useState(-1);
  // Fullscreen — unavailable on iOS Safari (the API only exists there for <video>); the button
  // hides itself.
  const [fsAvailable] = useState(isFullscreenAvailable);
  const [fsActive, setFsActive] = useState(isFullscreenActive);

  const [showImmersion, setShowImmersion] = useState(false); // fullscreen offer on the first Play
  const afterImmersionRef = useRef<null | (() => void)>(null);

  const closeImmersion = () => {
    setShowImmersion(false);
    const cb = afterImmersionRef.current;
    afterImmersionRef.current = null;
    cb?.();
  };

  /** mobile + not installed + not yet offered → schedules the immersion offer and marks it as
   *  offered RIGHT AWAY (dismissing it externally won't make it reappear). Returns true if it
   *  will show. */
  const maybeOfferImmersion = (after: () => void): boolean => {
    if (!isMobileDevice() || isStandalone() || loadPrefs().fullscreenOnboarded) {
      return false;
    }
    savePrefs({ ...loadPrefs(), fullscreenOnboarded: true });
    afterImmersionRef.current = after;
    setShowImmersion(true);
    return true;
  };

  // keep refs in sync
  useEffect(() => { skipVictoryRef.current = skipVictory; }, [skipVictory]);
  useEffect(() => { journeyModeRef.current = journeyMode; }, [journeyMode]);

  // State comes from the EVENT, never from the click — ESC / Android Back exit "externally".
  useEffect(() => {
    if (!fsAvailable) return;
    const onChange = () => setFsActive(isFullscreenActive());
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, [fsAvailable]);

  // "No moves" toast when stuck (auto-dismisses after 3s)
  useEffect(() => {
    if (!deadlocked || won) { setToast(null); return; }
    setToast({ msg: t.hud.semMovimentosDisponiveis, id: Date.now() });
  }, [deadlocked, won, t]);

  // Auto-dismiss any toast (a new id restarts the timer)
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  // The pulse on the button(s) suggested by the Hint lasts ~2.5s
  useEffect(() => {
    if (hintNudge.length === 0) return;
    const t = setTimeout(() => setHintNudge([]), 2500);
    return () => clearTimeout(t);
  }, [hintNudge]);

  // Only show the "computing" indicator if the hint takes longer than ~150ms (no flicker in the
  // common case)
  const [hintSlow, setHintSlow] = useState(false);
  useEffect(() => {
    if (!hintPending) { setHintSlow(false); return; }
    const t = setTimeout(() => setHintSlow(true), 150);
    return () => clearTimeout(t);
  }, [hintPending]);

  // Init the Pixi scene (once)
  useEffect(() => {
    const canvas = canvasRef.current!;
    const scene = new Scene();
    let destroyed = false;
    const onResize = () => scene.relayout();
    const onVisibility = () => { if (document.hidden) scene.pause(); else scene.resume(); };

    const prefs0 = loadPrefs();
    scene.init(canvas, prefs0.perfMode ?? 'auto').then(() => {
      if (destroyed) { scene.app.destroy(false, { children: true }); return; }

      scene.onChange = (info) => {
        setMoves(info.moves);
        setWon(info.won);
        setCanUndo(info.canUndo);
        setDeadlocked(info.deadlocked);
        setUndosLeft(info.undosLeft);
        setHintsLeft(info.hintsLeft);
        setTubesLeft(info.tubesLeft);
        if (!info.won) {
          const meta = sessionMetaRef.current;
          const initState = savedLevelRef.current?.state;
          if (initState) {
            saveSession({
              mode: meta.mode, phase: meta.phase, optimalMoves: meta.optimalMoves,
              moves: info.moves,
              state: cloneState(scene.state),
              history: scene.currentHistory,
              initialState: initState,
              bossId: meta.bossId,
              parentPhase: meta.parentPhase,
              journeyMode: meta.mode === 'journey' && meta.phase !== -1 ? journeyModeRef.current : undefined,
            });
          }
        }
      };

      // Audio wiring
      scene.onPour = (dur) => { void audio.playPour(dur); };
      scene.onFlood = () => { void audio.playFlood(); };
      scene.onTubeComplete = (_tubeIdx, _color) => { void audio.playCapPop(); };

      // Wild tutorial: fires only once per app lifetime
      scene.onFirstWild = () => {
        const p = loadPrefs();
        if (!p.wildTutorialShown) {
          setShowWildTutorial(true);
        }
      };

      // Apply saved audio + UX prefs
      const prefs = loadPrefs();
      audio.musicOn = prefs.music;
      audio.sfxOn = prefs.sfx;
      if (prefs.sfxStyle) audio.sfxStyle = prefs.sfxStyle as typeof audio.sfxStyle;
      if (prefs.skipVictory) {
        setSkipVictory(true);
        skipVictoryRef.current = true;
      }
      if (prefs.journeyMode) {
        const jm = prefs.journeyMode as JourneyMode;
        setJourneyMode(jm);
        journeyModeRef.current = jm;
      }

      // Unlock audio on first user gesture
      const unlockAudio = () => { void audio.unlock(); };
      document.addEventListener('click', unlockAudio, { once: true });
      document.addEventListener('touchstart', unlockAudio, { once: true });

      sceneRef.current = scene;
      (window as unknown as { __scene: Scene }).__scene = scene;
      (window as unknown as { __audio: typeof audio }).__audio = audio; // debug/QA
      window.addEventListener('resize', onResize);
      document.addEventListener('visibilitychange', onVisibility);

      // Apply saved theme
      const w = loadWallet();
      const bg = activeBg(w);
      const tube = activeTube(w);
      scene.setTheme(bg.deep, tube.rim);

      // Check for in-progress session — show "Continuar" button, don't auto-navigate.
      // Boss sessions (phase === -1) now carry bossId + parentPhase so they can be
      // restored properly; a boss session missing bossId is stale/corrupt data and
      // is discarded instead of resumed into a broken state.
      const session = loadSession();
      if (session && session.phase === -1 && !session.bossId) {
        clearSession();
      } else if (session) {
        savedSessionDataRef.current = session;
        setHasSavedSession(true);
      }
      void audio.startMusic(selectMenuTrack(loadPrefs().musicTrack));
    });

    return () => {
      destroyed = true;
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
      if (sceneRef.current) {
        sceneRef.current.app.destroy(false, { children: true });
        sceneRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    sessionMetaRef.current = {
      mode, phase, optimalMoves,
      bossId: phase === -1 ? currentBossRef.current?.id : undefined,
      parentPhase: phase === -1 ? bossPhaseRef.current : undefined,
      journeyMode: mode === 'journey' && phase !== -1 ? journeyModeRef.current : undefined,
    };
  }, [mode, phase, optimalMoves]);

  const loadJourneyPhase = useCallback((phaseIndex: number, jMode?: JourneyMode) => {
    const s = sceneRef.current;
    if (!s) return;
    const resolvedMode = jMode ?? journeyModeRef.current;
    setGenerating(true);
    setWon(false);
    setCanUndo(false);
    setDeadlocked(false);
    setWonCoins(0);
    setUndosLeft(-1);
    setHintsLeft(-1);
    setTubesLeft(-1);
    wonHandled.current = false;
    const cfg = levelConfig(phaseIndex, resolvedMode);
    solverClient.generateLevel(cfg).then((lvl) => {
      savedLevelRef.current = lvl;
      s.moves = 0;
      setMoves(0);
      setPhase(phaseIndex);
      setOptimalMoves(lvl.optimalMoves);
      sessionMetaRef.current = { mode: 'journey', phase: phaseIndex, optimalMoves: lvl.optimalMoves, bossId: undefined, parentPhase: undefined, journeyMode: resolvedMode };
      s.setLevel(lvl.state, lvl.optimalMoves);
      const mCfg = MODES[resolvedMode];
      s.setPowerUpLimits(mCfg.maxUndos, mCfg.maxHints, mCfg.maxExtraTubes);
      setUndosLeft(mCfg.maxUndos);
      setHintsLeft(mCfg.maxHints);
      setTubesLeft(mCfg.maxExtraTubes);
      setGenerating(false);
      setTransitioning(false);
    });
  }, []);

  const loadDailyChallenge = useCallback(() => {
    const s = sceneRef.current;
    if (!s) return;
    setGenerating(true);
    setWon(false);
    setCanUndo(false);
    setDeadlocked(false);
    setWonCoins(0);
    setUndosLeft(-1);
    setHintsLeft(-1);
    setTubesLeft(-1);
    wonHandled.current = false;
    const seed = seedFromString('decanta-daily-' + todayStr());
    const cfg: LevelConfig = { colors: 7, capacity: 5, emptyTubes: 2, lockedTubes: 1, lockMoves: 4 };
    solverClient.generateLevel(cfg, 200, seed).then((lvl) => {
      savedLevelRef.current = lvl;
      s.moves = 0;
      setMoves(0);
      setPhase(0);
      setOptimalMoves(lvl.optimalMoves);
      sessionMetaRef.current = { mode: 'daily', phase: 0, optimalMoves: lvl.optimalMoves, bossId: undefined, parentPhase: undefined, journeyMode: undefined };
      s.setLevel(lvl.state, lvl.optimalMoves);
      // Daily always has unlimited help — without this, the Daily Challenge would inherit the
      // limits (e.g. Extreme = 0 undos / 3 hints / 0 tubes) left over from the last Journey
      // session, since setLevel() doesn't reset maxUndos/maxHints/maxExtraTubes, only the usage
      // counters.
      s.setPowerUpLimits(-1, -1, -1);
      setUndosLeft(-1);
      setHintsLeft(-1);
      setTubesLeft(-1);
      setGenerating(false);
    });
  }, []);

  // Victory: reward + save progress + check for boss
  useEffect(() => {
    if (!won || wonHandled.current) return;
    wonHandled.current = true;
    clearSession();
    setHasSavedSession(false);
    savedSessionDataRef.current = null;

    // ── Boss victory ──────────────────────────────────────────────────────
    if (bossActive && currentBossRef.current) {
      const boss = currentBossRef.current;
      currentBossRef.current = null;
      setBossActive(false);
      sceneRef.current?.disableBossMode();
      const reward = boss.reward;
      const newWallet = { ...wallet, coins: wallet.coins + reward };
      saveWallet(newWallet);
      setWallet(newWallet);
      setWonCoins(reward);
      if (reward > 0) setShowVictoryAnim(true);
      const bg = activeBg(newWallet);
      const tube = activeTube(newWallet);
      sceneRef.current?.setTheme(bg.deep, tube.rim);
      void audio.startMusic(selectTrackForPhase(bossPhaseRef.current + 1, false, loadPrefs().musicTrack));
      void audio.playVictory();
      return;
    }

    // ── Normal phase victory ──────────────────────────────────────────────
    const stars = starsFor(moves, optimalMoves);
    const helps = sceneRef.current?.helps ?? 0;
    const reward = rewardFor({ mode, stars, helps });

    if (mode === 'journey') {
      const next = phase + 1;
      if (next > journeyPhase) {
        setJourneyPhase(next);
        saveProgress(next);
      }

      const boss = bossAfterPhase(phase);
      if (boss) {
        bossPhaseRef.current = phase;
        if (reward > 0) {
          const newWallet = { ...wallet, coins: wallet.coins + reward };
          saveWallet(newWallet);
          setWallet(newWallet);
        }
        setPendingBoss(boss);
        return;
      }
    }

    // No boss — normal victory
    const newWallet = { ...wallet, coins: wallet.coins + reward };
    saveWallet(newWallet);
    setWallet(newWallet);
    setWonCoins(reward);
    if (reward > 0) setShowVictoryAnim(true);

    if (mode === 'daily') {
      const rec: DailyRecord = { date: todayStr(), stars, moves };
      saveDaily(rec);
      setDailyRecord(rec);
    }

    void audio.playVictory();

    // Auto-advance to the next phase if skipVictory is active (normal journey only)
    if (skipVictoryRef.current && mode === 'journey') {
      const targetPhase = phase + 1;
      setTimeout(() => {
        setTransitioning(true);
        setTimeout(() => {
          void audio.startMusic(selectTrackForPhase(targetPhase, false, loadPrefs().musicTrack));
          loadJourneyPhase(targetPhase);
        }, 320);
      }, 700);
    }
  }, [won]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleBossFight = useCallback((boss: BossData) => {
    const s = sceneRef.current;
    if (!s) return;
    currentBossRef.current = boss;
    setPendingBoss(null);
    setBossActive(true);
    void audio.playBossIntro();
    s.setTheme(boss.themeDeep, boss.rimColor);
    void audio.startMusic('boss');
    setGenerating(true);
    setWon(false);
    setCanUndo(false);
    setDeadlocked(false);
    setWonCoins(0);
    wonHandled.current = false;
    solverClient.generateLevel(boss.levelConfig).then((lvl) => {
      savedLevelRef.current = lvl;
      s.moves = 0;
      setMoves(0);
      setPhase(-1);
      setOptimalMoves(lvl.optimalMoves);
      sessionMetaRef.current = {
        mode: 'journey', phase: -1, optimalMoves: lvl.optimalMoves,
        bossId: boss.id, parentPhase: bossPhaseRef.current, journeyMode: undefined,
      };
      s.setLevel(lvl.state, lvl.optimalMoves);
      const bossCfg = MODES.balanced;
      s.setPowerUpLimits(bossCfg.maxUndos, bossCfg.maxHints, bossCfg.maxExtraTubes);
      s.enableBossMode(boss.floodInterval, boss.floodCount);
      setGenerating(false);
    });
  }, []);

  const startJourney = () => {
    // Mobile, first time: offer fullscreen before opening the mode selector.
    if (maybeOfferImmersion(() => setShowModeSelector(true))) return;
    setShowModeSelector(true);
  };

  const startJourneyWithMode = (jMode: JourneyMode) => {
    setShowModeSelector(false);
    setJourneyMode(jMode);
    journeyModeRef.current = jMode;
    savePrefs({ ...loadPrefs(), journeyMode: jMode });
    setMode('journey');
    setScreen('game');
    void audio.startMusic(selectTrackForPhase(journeyPhase, false, loadPrefs().musicTrack));
    loadJourneyPhase(journeyPhase, jMode);
  };

  const continueSession = () => {
    // Prefer the FRESH localStorage: if the player left to the menu with a pour still animating,
    // onChange saved the session after the snapshot kept in the ref — the ref would be one move
    // behind.
    const session = loadSession() ?? savedSessionDataRef.current;
    const s = sceneRef.current;
    if (!session || !s) return;
    setMode(session.mode as GameMode);
    setPhase(session.phase);
    setOptimalMoves(session.optimalMoves);
    setMoves(session.moves);
    setScreen('game');
    savedLevelRef.current = { state: session.initialState, optimalMoves: session.optimalMoves };

    const boss = session.phase === -1 && session.bossId
      ? BOSSES.find(b => b.id === session.bossId)
      : undefined;

    if (boss) {
      // Restore boss fight: theme, flood mode, and the parent phase for bossPhaseRef.
      currentBossRef.current = boss;
      bossPhaseRef.current = session.parentPhase ?? 0;
      setBossActive(true);
      s.setTheme(boss.themeDeep, boss.rimColor);
      const bossCfg = MODES.balanced;
      s.setPowerUpLimits(bossCfg.maxUndos, bossCfg.maxHints, bossCfg.maxExtraTubes);
      s.enableBossMode(boss.floodInterval, boss.floodCount);
      void audio.startMusic('boss');
    } else if (session.mode === 'daily') {
      // Daily always has unlimited help — doesn't use MODES[...] (which currently coincides with
      // unlimited via 'balanced', but shouldn't rely on that).
      s.setPowerUpLimits(-1, -1, -1);
      void audio.startMusic(selectTrackForPhase(session.phase, false, loadPrefs().musicTrack));
    } else {
      // Restore the mode (Zen/Balanced/Extreme) from the SAVED session — it may diverge from the
      // current global journeyMode if the player switched modes before resuming an old session.
      // Sessions saved before this field existed fall back to 'balanced'.
      const resolvedMode = (session.journeyMode as JourneyMode) ?? 'balanced';
      journeyModeRef.current = resolvedMode;
      setJourneyMode(resolvedMode);
      const mCfg = MODES[resolvedMode];
      s.setPowerUpLimits(mCfg.maxUndos, mCfg.maxHints, mCfg.maxExtraTubes);
      void audio.startMusic(selectTrackForPhase(session.phase, false, loadPrefs().musicTrack));
    }

    setTimeout(() => {
      s.restoreSession(session.state, session.moves, session.optimalMoves, session.history);
    }, 32);
  };

  const startDaily = () => {
    setMode('daily');
    setScreen('game');
    void audio.startMusic(selectTrackForPhase(0, false, loadPrefs().musicTrack));
    loadDailyChallenge();
  };

  const restart = () => {
    const s = sceneRef.current;
    const saved = savedLevelRef.current;
    if (!s || !saved) return;
    setWon(false);
    setCanUndo(false);
    setDeadlocked(false);
    setWonCoins(0);
    wonHandled.current = false;
    s.moves = 0;
    setMoves(0);
    if (bossActive && currentBossRef.current) {
      s.setLevel(saved.state, saved.optimalMoves);
      const bossCfg = MODES.balanced;
      s.setPowerUpLimits(bossCfg.maxUndos, bossCfg.maxHints, bossCfg.maxExtraTubes);
      s.enableBossMode(currentBossRef.current.floodInterval, currentBossRef.current.floodCount);
    } else if (mode === 'daily') {
      // Daily is always unlimited — doesn't use journeyModeRef (which could be 'extreme' from a
      // previous Journey session and would wrongly restrict Daily on restart).
      s.setLevel(saved.state, saved.optimalMoves);
      s.setPowerUpLimits(-1, -1, -1);
    } else {
      s.setLevel(saved.state, saved.optimalMoves);
      const mCfg = MODES[journeyModeRef.current];
      s.setPowerUpLimits(mCfg.maxUndos, mCfg.maxHints, mCfg.maxExtraTubes);
    }
  };

  const nextPhase = () => {
    clearSession();
    setHasSavedSession(false);
    savedSessionDataRef.current = null;
    setBossActive(false);
    sceneRef.current?.disableBossMode();
    currentBossRef.current = null;
    const targetPhase = phase === -1 ? bossPhaseRef.current + 1 : phase + 1;
    setTransitioning(true);
    setTimeout(() => {
      void audio.startMusic(selectTrackForPhase(targetPhase, false, loadPrefs().musicTrack));
      loadJourneyPhase(targetPhase);
    }, 320);
  };

  const skipPhase = () => {
    // Gives up on the current phase/boss and advances to the next one (no reward)
    clearSession();
    setHasSavedSession(false);
    savedSessionDataRef.current = null;
    const wasBoss = bossActive || phase === -1;
    setBossActive(false);
    sceneRef.current?.disableBossMode();
    currentBossRef.current = null;
    if (wasBoss) {
      // Skip boss: restore the theme and go to the phase after the boss
      const w = loadWallet();
      sceneRef.current?.setTheme(activeBg(w).deep, activeTube(w).rim);
    }
    const targetPhase = phase === -1 ? bossPhaseRef.current + 1 : phase + 1;
    setTransitioning(true);
    setTimeout(() => {
      void audio.startMusic(selectTrackForPhase(targetPhase, false, loadPrefs().musicTrack));
      loadJourneyPhase(targetPhase);
    }, 320);
  };

  const goMenu = () => {
    // Only clear the saved session when the phase has already been won or there's no progress
    // to preserve. A normal exit (the '←' button) mid-phase should keep the session so the
    // 'Continue' card shows up on the menu.
    if (won || moves === 0) {
      clearSession();
      setHasSavedSession(false);
      savedSessionDataRef.current = null;
    } else {
      // Session in progress: reload from localStorage (written on every move by onChange) so the
      // 'Continue' card appears immediately on this visit to the menu — previously this state was
      // only read at boot, requiring an F5 for the card to appear.
      const session = loadSession();
      if (session && !(session.phase === -1 && !session.bossId)) {
        savedSessionDataRef.current = session;
        setHasSavedSession(true);
      }
    }
    setBossActive(false);
    sceneRef.current?.disableBossMode();
    currentBossRef.current = null;
    setPendingBoss(null);
    setScreen('menu');
    setTransitioning(false);
    setDeadlocked(false);
    void audio.startMusic(selectMenuTrack(loadPrefs().musicTrack));
    if (phase === -1) {
      const w = loadWallet();
      const bg = activeBg(w);
      const tube = activeTube(w);
      sceneRef.current?.setTheme(bg.deep, tube.rim);
    }
  };

  const handleUndo = () => sceneRef.current?.undo();

  /** Hint: when there are no moves, points to the way out instead of searching for a play. */
  const handleHint = () => {
    if (deadlocked && !won) {
      if (tubesLeft !== 0) {
        setHintNudge(['tube']);
        setToast({ msg: t.hud.semMovimentosAdicioneTubo, id: Date.now() });
      } else {
        // No more tubes available: Restart always pulses (never runs out); Undo only pulses if
        // it's actually usable, otherwise the pulse would be confusing.
        const undoUsable = canUndo && undosLeft !== 0;
        setHintNudge(undoUsable ? ['restart', 'undo'] : ['restart']);
        setToast({
          msg: undoUsable ? t.hud.semMovimentosReinicieOuDesfaca : t.hud.semMovimentosReinicieAFase,
          id: Date.now(),
        });
      }
      return;
    }
    if (hintPending) return; // a request is already in flight — don't stack
    setHintPending(true);
    sceneRef.current?.showHint().finally(() => setHintPending(false));
  };

  const handleAddTube = () => sceneRef.current?.addEmptyTube();

  const handleBuyOrEquip = (item: ShopItem) => {
    let w = { ...wallet };
    if (item.price > 0 && !w.owned.includes(item.id)) {
      if (w.coins < item.price) return;
      w = { ...w, coins: w.coins - item.price, owned: [...w.owned, item.id] };
    }
    if (item.kind === 'bg') w = { ...w, bg: item.id };
    else w = { ...w, tube: item.id };
    saveWallet(w);
    setWallet(w);
    if (!bossActive) {
      const bg = activeBg(w);
      const tube = activeTube(w);
      sceneRef.current?.setTheme(bg.deep, tube.rim);
    }
  };

  const handlePreview = (item: ShopItem) => {
    if (bossActive) return;
    const bg = item.kind === 'bg' ? (item as BgTheme) : activeBg(wallet);
    const tube = item.kind === 'tube' ? (item as TubeStyle) : activeTube(wallet);
    sceneRef.current?.setTheme(bg.deep, tube.rim);
  };

  const handleShopClose = () => {
    if (!bossActive) {
      const bg = activeBg(wallet);
      const tube = activeTube(wallet);
      sceneRef.current?.setTheme(bg.deep, tube.rim);
    }
    setShowShop(false);
  };

  const isBoss = phase === -1;
  const today = todayStr();
  const playedToday = dailyRecord?.date === today;
  const bossText = (b: BossData) => t.boss[b.id as keyof typeof t.boss];
  const label = isBoss
    ? (currentBossRef.current ? bossText(currentBossRef.current).title : t.hud.chefao)
    : mode === 'daily' ? t.hud.diario : t.levels[diffKey(phase)];
  const stars = won ? starsFor(moves, optimalMoves) : null;

  // Power-up button labels: show remaining count when limited
  const undoLabel = t.hud.voltar(undosLeft);
  const hintLabel = hintSlow ? t.hud.dicaCalculando : t.hud.dica(hintsLeft);
  const tubeLabel = t.hud.maisTubo(tubesLeft);

  const showVictoryModal = won && !generating && screen === 'game' && !pendingBoss
    && !(skipVictory && mode === 'journey' && !isBoss);

  // Total-block modal (no moves + no options)
  const trulyStuck = deadlocked && !canUndo && tubesLeft === 0 && !won;

  return (
    <>
      {/* Canvas always mounted — Pixi lives here */}
      <canvas
        id="game-canvas"
        ref={canvasRef}
        className={screen === 'menu' ? 'pointer-events-none opacity-0' : ''}
      />

      {/* ── PHASE TRANSITION FADE ────────────────────────────────── */}
      <div
        className="pointer-events-none fixed inset-0 z-40 bg-black transition-opacity duration-300"
        style={{ opacity: transitioning ? 1 : 0 }}
      />

      {/* ── MENU ─────────────────────────────────────────────────────── */}
      {screen === 'menu' && (
        <div className="fixed inset-0 z-10 overflow-y-auto bg-[#0b1322]">
          {/* Status strip: just the coin pill (with +), top-right corner.
              Settings/Sound/Fullscreen are now menu ROWS (below Daily). */}
          <div
            className="fixed right-3 z-20 flex items-center gap-2"
            style={{ top: 'max(0.75rem, env(safe-area-inset-top))' }}
          >
            <CoinPill coins={wallet.coins} onClick={() => setShowShop(true)} />
          </div>

          <div className="flex min-h-full flex-col items-center px-4 py-8">
            <div className="flex-1" />
            <div className="mb-10 text-center">
              <div className="text-5xl font-bold uppercase tracking-[0.18em] text-slate-100">{t.menu.appTitle}</div>
              <div className="mt-1 text-xs font-medium uppercase tracking-widest text-slate-500">{t.menu.appSubtitle}</div>
            </div>

            <div className="flex w-full max-w-xs flex-col gap-3">
              {hasSavedSession && savedSessionDataRef.current ? (
                <>
                  {/* PRIMARY: Continue (saved session) — full teal, larger */}
                  <button
                    onClick={continueSession}
                    className="flex flex-col items-start rounded-2xl bg-teal-400 px-5 py-5 text-left shadow-lg transition active:scale-95"
                  >
                    <span className="text-lg font-bold text-slate-900">▶ {t.menu.continuar}</span>
                    <span className="mt-0.5 text-sm font-medium text-slate-900/70">
                      {savedSessionDataRef.current.mode === 'daily' ? t.menu.diario :
                        savedSessionDataRef.current.phase === -1 ? t.menu.batalhaDeChefao :
                        `${t.menu.fase(savedSessionDataRef.current.phase + 1)} · ${t.common.jogadas(savedSessionDataRef.current.moves)}`}
                    </span>
                  </button>
                  {/* SECONDARY: Journey */}
                  <button
                    onClick={startJourney}
                    className="flex items-center justify-between rounded-2xl bg-slate-800/80 px-5 py-3.5 text-left shadow-lg transition active:scale-95"
                  >
                    <span className="text-base font-semibold text-slate-100">{t.menu.jornada}</span>
                    <span className="rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: `${MODES[journeyMode].accentColor}25`, color: MODES[journeyMode].accentColor }}>
                      {MODES[journeyMode].emoji} {t.modes[journeyMode].name}
                    </span>
                  </button>
                </>
              ) : (
                /* PRIMARY: Play/Journey (no session) */
                <button
                  onClick={startJourney}
                  className="flex flex-col items-start rounded-2xl bg-teal-400 px-5 py-5 text-left shadow-lg transition active:scale-95"
                >
                  <div className="flex w-full items-center justify-between">
                    <span className="text-lg font-bold text-slate-900">{t.v2.jogar}</span>
                    <span className="rounded-full bg-slate-900/15 px-2 py-0.5 text-[10px] font-medium text-slate-900">
                      {MODES[journeyMode].emoji} {t.modes[journeyMode].name}
                    </span>
                  </div>
                  <span className="mt-0.5 text-sm font-medium text-slate-900/70">{t.menu.fase(journeyPhase + 1)} · {t.levels[diffKey(journeyPhase)]}</span>
                </button>
              )}

              {/* Smaller SECONDARY: Daily */}
              <button
                onClick={startDaily}
                className="flex items-center justify-between rounded-2xl bg-slate-800/80 px-5 py-3.5 text-left shadow-lg transition active:scale-95"
              >
                <span className="text-base font-semibold text-slate-100">{t.menu.diario}</span>
                {playedToday ? (
                  <div className="flex items-center gap-0.5 text-sm">
                    {[1, 2, 3].map((s) => (
                      <span key={s} className={s <= (dailyRecord?.stars ?? 0) ? 'text-amber-400' : 'text-slate-600'}>★</span>
                    ))}
                  </div>
                ) : (
                  <span className="text-xs text-slate-400">{t.menu.novoDesafioDisponivel}</span>
                )}
              </button>

              {/* ── Config on the home screen itself: Fullscreen · Sound · Settings ── */}
              {/* Fullscreen — right below Daily. Tap → fullscreen; the row becomes "Exit
                  fullscreen" (via fsActive). Gate ONLY on `fsAvailable` (the API exists): do NOT
                  check isStandalone here, otherwise the row disappears when entering fullscreen —
                  `display-mode: fullscreen` makes isStandalone() return true and the player has no
                  way back. iOS (no API) is already excluded via fsAvailable=false. */}
              {fsAvailable && (
                <MenuRow
                  label={fsActive ? t.common.sairDaTelaCheia : t.common.telaCheia}
                  onClick={() => void toggleFullscreen(document.documentElement)}
                  icon={fsActive ? (
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 9V5a1 1 0 00-1-1H4m0 12v4a1 1 0 001 1h4m6 0h4a1 1 0 001-1v-4m0-6V5a1 1 0 00-1-1h-4" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V5a1 1 0 011-1h3m8 0h3a1 1 0 011 1v3m0 8v3a1 1 0 01-1 1h-3M8 20H5a1 1 0 01-1-1v-3" />
                  )}
                  accent
                />
              )}

              <MenuRow
                label={t.sound.title}
                onClick={() => setShowSoundSettings(true)}
                icon={<path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />}
              />

              <MenuRow
                label={t.ajustes.title}
                onClick={() => setShowAjustes(true)}
                icon={<><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></>}
              />
            </div>

            <div className="flex-1" />
          </div>
        </div>
      )}

      {/* ── HUD (in-game only) ───────────────────────────────────────── */}
      {screen === 'game' && (
        <>
          <div id="hud-top" className="pointer-events-none fixed inset-x-0 top-0 z-10 grid grid-cols-3 items-start px-4 pt-[env(safe-area-inset-top)]">
            {/* Left — Menu button (goes straight to the home screen) + passive phase/difficulty */}
            <div className="mt-3 flex items-center gap-2">
              <MenuButton label={t.common.menu} onClick={goMenu} />
              <div className="rounded-lg bg-slate-900/55 px-2.5 py-1 backdrop-blur">
                <div className="text-sm font-semibold leading-tight text-slate-100">
                  {isBoss ? (currentBossRef.current ? bossText(currentBossRef.current).name : t.hud.chefao) : mode === 'daily' ? t.hud.diario : t.hud.fase(phase + 1)}
                </div>
                {mode !== 'daily' && (
                  <div className={`text-[11px] leading-tight ${isBoss ? 'text-red-300' : 'text-slate-400'}`}>{label}</div>
                )}
              </div>
            </div>

            {/* Center — coin pill with "+" (obvious shop) */}
            <div className="mt-3 flex justify-center">
              <CoinPill coins={wallet.coins} onClick={() => setShowShop(true)} innerRef={coinHudRef} />
            </div>

            {/* Right — moves; optimal hidden in Zen; boss tag */}
            <div className="mt-3 flex flex-col items-end gap-1">
              <div className="rounded-xl bg-slate-900/75 px-3 py-1.5 text-sm font-medium text-slate-100 backdrop-blur">
                {t.common.jogadas(moves)}
              </div>
              {optimalMoves > 0 && !isBoss && !(mode === 'journey' && journeyMode === 'zen') && (
                <div className="rounded-lg bg-slate-900/55 px-2.5 py-0.5 text-xs text-slate-400 backdrop-blur">
                  {t.hud.otimo(optimalMoves)}
                </div>
              )}
              {isBoss && bossActive && (
                <div className="rounded-lg bg-red-900/70 px-2.5 py-0.5 text-xs text-red-300 backdrop-blur">
                  {t.hud.chefaoTag}
                </div>
              )}
            </div>
          </div>

          {/* "No moves" toast */}
          <div
            className={`pointer-events-none fixed bottom-[5.5rem] left-1/2 z-20 -translate-x-1/2 rounded-xl bg-slate-800/95 px-4 py-2 text-xs font-medium text-amber-300 shadow-lg backdrop-blur transition-all duration-300 ${
              toast ? 'opacity-100' : 'opacity-0'
            }`}
          >
            {toast?.msg ?? t.hud.semMovimentosDisponiveis}
          </div>

          {/* Footer — Undo · Hint · +Tube · Restart · Skip (classic size, Restart back). */}
          <div id="hud-bottom" className="fixed inset-x-0 bottom-0 z-10 flex justify-center pb-[max(1rem,env(safe-area-inset-bottom))]">
            <div className="flex items-center gap-2 rounded-2xl bg-slate-900/85 px-3 py-2.5 shadow-xl backdrop-blur">
              <ActionButton
                onClick={handleUndo}
                pulse={hintNudge.includes('undo')}
                disabled={!canUndo || undosLeft === 0}
                dimmed={undosLeft === 0}
              >
                {undoLabel}
              </ActionButton>
              <ActionButton
                onClick={handleHint}
                disabled={hintsLeft === 0 || hintPending}
                dimmed={hintsLeft === 0}
              >
                {hintLabel}
              </ActionButton>
              <ActionButton
                onClick={handleAddTube}
                pulse={(deadlocked && !won && tubesLeft !== 0) || hintNudge.includes('tube')}
                disabled={tubesLeft === 0}
                dimmed={tubesLeft === 0}
              >
                {tubeLabel}
              </ActionButton>
              <ActionButton onClick={restart} pulse={hintNudge.includes('restart')}>{t.common.reiniciar}</ActionButton>
              {mode === 'journey' && !won && (
                <ActionButton onClick={skipPhase}>{t.hud.pular}</ActionButton>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── IMMERSION OFFER (first Play on mobile) ────────────────────── */}
      {showImmersion && (
        <ImmersionOnboarding onClose={closeImmersion} />
      )}

      {/* ── "STUCK WITH NO WAY OUT" MODAL ─────────────────────────────── */}
      {trulyStuck && screen === 'game' && !generating && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="flex max-h-[85dvh] flex-col items-center gap-4 overflow-y-auto overscroll-contain rounded-2xl bg-slate-900/95 px-7 py-6 text-center shadow-2xl">
            <div className="text-lg font-bold text-amber-300">{t.hud.semMovimentosTitulo}</div>
            <div className="text-sm text-slate-400">{t.hud.naoHaMaisJogadas}</div>
            <div className="flex gap-2">
              <button
                onClick={restart}
                className="rounded-xl bg-slate-700 px-4 py-2 text-sm font-medium text-slate-200 transition active:scale-95"
              >
                {t.common.reiniciar}
              </button>
              {mode === 'journey' && (
                <button
                  onClick={skipPhase}
                  className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-900 transition active:scale-95"
                >
                  {t.hud.pularFase}
                </button>
              )}
              <button
                onClick={goMenu}
                className="rounded-xl bg-slate-700 px-4 py-2 text-sm font-medium text-slate-200 transition active:scale-95"
              >
                {t.common.menu}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── GENERATING OVERLAY ───────────────────────────────────────── */}
      {generating && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="rounded-xl bg-slate-900/85 px-5 py-3 text-sm text-slate-300 backdrop-blur">
            {isBoss ? t.hud.preparandoBatalha : t.hud.preparandoFase}
          </div>
        </div>
      )}

      {/* ── BOSS INTRO ───────────────────────────────────────────────── */}
      {pendingBoss && (
        <BossIntroScreen
          boss={pendingBoss}
          onFight={() => handleBossFight(pendingBoss)}
          onFlee={() => {
            setPendingBoss(null);
            setWon(false);
            setScreen('menu');
            void audio.startMusic(selectMenuTrack(loadPrefs().musicTrack));
          }}
        />
      )}

      {/* ── VICTORY MODAL ────────────────────────────────────────────── */}
      {showVictoryModal && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/55 backdrop-blur-sm">
          <div className="flex max-h-[85dvh] flex-col items-center gap-5 overflow-y-auto overscroll-contain rounded-2xl bg-slate-900/95 px-8 py-7 text-center shadow-2xl">
            <div className={`text-2xl font-bold tracking-wide ${isBoss ? 'text-red-300' : 'text-amber-300'}`}>
              {isBoss ? t.hud.chefaoDerrotado : t.hud.decantado}
            </div>

            {stars !== null && !isBoss && (
              <div className="flex gap-1.5">
                {[1, 2, 3].map((s) => (
                  <span
                    key={s}
                    className={`text-3xl transition-all ${s <= stars ? 'text-amber-400 drop-shadow-[0_0_6px_rgba(251,191,36,0.6)]' : 'text-slate-700'}`}
                  >
                    ★
                  </span>
                ))}
              </div>
            )}

            <div className="text-sm text-slate-400">
              {t.common.jogadas(moves)}{optimalMoves > 0 && !isBoss && ` · ${t.hud.otimoInline(optimalMoves)}`}
            </div>

            {wonCoins > 0 && (
              <div className="rounded-lg bg-amber-400/10 px-3 py-1 text-sm font-medium text-amber-400">
                + {t.common.moedas(wonCoins)}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={restart}
                className="rounded-xl bg-slate-700 px-4 py-2 text-sm font-medium text-slate-200 transition active:scale-95"
              >
                {t.hud.repetir}
              </button>
              {mode === 'journey' ? (
                <button
                  onClick={nextPhase}
                  className="rounded-xl bg-teal-400 px-5 py-2 text-sm font-semibold text-slate-900 transition active:scale-95"
                >
                  {t.hud.proxima}
                </button>
              ) : (
                <button
                  onClick={goMenu}
                  className="rounded-xl bg-teal-400 px-5 py-2 text-sm font-semibold text-slate-900 transition active:scale-95"
                >
                  {t.common.menu}
                </button>
              )}
            </div>

            {/* Don't show again — normal journey only */}
            {mode === 'journey' && !isBoss && (
              <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-500">
                <input
                  type="checkbox"
                  checked={skipVictory}
                  onChange={(e) => {
                    const v = e.target.checked;
                    setSkipVictory(v);
                    savePrefs({ ...loadPrefs(), skipVictory: v });
                    // When checked, immediately advance to the next phase
                    if (v) nextPhase();
                  }}
                  className="h-3.5 w-3.5 cursor-pointer accent-teal-400"
                />
                {t.hud.naoMostrarNovamente}
              </label>
            )}
          </div>
        </div>
      )}

      {/* ── VICTORY ANIMATION ────────────────────────────────────────── */}
      {showVictoryAnim && (
        <VictoryAnim
          amount={wonCoins}
          coinRef={coinHudRef}
          onComplete={() => setShowVictoryAnim(false)}
        />
      )}

      {/* ── SHOP ─────────────────────────────────────────────────────── */}
      {showShop && (
        <ShopModal
          wallet={wallet}
          onBuyOrEquip={handleBuyOrEquip}
          onPreview={handlePreview}
          onClose={handleShopClose}
        />
      )}

      {/* ── SOUND ────────────────────────────────────────────────────── */}
      {showSoundSettings && (
        <SoundSettings
          onClose={() => setShowSoundSettings(false)}
        />
      )}

      {/* ── SETTINGS ─────────────────────────────────────────────────── */}
      {showAjustes && (
        <AjustesModal
          onClose={() => setShowAjustes(false)}
          onPerfModeChange={(mode) => sceneRef.current?.setPerfMode(mode)}
          skipVictory={skipVictory}
          onSkipVictoryChange={setSkipVictory}
        />
      )}

      {/* ── MODE SELECTOR ────────────────────────────────────────────── */}
      {showModeSelector && (
        <ModeSelector
          currentMode={journeyMode}
          onSelect={startJourneyWithMode}
          onClose={() => setShowModeSelector(false)}
        />
      )}

      {/* ── WILD TUTORIAL ────────────────────────────────────────────── */}
      {showWildTutorial && screen === 'game' && (
        <WildTutorial
          onDismiss={() => {
            setShowWildTutorial(false);
            savePrefs({ ...loadPrefs(), wildTutorialShown: true });
          }}
        />
      )}
    </>
  );
}

function ActionButton({
  onClick,
  disabled = false,
  dimmed = false,
  pulse = false,
  big = false,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  dimmed?: boolean;
  pulse?: boolean;
  big?: boolean; // larger targets (~56px) — recommended mobile touch floor
  children: React.ReactNode;
}) {
  const size = big ? 'h-14 min-w-[3.75rem] text-sm' : 'h-10 min-w-[3.25rem] text-xs';
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex ${size} items-center justify-center rounded-xl bg-slate-700/85 px-3 font-medium text-slate-200 shadow transition active:scale-95 disabled:cursor-not-allowed${dimmed ? ' opacity-30' : ''}${pulse ? ' animate-pulse ring-2 ring-teal-400 ring-offset-1 ring-offset-slate-900/0' : ''}`}
    >
      {children}
    </button>
  );
}

/** Coin pill with an amber "+" — a "tap to buy" affordance (shop). Used in the menu and the HUD.
 *  The HUD's `innerRef` is the target that VictoryAnim aims at (the flying coin).
 *  The "+" is an SVG (two strokes), not the '+' character: the text glyph ends up OFF-CENTER on
 *  desktop because its vertical position within the line box depends on font metrics (Segoe UI on
 *  Windows ≠ the phone's font). The SVG is pixel-perfect on any platform. */
function CoinPill({ coins, onClick, innerRef }: { coins: number; onClick: () => void; innerRef?: React.Ref<HTMLButtonElement> }) {
  return (
    <button
      ref={innerRef}
      onClick={onClick}
      className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-slate-900/75 py-1.5 pl-3 pr-1.5 text-sm font-semibold text-amber-300 backdrop-blur transition active:scale-95"
    >
      <span className="text-amber-400">★</span>
      <span className="tabular-nums">{coins}</span>
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-400 text-slate-900">
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </span>
    </button>
  );
}

/** Config row on the home screen (Fullscreen / Sound / Settings) — icon + label + chevron.
 *  `icon` receives the SVG <path>(s). `accent` highlights it (used for Fullscreen). */
function MenuRow({ label, onClick, icon, accent = false }: { label: string; onClick: () => void; icon: React.ReactNode; accent?: boolean }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-2xl bg-slate-800/80 px-5 py-3.5 text-left shadow-lg transition active:scale-95"
    >
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${accent ? 'bg-teal-400/15 text-teal-300' : 'bg-slate-400/10 text-slate-300'}`}>
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>{icon}</svg>
      </span>
      <span className="flex-1 text-sm font-medium text-slate-200">{label}</span>
      <svg className="h-4 w-4 shrink-0 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
      </svg>
    </button>
  );
}

/** In-game HUD "Menu" button — a menu icon (☰) that goes STRAIGHT to the home screen without
 *  asking anything (no pause overlay by design). The pulse covers the deadlock case. */
function MenuButton({ onClick, label, pulse = false }: { onClick: () => void; label: string; pulse?: boolean }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className={`pointer-events-auto flex h-10 items-center gap-1.5 rounded-xl bg-slate-900/75 px-3 text-sm font-semibold text-slate-100 backdrop-blur transition active:scale-90${pulse ? ' animate-pulse ring-2 ring-teal-400' : ''}`}
    >
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
      </svg>
      <span>{label}</span>
    </button>
  );
}

const CONFETTI_COLORS = ['#ef4444','#22c55e','#3b82f6','#eab308','#f97316','#a855f7','#06b6d4','#ec4899'];

function VictoryAnim({
  amount,
  coinRef,
  onComplete,
}: {
  amount: number;
  coinRef: React.RefObject<HTMLButtonElement | null>;
  onComplete: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const tl = gsap.timeline({ onComplete });

    const particles = Array.from({ length: 28 }, (_, i) => {
      const el = document.createElement('div');
      const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
      el.style.cssText = `position:absolute;width:10px;height:7px;border-radius:2px;left:50%;top:50%;transform:translate(-50%,-50%);background:${color};pointer-events:none`;
      container.appendChild(el);
      return el;
    });

    particles.forEach((el, i) => {
      const angle = (i / particles.length) * Math.PI * 2 + (Math.random() - 0.5) * 0.6;
      const dist = 90 + Math.random() * 110;
      tl.to(el, {
        x: Math.cos(angle) * dist,
        y: Math.sin(angle) * dist - 60,
        rotation: Math.random() * 720 - 360,
        opacity: 0,
        duration: 1.1 + Math.random() * 0.4,
        ease: 'power2.out',
      }, 0);
    });

    const badge = document.createElement('div');
    badge.style.cssText = `position:absolute;left:50%;top:50%;transform:translate(-50%,-50%) scale(0);background:#fbbf24;color:#1e293b;font-size:1.6rem;font-weight:800;padding:10px 22px;border-radius:18px;box-shadow:0 4px 28px rgba(251,191,36,0.55);white-space:nowrap;pointer-events:none`;
    badge.textContent = `+${amount} ★`;
    container.appendChild(badge);

    tl.to(badge, { scale: 1, duration: 0.38, ease: 'back.out(1.7)' }, 0.05);

    tl.add(() => {
      const rect = coinRef.current?.getBoundingClientRect();
      if (rect) {
        const tx = rect.left + rect.width / 2 - window.innerWidth / 2;
        const ty = rect.top + rect.height / 2 - window.innerHeight / 2;
        gsap.to(badge, { x: tx, y: ty, scale: 0.35, opacity: 0, duration: 0.55, ease: 'power2.in' });
      } else {
        gsap.to(badge, { y: -120, opacity: 0, duration: 0.5, ease: 'power2.in' });
      }
    }, 1.15);

    return () => {
      tl.kill();
      particles.forEach(el => el.remove());
      badge.remove();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={containerRef} className="pointer-events-none fixed inset-0 z-50" />;
}
