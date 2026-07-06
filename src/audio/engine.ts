/**
 * Decanta audio engine.
 *
 * Two-layer architecture:
 *  - Background music → HTMLAudioElement (files in /audio/, MUSIC_TRACKS manifest)
 *  - Water SFX        → AudioBuffer from a real MP3 (fetch + decodeAudioData),
 *                       SFX_OPTIONS manifest. If the buffer hasn't loaded yet,
 *                       it schedules the load and plays NOTHING this time (no synthesis).
 */

// ── Water SFX manifest (real recordings, Pixabay Content License) ──

export interface SfxOption {
  id: string;
  // name does NOT live here — it's UI text, translated via t.sfx[id] in i18n/locales/*.ts (see
  // src/i18n/types.ts). This object only holds file data.
  file: string;
}

export const SFX_OPTIONS: SfxOption[] = [
  { id: 'copo-agua',        file: '/audio/sfx_copo-agua.mp3' },
  { id: 'copo-vidro',       file: '/audio/sfx_copo-vidro.mp3' },
  { id: 'copo-curto',       file: '/audio/sfx_copo-curto.mp3' },
  { id: 'copo-agua-rapido', file: '/audio/sfx_copo-agua-rapido.mp3' },
  { id: 'copo-agua-lento',  file: '/audio/sfx_copo-agua-lento.mp3' },
  { id: 'jarra-vidro',      file: '/audio/sfx_jarra-vidro.mp3' },
  { id: 'torneira-copo',    file: '/audio/sfx_torneira-copo.mp3' },
  { id: 'copo-cheio',       file: '/audio/sfx_copo-cheio.mp3' },
  { id: 'garrafa-enchendo', file: '/audio/sfx_garrafa-enchendo.mp3' },
];

export type SfxStyle = string;

export const DEFAULT_SFX_STYLE: SfxStyle = SFX_OPTIONS[0].id;

