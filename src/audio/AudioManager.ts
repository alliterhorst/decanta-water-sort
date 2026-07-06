/**
 * Audio synthesized via Web Audio (no files). Everything routes through a MASTER with a
 * convolution reverb + compressor, to give cohesion and a modern finish (no dry 8-bit beep).
 *
 * Sound philosophy (the old soundtrack was harsh — trebly, game-beep):
 *  - POUR       = REAL liquid sound: filtered noise (the jet's "shhh") + "glug-glug" bubbles
 *                 (oscillators with falling pitch) — no longer a beep.
 *  - SOUNDTRACK = warm, LOW pads (slow Am–F–C–G chords via lowpass + reverb). Calm, enveloping,
 *                 no trebly notes.
 *  - SFX        = warm tones with reverb (marimba click, completion as a low triad, pentatonic
 *                 victory without shrillness, invalid = muffled "thunk").
 *
 * Music and SFX have separate channels (and mutes). Web Audio needs a user gesture → unlock().
 */
import { loadPrefs, Prefs, savePrefs } from '../game/settings';

export class AudioManager {
  private ctx: AudioContext | null = null;
  private musicGain!: GainNode; // soundtrack bus (dry)
  private sfxGain!: GainNode; // effects bus (dry)
  private master!: DynamicsCompressorNode; // glues everything together
  private reverb!: ConvolverNode; // shared reverb (cohesion)
  private reverbGain!: GainNode; // wet level
  private noiseBuf!: AudioBuffer; // reusable white noise (water)
  private prefs: Prefs;
  private musicTimer: number | null = null;
  private musicStep = 0;
  private musicCtx: MusicContext = 'calm';

  constructor() {
    this.prefs = loadPrefs();
  }

  getPrefs(): Prefs {
    return this.prefs;
  }

  /** Creates/unlocks the context (call within a user gesture). */
  unlock(): void {
    if (!this.ctx) {
      const Ctx =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctx();

      // master: gentle compressor → output
      this.master = this.ctx.createDynamicsCompressor();
      this.master.threshold.value = -16;
      this.master.knee.value = 26;
      this.master.ratio.value = 3;
      this.master.attack.value = 0.006;
      this.master.release.value = 0.25;
      this.master.connect(this.ctx.destination);

      // reverb (synthetic impulse) — wet goes to the master
      this.reverb = this.ctx.createConvolver();
      this.reverb.buffer = this.makeImpulse(2.4, 2.8);
      this.reverbGain = this.ctx.createGain();
      this.reverbGain.gain.value = 0.5;
      this.reverb.connect(this.reverbGain);
      this.reverbGain.connect(this.master);

      // buses: dry → master; and a copy → reverb (wet)
      this.musicGain = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();
      this.musicGain.connect(this.master);
      this.sfxGain.connect(this.master);
      const mWet = this.ctx.createGain();
      mWet.gain.value = 0.35;
      this.musicGain.connect(mWet);
      mWet.connect(this.reverb);
      const sWet = this.ctx.createGain();
      sWet.gain.value = 0.22;
      this.sfxGain.connect(sWet);
      sWet.connect(this.reverb);

      this.noiseBuf = this.makeNoise(1.0);
      this.applyGains();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    if (this.prefs.music) this.startMusic();
  }

  // ---- synthesis helpers ----

  private makeNoise(seconds: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  /** Exponential reverb impulse. */
  private makeImpulse(seconds: number, decay: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  private applyGains(): void {
    if (!this.ctx) return;
    this.musicGain.gain.value = this.prefs.music ? 0.5 : 0;
    this.sfxGain.gain.value = this.prefs.sfx ? 0.85 : 0;
  }

  toggleMusic(): boolean {
    this.prefs.music = !this.prefs.music;
    savePrefs(this.prefs);
    this.applyGains();
    if (this.prefs.music) this.startMusic();
    else this.stopMusic();
    return this.prefs.music;
  }

  toggleSfx(): boolean {
    this.prefs.sfx = !this.prefs.sfx;
    savePrefs(this.prefs);
    this.applyGains();
    return this.prefs.sfx;
  }

  // ---- SFX (warm tones) ----

  /** Soft tone (sine + slight detune) with a bell envelope — warm, routed through the reverb. */
  private tone(freq: number, when: number, dur: number, gain = 0.5, type: OscillatorType = 'sine'): void {
    const ctx = this.ctx!;
    for (const det of [-3, 4]) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      osc.detune.value = det;
      g.gain.setValueAtTime(0, when);
      g.gain.linearRampToValueAtTime(gain, when + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
      osc.connect(g);
      g.connect(this.sfxGain);
      osc.start(when);
      osc.stop(when + dur + 0.03);
    }
  }

  /** Water bubble: soft, muffled "blup" with a gentle glide (no robotic chirp from a hard glide). */
  private bubble(when: number, freq: number, gain = 0.3): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = freq * 3.2; // muffles the treble → water sound, not a beep
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq * 1.16, when);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.88, when + 0.055);
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(gain, when + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.11);
    osc.connect(lp);
    lp.connect(g);
    g.connect(this.sfxGain);
    osc.start(when);
    osc.stop(when + 0.14);
  }

  /**
   * Pour sound: REAL liquid. Jet = bandpass noise swell + a glug of 3 bubbles.
   * `progress` (0→1, how far the column has already fallen) makes the jet slightly higher-pitched
   * toward the end.
   */
  pour(progress = 0): void {
    if (!this.ctx || !this.prefs.sfx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const dur = 0.9;

    // 1) JET: filtered noise (LOW bandpass + lowpass that kills the hiss) with a slight flow
    //    "wobble" via an LFO on the gain — sounds like running water, not a static shhh.
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 0.6;
    bp.frequency.setValueAtTime(520 + progress * 150, t);
    bp.frequency.linearRampToValueAtTime(690 + progress * 210, t + dur);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1500; // cuts the sibilant treble (the "hiss")
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.13, t + 0.12);
    g.gain.setValueAtTime(0.13, t + dur - 0.25);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.type = 'sine';
    lfo.frequency.value = 11;
    lfoGain.gain.value = 0.04;
    lfo.connect(lfoGain);
    lfoGain.connect(g.gain);
    src.connect(bp);
    bp.connect(lp);
    lp.connect(g);
    g.connect(this.sfxGain);
    src.start(t);
    src.stop(t + dur + 0.05);
    lfo.start(t);
    lfo.stop(t + dur + 0.05);

    // 2) BUBBLING: low, soft, RANDOM bubbles (organic — not periodic/robotic).
    const n = 4 + Math.floor(Math.random() * 2);
    for (let i = 0; i < n; i++) {
      const dt = 0.05 + Math.random() * (dur - 0.15);
      const f = 130 + Math.random() * 90 + progress * 50;
      this.bubble(t + dt, f, 0.16 + Math.random() * 0.1);
    }
  }

  /** Tube completed: ascending warm triad (low, without shrillness). */
  complete(): void {
    if (!this.ctx || !this.prefs.sfx) return;
    const t = this.ctx.currentTime;
    [392, 494, 587].forEach((f, i) => this.tone(f, t + i * 0.075, 0.5, 0.5));
  }

  /** Level victory: warm pentatonic arpeggio, soft bell (capped at ~784, nothing trebly). */
  victory(): void {
    if (!this.ctx || !this.prefs.sfx) return;
    const t = this.ctx.currentTime;
    [392, 440, 523, 587, 659, 784].forEach((f, i) => this.tone(f, t + i * 0.1, 0.7, 0.5));
    // sustained final chord to close it out
    [392, 523, 659].forEach((f) => this.tone(f, t + 0.7, 1.4, 0.32));
  }