// Prefix runtime asset paths with Vite's base URL so they resolve when the app is served under a
// sub-path (e.g. GitHub Pages at /decanta-water-sort/). import.meta.env.BASE_URL ends with '/', and
// the manifest paths start with '/audio/…', so we strip the leading slash before concatenating.
const asset = (p: string): string => import.meta.env.BASE_URL + p.replace(/^\//, '');

const SFX_FILES: Record<string, string> = Object.fromEntries(
  SFX_OPTIONS.map(o => [o.id, asset(o.file)]),
);

// ── Music manifest (public-domain recordings — see licenseNotes) ──

export type MusicMood = 'calm' | 'upbeat' | 'boss' | 'epic';

export interface MusicTrackInfo {
  id: string;
  name: string;
  artist: string;
  style: string;
  mood: MusicMood;
  file: string;
  /** Loudness correction in dB (default 0) — see the loudness-normalization comment below. */
  gainDb?: number;
}

// ── Cross-track loudness normalization ─────────────────────────────────────────────────────────
// Symptom: some tracks are much louder than others. The recordings come from very different
// sources (military bands vs. Kevin MacLeod vs. Musopen) and were mastered at VERY different
// levels — measured with `ffmpeg -af loudnorm` (integrated LUFS) per file: ranged from
// -25.4 LUFS (Åse's Death) to -7.8 LUFS (Take a Chance), a ~17.6 LU spread. That is very audible
// (each 10 LU ≈ doubles/halves perceived loudness), which explains why some tracks blast while
// others vanish.
// Fix: each track gets a fixed `gainDb`, computed offline to converge all of them near -16 LUFS
// (a common streaming/game standard), applied ON TOP of the player's music volume (it doesn't
// replace the slider, it only equalizes the tracks against each other). The boost is always
// capped by each file's measured TRUE PEAK (with 1 dB of headroom) — we never apply more gain
// than the real headroom allows, otherwise the quieter tracks would clip when trying to catch up.
// That's why not every track lands EXACTLY at -16 (e.g. 'menu' and 'peer-gynt-morning' already
// have no headroom to raise) — but the spread drops from ~17.6 LU to ~3-4 LU across playable
// tracks, which is acceptable (commercial masters vary a few dB from each other without sounding
// broken).
// Recompute when swapping/adding a track: `ffmpeg -i file.mp3 -af loudnorm=print_format=summary -f null -`.

export const MUSIC_TRACKS: MusicTrackInfo[] = [
  // Clair de Lune comes FIRST in the picker (right after "Dynamic") — it's the welcome track for
  // the menu / first level (ONBOARDING_TRACK). The order here = order in the list.
  { id: 'clair-de-lune-wright-brass', name: 'Clair de Lune', artist: 'Wright Brass (Debussy)', style: 'Quinteto de metais', mood: 'calm', file: '/audio/bgm_clair-de-lune-wright-brass.mp3', gainDb: 1.9 }, // measured: -21.1 LUFS / -2.9 dBTP
  { id: 'calm4', name: 'Retro', artist: 'Pixelland', style: 'Chiptune', mood: 'upbeat', file: '/audio/bgm_calm4.mp3', gainDb: -1.0 }, // measured: -17.4 LUFS / -0.0 dBTP

  // ── calm — modern studio recordings, public domain (official US bands + Musopen) ──
  // Removed after verifying in the picker + a real fetch/decode: HTTP 200 but the body was the SPA
  // index.html fallback, not audio — the .mp3/.ogg were NEVER added to public/audio:
  // 'Air (Orchestral Suite in D)' (air-air-force-strings-2000), 'Canon in D Major'
  // (canon-strolling-strings-2004), 'Hungarian Dance No. 1' (hungarian-dance-1-strolling-strings-1989).
  { id: 'shenandoah-singing-sergeants-2017',   name: 'Shenandoah',                   artist: 'United States Air Force Band — Singing Sergeants', style: 'Coral orquestral contemplativo', mood: 'calm', file: '/audio/bgm_shenandoah-singing-sergeants-2017.ogg', gainDb: -4.8 }, // measured: -11.2 LUFS / +0.1 dBTP
  { id: 'peer-gynt-morning-musopen-2012',      name: 'Peer Gynt — Morning Mood',     artist: 'Musopen Symphony Orchestra (Grieg)', style: 'Orquestra completa, atmosfera matinal', mood: 'calm', file: '/audio/bgm_peer-gynt-morning-musopen-2012.mp3' }, // measured: -19.2 LUFS / -1.0 dBTP — no headroom to raise, gainDb=0
  { id: 'aases-death-musopen-2012',            name: 'Peer Gynt — Åse’s Death', artist: 'Musopen Symphony Orchestra (Grieg)', style: 'Cordas orquestrais, lamento solene', mood: 'calm', file: '/audio/bgm_aases-death-musopen-2012.mp3', gainDb: 7.4 }, // measured: -25.4 LUFS / -8.4 dBTP (quietest in the set)

  // ── epic — marches and dramatic orchestral (official US bands + Kevin MacLeod CC-BY + Musopen) ──
  // Removed for the same reason above — the file never reached public/audio:
  // 'The Stars and Stripes Forever' (stars-and-stripes-usmc-2017), 'Hands Across the Sea'
  // (hands-across-the-sea-usmc-2018).
  { id: 'peer-gynt-mountain-king-musopen-2012', name: 'Peer Gynt — In the Hall of the Mountain King', artist: 'Musopen Symphony Orchestra (Grieg)', style: 'Orquestra completa, crescendo dramático', mood: 'epic', file: '/audio/bgm_peer-gynt-mountain-king-musopen-2012.mp3', gainDb: -3.6 }, // measured: -12.4 LUFS / -0.0 dBTP
  { id: 'volatile-reaction-macleod',      name: 'Volatile Reaction',                   artist: 'Kevin MacLeod (incompetech.com)', style: 'Orquestral de ação — metais e cordas graves', mood: 'epic', file: '/audio/bgm_volatile-reaction-macleod.mp3', gainDb: -8.1 }, // measured: -7.9 LUFS / +1.2 dBTP (loudest in the set)
  { id: 'take-a-chance-macleod',          name: 'Take a Chance',                       artist: 'Kevin MacLeod (incompetech.com)', style: 'Orquestral heroico/aventuresco', mood: 'epic', file: '/audio/bgm_take-a-chance-macleod.mp3', gainDb: -8.2 }, // measured: -7.8 LUFS / +0.9 dBTP
  { id: 'firebrand-macleod',              name: 'Firebrand',                           artist: 'Kevin MacLeod (incompetech.com)', style: 'Orquestral épico intenso — percussão e metais', mood: 'epic', file: '/audio/bgm_firebrand-macleod.mp3', gainDb: -2.8 }, // measured: -13.2 LUFS / +1.3 dBTP
];

/** Default "welcome" track: plays on the start menu and the first level of the journey — it gives
 *  a consistent sonic identity to newcomers, before the dynamic algorithm takes over from the
 *  second level onward. */
export const ONBOARDING_TRACK: MusicTrack = 'clair-de-lune-wright-brass';

/** Reserved tracks (menu/boss) + manifest → id → file map (base-prefixed via asset()). */
const MUSIC_FILES: Record<string, string> = {
  menu: asset('/audio/bgm_menu.mp3'),
  boss: asset('/audio/bgm_boss.mp3'),
};
for (const t of MUSIC_TRACKS) MUSIC_FILES[t.id] = asset(t.file);

// Reserved tracks need correction too (same methodology as MUSIC_TRACKS above).
const RESERVED_GAIN_DB: Record<string, number> = {
  menu: -0.9, // measured: -20.0 LUFS / -0.1 dBTP — no headroom to raise up to the target
  boss: -1.6, // measured: -14.0 LUFS / +0.6 dBTP
};

/** dB → linear gain multiplier (the Web Audio GainNode works on a linear scale). */
function dbToLinear(db: number): number {
  return Math.pow(10, db / 20);
}

/** Precomputed id → LINEAR gain map (reserved tracks + MUSIC_TRACKS; see the loudness-normalization
 *  comment above for the methodology). Absent = 1 (no correction). */
const MUSIC_GAINS: Record<string, number> = Object.fromEntries(
  Object.entries(RESERVED_GAIN_DB).map(([id, db]) => [id, dbToLinear(db)]),
);
for (const t of MUSIC_TRACKS) MUSIC_GAINS[t.id] = dbToLinear(t.gainDb ?? 0);

// ── App-level music cache (offline playback) ──────────────────────────────────────────────────
// Music files are large, so we cache them lazily and play-driven: a track is stored only once it
// has practically played through (CACHE_AT_FRACTION), so a track the player never listens to is
// never downloaded, and one they skip after a few seconds isn't cached either. Once cached, the
// track plays back from a blob (object URL), which works fully offline without relying on the
// service worker's finicky range-request handling for <audio>. The Cache Storage API is available
// in the window even without a service worker, and resetAllData() clears it along with everything.
const MUSIC_CACHE = 'decanta-music';
const CACHE_AT_FRACTION = 0.9;

export type MusicTrack = string;

/** Track ids by mood — used by the dynamic selection in App. */
export function tracksByMood(mood: MusicMood): MusicTrackInfo[] {
  return MUSIC_TRACKS.filter(t => t.mood === mood);
}

class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;

  private musicEl: HTMLAudioElement | null = null;
  private currentTrack: MusicTrack | null = null;
  /** Last REQUESTED track (even with music OFF or after stopMusic) — lets us resume the right
   *  track when the player turns music back on in settings. */
  private lastRequestedTrack: MusicTrack | null = null;
  /** Music generation: each startMusic/stopMusic invalidates the prior async calls. */
  private musicGen = 0;
  /** Every <audio> created and not yet paused — ensures none "escapes" still playing. */
  private liveEls = new Set<HTMLAudioElement>();
  /** Object URLs of elements playing from the offline cache, so killEl can revoke them (avoids
   *  leaking the decoded blob in memory once the element is torn down). */
  private objectUrls = new WeakMap<HTMLAudioElement, string>();
  /** true when the current track was paused due to focus loss / hidden tab (not by the player
   *  turning sound off) — distinguishes a "real" pause so we know whether to auto-resume. */
  private pausedByVisibility = false;
  /** Correction gain (linear) of the track PLAYING right now — see MUSIC_GAINS. It multiplies
   *  musicVol on every musicGain write (both startMusic's fade-in AND setMusicVolume), otherwise
   *  moving the volume slider while a track plays would wipe out its correction. */
  private currentTrackGain = 1;

  // Track preference saved by the player (undefined = use dynamic logic)
  private trackPref: MusicTrack | 'dynamic' | undefined = undefined;

  // Water SFX buffers (loaded via fetch + decodeAudioData)
  private sfxBuffers: Partial<Record<SfxStyle, AudioBuffer>> = {};
  private sfxLoadPromises: Partial<Record<SfxStyle, Promise<void>>> = {};

  // Prefs (sync'd with localStorage via settings.ts)
  musicOn   = true;
  sfxOn     = true;
  sfxStyle: SfxStyle = DEFAULT_SFX_STYLE;
  musicVol  = 0.35;
  sfxVol    = 0.55;

  constructor() {
    // Music used to "stop on its own" in 2 real scenarios, with no warning:
    // (a) the browser SUSPENDS the AudioContext when the tab stays backgrounded for a while — on
    //     return, the <audio> keeps "playing" (not paused), but the Web Audio graph (the GainNode
    //     it routes through) is suspended, so nothing comes out of the speaker;
    // (b) startMusic() silently swallowed an autoplay-policy failure from play() — this happens
    //     often here because play() only runs after 2 `await`s (stopMusic + getCtx), far enough
    //     from the original click gesture for some browsers (Safari especially) to refuse it — and
    //     the code carried on as if it had succeeded, never restarting until the next EXPLICIT
    //     track change.
    // Fixed with a safety net: on tab refocus, try to resume; if that still fails (no real
    //     gesture), try again on the NEXT real screen tap.
    //
    // Additionally: besides RESUMING on return, music should STOP on focus loss (tab/app switch,
    // or screen lock on mobile — both fire 'hidden' here, it's the same API). It pauses the
    // <audio> directly (without destroying the element) to resume exactly where it left off,
    // instead of restarting the track from scratch.
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void this.ensurePlaying();
        else this.pauseForVisibility();
      });
    }
  }

  /** Pauses music on focus loss (hidden tab / locked screen) — keeps the element and playback
   *  position intact so ensurePlaying() can resume exactly where it left off. */
  private pauseForVisibility(): void {
    if (this.musicEl && !this.musicEl.paused) {
      this.musicEl.pause();
      this.pausedByVisibility = true;
    }
  }

  /** Ensures music is actually playing: resumes the AudioContext if suspended (focus loss /
   *  background) and, if the audio element isn't really playing, tries to restart the last
   *  requested track. Called on tab refocus and as a retry after a blocked play(). */
  async ensurePlaying(): Promise<void> {
    if (!this.ctx) return; // audio hasn't even been unlocked yet — nothing to resume
    if (this.ctx.state === 'suspended') {
      try { await this.ctx.resume(); } catch { /* ignore — retry on the next trigger */ }
    }
    if (!this.musicOn) return;
    // Paused by us (focus loss) → resume the SAME element where it left off, without restarting
    // the track from scratch. Only fall through to a full restart if that fails or there's no
    // element.
    if (this.pausedByVisibility && this.musicEl) {
      this.pausedByVisibility = false;
      try {
        await this.musicEl.play();
        return;
      } catch {
        // autoplay blocked (rare here — this is resuming already-started media, not new playback);
        // same safety net as startMusic: try again on the next real tap.
        document.addEventListener('pointerdown', () => { void this.ensurePlaying(); }, { once: true });
        return;
      }
    }
    this.pausedByVisibility = false;
    const notActuallyPlaying = !this.musicEl || this.musicEl.paused;
    if (notActuallyPlaying && this.lastRequestedTrack) {
      await this.startMusic(this.lastRequestedTrack);
    }
  }

  // ── Context ──────────────────────────────────────────────────────────────

  private async getCtx(): Promise<AudioContext> {
    if (!this.ctx) {
      this.ctx = new AudioContext({ sampleRate: 44100 });
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 1;
      this.masterGain.connect(this.ctx.destination);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = this.sfxVol;
      this.sfxGain.connect(this.masterGain);

      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = this.musicVol;
      this.musicGain.connect(this.masterGain);
    }
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    return this.ctx;
  }

  // Must be called on the user's first gesture (click, tap)
  async unlock(): Promise<void> {
    await this.getCtx();
    // Kick off preloading of every SFX buffer in the background
    for (const style of Object.keys(SFX_FILES) as SfxStyle[]) {
      this.loadSfxBuffer(style);
    }
  }

  /** Loads (and decodes) the MP3 for an SFX style. Idempotent. */
  private loadSfxBuffer(style: SfxStyle): Promise<void> {
    if (this.sfxLoadPromises[style]) return this.sfxLoadPromises[style]!;
    const promise = (async () => {
      try {
        const ctx = await this.getCtx();
        const resp = await fetch(SFX_FILES[style]);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const arrayBuf = await resp.arrayBuffer();
        this.sfxBuffers[style] = await ctx.decodeAudioData(arrayBuf);
      } catch (err) {
        console.warn(`[AudioEngine] Failed to load ${SFX_FILES[style]}:`, err);
      }
    })();
    this.sfxLoadPromises[style] = promise;
    return promise;
  }

  // ── Background music ───────────────────────────────────────────────────────

  async startMusic(track: MusicTrack): Promise<void> {
    // Unknown id (old/corrupted pref) → fall back to the first calm track in the manifest
    if (!MUSIC_FILES[track]) {
      const fallback = MUSIC_TRACKS.find(t => t.mood === 'calm') ?? MUSIC_TRACKS[0];
      if (!fallback) return;
      track = fallback.id;
    }
    this.lastRequestedTrack = track; // remembered even if music is OFF right now
    this.pausedByVisibility = false; // an explicit track change cancels any focus-loss pause
    if (this.currentTrack === track && this.musicEl && !this.musicEl.paused) return;
    await this.stopMusic(0.4);
    // Claim the generation AFTER the stop (which also increments) — earlier calls still in await
    // get invalidated (avoids 2-3 tracks overlapping when navigating menu→level quickly).
    const gen = ++this.musicGen;

    if (!this.musicOn) return;

    const ctx = await this.getCtx();
    if (gen !== this.musicGen) return; // a more recent startMusic took over

    // Prefer the offline cache: if this track was already cached (played through before), play it
    // from a blob object URL — works with no network. Otherwise stream from the network URL and
    // schedule caching once it has practically played through.
    const fileUrl = MUSIC_FILES[track];
    let src = fileUrl;
    let fromCache = false;
    const cached = await this.getCachedMusic(fileUrl);
    if (gen !== this.musicGen) return; // superseded during the async cache lookup
    if (cached) {
      try {
        const blob = await cached.blob();
        if (gen !== this.musicGen) return;
        src = URL.createObjectURL(blob);
        fromCache = true;
      } catch { src = fileUrl; }
    }

    const el = new Audio(src);
    el.loop = true;
    el.crossOrigin = 'anonymous';
    el.volume = 1; // controlled by the GainNode
    this.musicEl = el;
    this.liveEls.add(el);
    if (fromCache) this.objectUrls.set(el, src);
    else this.scheduleCacheOnPlayed(el, fileUrl);

    const node = ctx.createMediaElementSource(el);
    node.connect(this.musicGain!);

    // Gentle fade-in — target already corrected by the TRACK gain (equalizes loudness across
    // recordings from different sources, see MUSIC_GAINS) on top of the player's volume.
    this.currentTrackGain = MUSIC_GAINS[track] ?? 1;
    this.musicGain!.gain.setValueAtTime(0, ctx.currentTime);
    this.musicGain!.gain.linearRampToValueAtTime(this.musicVol * this.currentTrackGain, ctx.currentTime + 1.2);

    let playedOk = true;
    try {
      await el.play();
    } catch {
      // play() blocked by autoplay policy (common here: we run after 2 `await`s, far from the
      // original click gesture). Does NOT pretend it succeeded — leaves currentTrack as it was and
      // registers a retry on the NEXT real screen tap (a visibilitychange alone doesn't count as a
      // gesture for some browsers to re-enable audio).
      playedOk = false;
      document.addEventListener('pointerdown', () => { void this.ensurePlaying(); }, { once: true });
    }
    if (gen !== this.musicGen) {
      // we were superseded during play() — tear this element down immediately
      this.killEl(el);
      return;
    }
    if (playedOk) this.currentTrack = track;
  }

  private killEl(el: HTMLAudioElement): void {
    try { el.pause(); el.src = ''; el.load(); } catch { /* ignore */ }
    const obj = this.objectUrls.get(el);
    if (obj) {
      try { URL.revokeObjectURL(obj); } catch { /* ignore */ }
      this.objectUrls.delete(el);
    }
    this.liveEls.delete(el);
    if (this.musicEl === el) this.musicEl = null;
  }

  // ── Music offline cache ─────────────────────────────────────────────────────

  /** Returns the cached Response for a music file, or null if not cached / Cache API unavailable. */
  private async getCachedMusic(url: string): Promise<Response | null> {
    if (typeof caches === 'undefined') return null;
    try {
      const cache = await caches.open(MUSIC_CACHE);
      return (await cache.match(url)) ?? null;
    } catch {
      return null;
    }
  }

  /** Downloads the full track file and stores it in the music cache. Idempotent (skips if already
   *  cached). Called once a track has practically played through, so only tracks the player
   *  actually listened to get cached. */
  private async cacheMusicTrack(url: string): Promise<void> {
    if (typeof caches === 'undefined') return;
    try {
      const cache = await caches.open(MUSIC_CACHE);
      if (await cache.match(url)) return; // already cached
      const resp = await fetch(url);
      if (resp.ok) await cache.put(url, resp);
    } catch {
      /* offline or fetch error — it'll try again the next time the track plays */
    }
  }

  /** While a streamed (uncached) track plays, cache it once playback passes CACHE_AT_FRACTION of
   *  its duration ("practically played fully"). Fires at most once, then detaches the listener. */
  private scheduleCacheOnPlayed(el: HTMLAudioElement, fileUrl: string): void {
    let triggered = false;
    const onTimeUpdate = () => {
      if (triggered) return;
      const d = el.duration;
      if (!Number.isFinite(d) || d <= 0) return;
      if (el.currentTime >= d * CACHE_AT_FRACTION) {
        triggered = true;
        el.removeEventListener('timeupdate', onTimeUpdate);
        void this.cacheMusicTrack(fileUrl);
      }
    };
    el.addEventListener('timeupdate', onTimeUpdate);
  }

  async stopMusic(fadeSec = 0.8): Promise<void> {
    this.musicGen++; // invalidate any startMusic still in await
    this.currentTrack = null;
    this.pausedByVisibility = false; // an explicit stop (screen change/OFF) is not a "focus pause"
    if (this.liveEls.size === 0) return;
    const ctx = await this.getCtx();
    const g = this.musicGain!;
    g.gain.setValueAtTime(g.gain.value, ctx.currentTime);
    g.gain.linearRampToValueAtTime(0, ctx.currentTime + fadeSec);
    // Pause ALL live elements (not just the last one) — any that escaped from an earlier race dies
    // here too.
    const els = [...this.liveEls];
    this.musicEl = null;
    setTimeout(() => { for (const el of els) this.killEl(el); }, fadeSec * 1000 + 50);
  }

  setMusicVolume(v: number): void {
    this.musicVol = v;
    if (this.musicGain && this.ctx) {
      // Preserve the current track's correction gain — otherwise moving the slider during
      // playback would wipe out the cross-track equalization (see startMusic).
      this.musicGain.gain.setValueAtTime(v * this.currentTrackGain, this.ctx.currentTime);
    }
  }

  setSfxVolume(v: number): void {
    this.sfxVol = v;
    if (this.sfxGain && this.ctx) {
      this.sfxGain.gain.setValueAtTime(v, this.ctx.currentTime);
    }
  }

  async setMusicOn(on: boolean): Promise<void> {
    this.musicOn = on;
    if (!on) { await this.stopMusic(); return; }
    // Resume the last requested track — currentTrack is nulled by the OFF toggle's stopMusic, so
    // relying on currentTrack alone left the ON toggle silent until the next screen change.
    const resume = this.currentTrack ?? this.lastRequestedTrack;
    if (resume) await this.startMusic(resume);
  }

  /** Saves the player's track preference (or 'dynamic' for automatic mode). */
  setMusicTrackPref(track: MusicTrack | 'dynamic'): void {
    this.trackPref = track;
  }

  /** Returns the current track preference. */
  getMusicTrackPref(): MusicTrack | 'dynamic' | undefined {
    return this.trackPref;
  }

  // ── SFX: water ────────────────────────────────────────────────────────────

  async playPour(durationSec: number): Promise<void> {
    if (!this.sfxOn) return;
    const ctx = await this.getCtx();
    const style = this.sfxStyle;

    const buf = this.sfxBuffers[style];
    if (buf) {
      this.playBufferPour(ctx, buf, durationSec);
    } else {
      // Buffer not loaded yet — schedule the load and play nothing this time.
      void this.loadSfxBuffer(style);
    }
  }

  /**
   * Plays a real MP3 AudioBuffer with an amplitude envelope
   * matched to the pour duration (durationSec).
   *
   * - If the buffer is shorter than durationSec, it loops.
   * - If it's longer, only the needed slice plays.
   * - Applies a 40 ms fade-in and 120 ms fade-out to avoid clicks.
   */
  private playBufferPour(ctx: AudioContext, buf: AudioBuffer, durationSec: number): void {
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = buf;

    // Loop if the buffer is shorter than the requested duration
    src.loop = buf.duration < durationSec;

    // Amplitude envelope: fast fade-in + sustain + gentle fade-out
    const env = ctx.createGain();
    const fadeIn  = 0.04;
    const fadeOut = 0.12;
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(1, t + fadeIn);
    env.gain.setValueAtTime(1, t + Math.max(fadeIn, durationSec - fadeOut));
    env.gain.linearRampToValueAtTime(0, t + durationSec);

    src.connect(env);
    env.connect(this.sfxGain!);
    src.start(t);
    src.stop(t + durationSec);
  }

  // ── SFX: others ───────────────────────────────────────────────────────────

  async playVictory(): Promise<void> {
    if (!this.sfxOn) return;
    const ctx = await this.getCtx();
    const t = ctx.currentTime;
    const scale = [523.25, 659.25, 783.99, 1046.50, 880.00, 1046.50]; // C5 maj arpeggio
    const durs =  [0.12,   0.12,   0.12,   0.14,    0.20,   0.45];

    let offset = 0;
    scale.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;

      const env = ctx.createGain();
      const st = t + offset;
      env.gain.setValueAtTime(0, st);
      env.gain.linearRampToValueAtTime(0.3, st + 0.02);
      env.gain.exponentialRampToValueAtTime(0.001, st + durs[i] + 0.08);

      osc.connect(env);
      env.connect(this.sfxGain!);
      osc.start(st);
      osc.stop(st + durs[i] + 0.1);
      offset += durs[i] * 0.85;
    });
  }

  async playClick(): Promise<void> {
    if (!this.sfxOn) return;
    const ctx = await this.getCtx();
    const t = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, t);
    osc.frequency.exponentialRampToValueAtTime(440, t + 0.06);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.15, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

    osc.connect(env);
    env.connect(this.sfxGain!);
    osc.start(t);
    osc.stop(t + 0.1);
  }

  async playFlood(): Promise<void> {
    if (!this.sfxOn) return;
    const ctx = await this.getCtx();
    const t = ctx.currentTime;

    // Low tone + brief splash — sounds like a thick drop falling
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.exponentialRampToValueAtTime(60, t + 0.15);

    const noise = ctx.createBufferSource();
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.1, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    noise.buffer = buf;

    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = 800;

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.4, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.18);

    const nEnv = ctx.createGain();
    nEnv.gain.setValueAtTime(0.2, t);
    nEnv.gain.exponentialRampToValueAtTime(0.001, t + 0.1);

    osc.connect(env);    env.connect(this.sfxGain!);
    noise.connect(noiseFilter); noiseFilter.connect(nEnv); nEnv.connect(this.sfxGain!);
    osc.start(t); osc.stop(t + 0.2);
    noise.start(t);
  }

  async playBossIntro(): Promise<void> {
    if (!this.sfxOn) return;
    const ctx = await this.getCtx();
    const t = ctx.currentTime;
    // Dramatic descending chord
    const freqs = [55, 82.4, 110, 164.8]; // A1 E2 A2 E3
    freqs.forEach((f, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = f;

      const env = ctx.createGain();
      env.gain.setValueAtTime(0, t + i * 0.07);
      env.gain.linearRampToValueAtTime(0.15, t + i * 0.07 + 0.08);
      env.gain.exponentialRampToValueAtTime(0.001, t + 1.5);

      osc.connect(env);
      env.connect(this.sfxGain!);
      osc.start(t + i * 0.07);
      osc.stop(t + 1.6);
    });
  }

  /** Tube cap: cork pop + metallic click of a golden cap. */
  async playCapPop(): Promise<void> {
    if (!this.sfxOn) return;
    const ctx = await this.getCtx();
    const t = ctx.currentTime;

    // Soft pop (simulating air being released from the cork)
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(320, t);
    osc.frequency.exponentialRampToValueAtTime(180, t + 0.07);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.22, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    osc.connect(env); env.connect(this.sfxGain!);
    osc.start(t); osc.stop(t + 0.13);

    // Metallic click of the golden cap
    const clickBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.04), ctx.sampleRate);
    const d = clickBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (d.length * 0.15));
    const click = ctx.createBufferSource();
    click.buffer = clickBuf;

    const clickFilter = ctx.createBiquadFilter();
    clickFilter.type = 'bandpass';
    clickFilter.frequency.value = 3200;
    clickFilter.Q.value = 0.6;

    const clickEnv = ctx.createGain();
    clickEnv.gain.setValueAtTime(0.35, t + 0.06);
    clickEnv.gain.exponentialRampToValueAtTime(0.001, t + 0.13);

    click.connect(clickFilter); clickFilter.connect(clickEnv); clickEnv.connect(this.sfxGain!);
    click.start(t + 0.06);

    // Residual ring (glass harmonic)
    const ring = ctx.createOscillator();
    ring.type = 'sine';
    ring.frequency.value = 1100 + Math.random() * 200;
    const ringEnv = ctx.createGain();
    ringEnv.gain.setValueAtTime(0.06, t + 0.07);
    ringEnv.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    ring.connect(ringEnv); ringEnv.connect(this.sfxGain!);
    ring.start(t + 0.07); ring.stop(t + 0.5);
  }

  // ── Preview for settings ─────────────────────────────────────────────────

  async previewSfx(style: SfxStyle): Promise<void> {
    // Ensure the buffer before playing — with no synthesis, a silent preview would be confusing
    await this.loadSfxBuffer(style);
    const saved = this.sfxStyle;
    this.sfxStyle = style;
    await this.playPour(1.5);
    this.sfxStyle = saved;
  }
}

// Global singleton
export const audio = new AudioEngine();