  /** Invalid move: muffled "thunk" (short lowpass noise + low sine). No buzz. */
  invalid(): void {
    if (!this.ctx || !this.prefs.sfx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 320;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    src.connect(lp);
    lp.connect(g);
    g.connect(this.sfxGain);
    src.start(t);
    src.stop(t + 0.2);
    this.tone(98, t, 0.18, 0.3, 'sine');
  }

  /**
   * UI tap / selection: LOW, soft "pock" (not the trebly beep from before, which got tiring).
   * Sine + lowpass + slight downward glide = muffled marimba/wood. Pleasant across a whole session.
   */
  click(): void {
    if (!this.ctx || !this.prefs.sfx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1100; // removes the sibilant treble
    osc.type = 'sine';
    osc.frequency.setValueAtTime(300, t);
    osc.frequency.exponentialRampToValueAtTime(188, t + 0.085); // downward pluck = soft
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.2, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    osc.connect(lp);
    lp.connect(g);
    g.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.2);
  }

  // ---- Music: warm pads by CONTEXT (calm / bonus / boss) ----

  /**
   * Each mood has its own progression, tempo, timbre, and top layer — but all pass through the
   * same lowpass + reverb to stay warm (nothing dry and trebly):
   *  - calm  : slow Am–F–C–G pads + sparse music-box piano (journey/diary, lo-fi/relax piano).
   *  - bonus : livelier major progression C–G–Am–F + light chime (bonus/showcase screens).
   *  - boss  : minor and darker, faster tempo + a low "heartbeat" pulse (tension without shrillness).
   */
  private static readonly MUSIC: Record<MusicContext, MusicConfig> = {
    calm: {
      chords: [
        [220, 261.63, 329.63], // Am
        [174.61, 220, 261.63], // F
        [130.81, 196, 261.63], // C
        [196, 246.94, 293.66], // G
      ],
      stepMs: 4800,
      chordDur: 5.6,
      lowpass: 680,
      padGain: 0.09,
      type: 'sine',
      melody: [220, 261.63, 293.66, 329.63, 392], // A minor pentatonic, low (no treble)
      melodyGain: 0.055,
      bass: false,
    },
    bonus: {
      chords: [
        [130.81, 196, 261.63], // C
        [196, 246.94, 293.66], // G
        [220, 261.63, 329.63], // Am
        [174.61, 220, 261.63], // F
      ],
      stepMs: 4200,
      chordDur: 5.0,
      lowpass: 900,
      padGain: 0.085,
      type: 'triangle',
      melody: [261.63, 293.66, 329.63, 392, 440], // C major pentatonic, restrained brightness
      melodyGain: 0.06,
      bass: false,
    },
    boss: {
      chords: [
        [146.83, 174.61, 220], // Dm
        [116.54, 174.61, 233.08], // Bb
        [130.81, 174.61, 261.63], // F
        [110, 164.81, 220], // Am
      ],
      stepMs: 3200,
      chordDur: 4.0,
      lowpass: 520, // darker
      padGain: 0.1,
      type: 'sawtooth', // more body, tamed by the low lowpass
      melody: null, // no music box; the tension comes from the low pulse
      melodyGain: 0,
      bass: true,
    },
  };

  /** Switches the soundtrack's mood (natural crossfade from the overlapping pads). */
  setMusicContext(ctx: MusicContext): void {
    if (ctx === this.musicCtx) return;
    this.musicCtx = ctx;
    if (this.ctx && this.prefs.music) {
      this.stopMusic();
      this.startMusic();
    }
  }

  private playChord(freqs: number[], when: number, dur: number, cfg: MusicConfig): void {
    const ctx = this.ctx!;
    for (const f of freqs) {
      for (const det of [-5, 6]) {
        const osc = ctx.createOscillator();
        const lp = ctx.createBiquadFilter();
        const g = ctx.createGain();
        osc.type = cfg.type;
        osc.frequency.value = f;
        osc.detune.value = det;
        lp.type = 'lowpass';
        lp.frequency.value = cfg.lowpass;
        g.gain.setValueAtTime(0, when);
        g.gain.linearRampToValueAtTime(cfg.padGain, when + 1.2); // slow swell
        g.gain.setValueAtTime(cfg.padGain, when + dur - 1.5);
        g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
        osc.connect(lp);
        lp.connect(g);
        g.connect(this.musicGain);
        osc.start(when);
        osc.stop(when + dur + 0.1);
      }
    }
  }

  /** Soft "music-box piano" note for the top layer (triangle + lowpass, medium decay). */
  private pluck(freq: number, when: number, gain: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const lp = ctx.createBiquadFilter();
    const g = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    lp.type = 'lowpass';
    lp.frequency.value = 1400;
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(gain, when + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 1.1);
    osc.connect(lp);
    lp.connect(g);
    g.connect(this.musicGain);
    osc.start(when);
    osc.stop(when + 1.2);
  }

  /** Boss "heartbeat" low pulse: 4 beats per chord (sine on the root, one octave down). */
  private bassPulse(root: number, when: number, stepSec: number): void {
    const ctx = this.ctx!;
    const beats = 4;
    for (let i = 0; i < beats; i++) {
      const t = when + (stepSec / beats) * i;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = root / 2;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.12, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
      osc.connect(g);
      g.connect(this.musicGain);
      osc.start(t);
      osc.stop(t + 0.36);
    }
  }

  private startMusic(): void {
    if (!this.ctx || this.musicTimer !== null) return;
    const adv = (): void => {
      if (!this.ctx || !this.prefs.music) return;
      const cfg = AudioManager.MUSIC[this.musicCtx];
      const ch = cfg.chords[this.musicStep % cfg.chords.length];
      const when = this.ctx.currentTime + 0.05;
      this.playChord(ch, when, cfg.chordDur, cfg);
      const stepSec = cfg.stepMs / 1000;
      // sparse top layer: 0–2 little notes per chord (lets it breathe)
      if (cfg.melody) {
        const hits = Math.random() < 0.35 ? 0 : Math.random() < 0.6 ? 1 : 2;
        for (let i = 0; i < hits; i++) {
          const note = cfg.melody[Math.floor(Math.random() * cfg.melody.length)];
          const oct = Math.random() < 0.5 ? 1 : 2; // sometimes an octave up, still restrained
          this.pluck(note * oct, when + 0.6 + Math.random() * (stepSec - 1.2), cfg.melodyGain);
        }
      }
      if (cfg.bass) this.bassPulse(ch[0], when, stepSec);
      this.musicStep++;
    };
    adv();
    this.musicTimer = window.setInterval(adv, AudioManager.MUSIC[this.musicCtx].stepMs);
  }

  private stopMusic(): void {
    if (this.musicTimer !== null) {
      window.clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }
}

/** Soundtrack moods by game context. */
export type MusicContext = 'calm' | 'bonus' | 'boss';

interface MusicConfig {
  chords: number[][];
  stepMs: number; // interval between chords
  chordDur: number; // duration (s) of each chord
  lowpass: number; // pad warmth
  padGain: number;
  type: OscillatorType;
  melody: number[] | null; // note pool for the top layer (null = none)
  melodyGain: number;
  bass: boolean; // low tension pulse (boss)
}

/** Single shared instance across scenes. */
export const audio = new AudioManager();
