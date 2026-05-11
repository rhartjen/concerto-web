import type { InstrumentName } from '../constants/instrumentMap';
import { INSTRUMENT_GAIN } from '../constants/instrumentMap';
import { useTempoStore } from '../store/tempoStore';

// ── Types ──────────────────────────────────────────────────────────────────────

type SynthFn = (
  ac:       AudioContext,
  dest:     AudioNode,
  freqs:    number[],
  duration: number,
  peak:     number,
) => void;

// ── Constants ──────────────────────────────────────────────────────────────────

const AMPLITUDE      = 0.38;
// High-pass cutoff for all melodic instruments — keeps them out of the low end
// where kick and 808 bass live.
const HPF_CUTOFF_HZ  = 80;
// 808 bass is clamped to this ceiling so it always sits in the sub-bass band.
const BASS_808_MAX_HZ = 80;

// Fraction of each instrument's output routed into the reverb convolver.
const WET: Record<InstrumentName, number> = {
  'kick drum':  0.10,
  'snare drum': 0.10,
  'hi-hat':     0.06,
  '808 bass':   0.14,
  'chimes':     0.60,
  'synth pad':  0.60,
  'horn/bass':  0.35,
  'synth lead': 0.25,
  'vocal pad':  0.50,
};

// ── Singletons ─────────────────────────────────────────────────────────────────

let ctx: AudioContext | null = null;
let masterComp:   DynamicsCompressorNode | null = null;
let reverbNode:   ConvolverNode          | null = null;
let reverbReturn: GainNode               | null = null;

// Per-drawing gain nodes persist between chord calls so the slider can ramp
// their gain smoothly without re-creating the node on every tick.
const drawingGains  = new Map<string, GainNode>();
// Mirror of the last normalized volume set for each drawing (0–1).
// Used by setViewportGain to compute effective gain = volume × viewportGain.
const drawingVolumes = new Map<string, number>();
// Viewport gain per drawing: 1 = fully audible, 0 = silenced by viewport mode.
const viewportGains  = new Map<string, number>();

// Tracks the previous frequency played by the lead synth for portamento.
let lastLeadFreq = 0;

// ── Reverb IR ─────────────────────────────────────────────────────────────────
// Stereo white-noise burst with exponential decay — no audio files required.
// RT60 of 1.5 s gives a warm medium-room tail.

function buildImpulseResponse(ac: AudioContext): AudioBuffer {
  const sr  = ac.sampleRate;
  const len = Math.ceil(sr * 2.0);
  const buf = ac.createBuffer(2, len, sr);
  const c   = (3 * Math.LN10) / 1.5; // decay to -60 dB in 1.5 s

  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-c * i / sr);
    }
  }
  return buf;
}

// ── Master graph ───────────────────────────────────────────────────────────────
// Built once per AudioContext. All instruments connect to masterComp.
// Reverb return also feeds masterComp so the wet signal is compressed too.

function ensureGraph(): void {
  if (!ctx || masterComp) return;

  masterComp = ctx.createDynamicsCompressor();
  masterComp.threshold.value = -24;   // catch melodic peaks without squashing drums
  masterComp.knee.value      =   8;
  masterComp.ratio.value     =   4;
  masterComp.attack.value    = 0.005; // 5 ms — fast enough to catch transients
  masterComp.release.value   = 0.10;  // 100 ms — snappy release keeps drums punchy
  masterComp.connect(ctx.destination);

  reverbNode = ctx.createConvolver();
  reverbNode.buffer = buildImpulseResponse(ctx);

  reverbReturn = ctx.createGain();
  reverbReturn.gain.value = 1.0;
  reverbNode.connect(reverbReturn);
  reverbReturn.connect(masterComp);
}

// ── AudioContext singleton ─────────────────────────────────────────────────────

export function unlockAudio(): void {
  if (!ctx || ctx.state === 'closed') {
    ctx = new AudioContext();
    masterComp = reverbNode = reverbReturn = null; // rebuild graph for new context
    drawingGains.clear();
    drawingVolumes.clear();
    viewportGains.clear();
    lastLeadFreq = 0;
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  ensureGraph();
}

function getOrCreateDrawingGain(id: string, initialGain: number): GainNode {
  let g = drawingGains.get(id);
  if (!g) {
    const vpGain    = viewportGains.get(id) ?? 1;
    const effective = Math.max(0, Math.min(1, initialGain * vpGain));
    g = ctx!.createGain();
    g.gain.value = effective;
    g.connect(masterComp!);
    drawingGains.set(id, g);
    drawingVolumes.set(id, initialGain);
  }
  return g;
}

export function setDrawingVolume(id: string, normalizedVolume: number): void {
  if (!ctx || !masterComp) return;
  drawingVolumes.set(id, normalizedVolume);
  const vpGain = viewportGains.get(id) ?? 1;
  const g = getOrCreateDrawingGain(id, normalizedVolume);
  g.gain.setTargetAtTime(
    Math.max(0, Math.min(1, normalizedVolume * vpGain)),
    ctx.currentTime, 0.01,
  );
}

// Fade a drawing's gain to `gain` (0 = silent, 1 = full) over ~100 ms.
// Does not touch isMuted — mute state is preserved independently.
export function setViewportGain(id: string, gain: number): void {
  const prev = viewportGains.get(id) ?? 1;
  if (Math.abs(gain - prev) < 0.001) return;
  viewportGains.set(id, gain);
  if (!ctx || !masterComp) return;
  const vol = drawingVolumes.get(id) ?? 0.7;
  const g = getOrCreateDrawingGain(id, vol);
  // timeConstant 0.033 s → ~95% of target in 100 ms.
  g.gain.setTargetAtTime(Math.max(0, Math.min(1, vol * gain)), ctx.currentTime, 0.033);
}

// Restore all viewport-silenced gains to their individual volume levels.
// Called when viewport mode is turned off.
export function resetViewportGains(): void {
  if (!ctx || !masterComp) { viewportGains.clear(); return; }
  for (const [id] of viewportGains) {
    const vol = drawingVolumes.get(id) ?? 0.7;
    const g   = drawingGains.get(id);
    if (g) g.gain.setTargetAtTime(Math.max(0, Math.min(1, vol)), ctx.currentTime, 0.033);
  }
  viewportGains.clear();
}

export function removeDrawingGain(id: string): void {
  const g = drawingGains.get(id);
  if (g) { try { g.disconnect(); } catch { /* already gone */ } drawingGains.delete(id); }
  drawingVolumes.delete(id);
  viewportGains.delete(id);
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeNoiseBuffer(ac: AudioContext, durationSec: number): AudioBuffer {
  const len  = Math.ceil(ac.sampleRate * durationSec);
  const buf  = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

function later(delaySec: number, ...nodes: AudioNode[]): void {
  setTimeout(() => {
    for (const n of nodes) { try { n.disconnect(); } catch { /* already gone */ } }
  }, delaySec * 1000);
}

// Insert an 80 Hz high-pass filter between a melodic synth and its destination.
// Keeps melodic instruments out of the low end where kick and 808 bass live.
function addHpf(ac: AudioContext, dest: AudioNode): BiquadFilterNode {
  const f = ac.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.value = HPF_CUTOFF_HZ;
  f.Q.value = 0.5; // gentle slope, no resonance bump
  f.connect(dest);
  return f;
}

// Route a fraction of `signal` into the global reverb convolver.
function sendToReverb(signal: AudioNode, wetAmount: number): GainNode {
  const send = ctx!.createGain();
  send.gain.value = wetAmount;
  signal.connect(send);
  send.connect(reverbNode!);
  return send; // caller must pass to later() for cleanup
}

// Soft-clipping waveshaper (tanh-like). amount 1–100; higher = more saturation.
function softClipCurve(amount: number): Float32Array<ArrayBuffer> {
  const n    = 512;
  const curve = new Float32Array(n) as Float32Array<ArrayBuffer>;
  const k    = amount;
  for (let i = 0; i < n; i++) {
    const x    = (i * 2) / (n - 1) - 1;
    curve[i] = (1 + k / Math.PI) * x / (1 + (k / Math.PI) * Math.abs(x));
  }
  return curve;
}

// ── 808 Bass ───────────────────────────────────────────────────────────────────
// Three sine harmonics (1×, 2×, 3×) through a steep 120 Hz low-pass, keeping
// the sound firmly in the sub-bass band. Fixed pitch — no frequency sweep.
// Punch envelope: 10 ms attack → 800 ms slow decay. WaveShaperNode adds grit.

const HARMONICS_808 = [
  { mult: 1, gain: 1.00 },
  { mult: 2, gain: 0.30 },
  { mult: 3, gain: 0.12 },
] as const;

const BASS_808_ATTACK  = 0.010; // 10 ms punch attack
const BASS_808_DECAY   = 0.800; // 800 ms slow decay

function synth808(ac: AudioContext, dest: AudioNode, freqs: number[], _duration: number, peak: number): void {
  const now      = ac.currentTime;
  const n        = freqs.length;
  const normGain = 1 / HARMONICS_808.reduce((s, h) => s + h.gain, 0);
  // +15% to compensate for energy lost by removing the pitch-drop sweep.
  const peakAdj  = peak * 1.15;
  const envEnd   = now + BASS_808_ATTACK + BASS_808_DECAY;

  for (const freq of freqs) {
    // Clamp to sub-bass range regardless of what soundMapping computed.
    const bassFreq = Math.min(freq, BASS_808_MAX_HZ);

    // Steep low-pass at 120 Hz rolls off all high-frequency content.
    const lpf = ac.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.value = 120;
    lpf.Q.value = 0.8;

    const shaper = ac.createWaveShaper();
    shaper.curve      = softClipCurve(50);
    shaper.oversample = '4x';
    lpf.connect(shaper);

    // Punch envelope — fixed pitch, no frequency sweep.
    const env = ac.createGain();
    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(peakAdj / n, now + BASS_808_ATTACK);
    env.gain.exponentialRampToValueAtTime(0.001, envEnd);
    shaper.connect(env);
    env.connect(dest);
    const send = sendToReverb(env, WET['808 bass']);

    const sumGain = ac.createGain();
    sumGain.gain.value = normGain;
    sumGain.connect(lpf);

    for (const { mult, gain: hGain } of HARMONICS_808) {
      const hg = ac.createGain();
      hg.gain.value = hGain;

      const osc = ac.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = bassFreq * mult; // fixed — no pitch envelope
      osc.connect(hg);
      hg.connect(sumGain);
      osc.start(now);
      osc.stop(envEnd + 0.05);
      later(envEnd + 0.15, hg);
    }

    later(envEnd + 0.15, sumGain, lpf, shaper, env, send);
  }
}

// ── Kick Drum ──────────────────────────────────────────────────────────────────
// Fixed 150→40 Hz sine sweep + noise click. Local hard-limiter tames the
// transient spike; signal then continues into the master compressor.

function synthKick(ac: AudioContext, dest: AudioNode, _freqs: number[], _duration: number, peak: number): void {
  const now    = ac.currentTime;
  const hitDur = 0.50;

  const limiter = ac.createDynamicsCompressor();
  limiter.threshold.value = -3;
  limiter.knee.value      =  0;
  limiter.ratio.value     = 20;
  limiter.attack.value    = 0.001;
  limiter.release.value   = 0.08;
  limiter.connect(dest);
  const send = sendToReverb(limiter, WET['kick drum']);

  const sineEnv = ac.createGain();
  sineEnv.gain.setValueAtTime(peak, now);
  sineEnv.gain.exponentialRampToValueAtTime(0.001, now + hitDur * 0.85);
  sineEnv.connect(limiter);

  const osc = ac.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(150, now);
  osc.frequency.exponentialRampToValueAtTime(40, now + 0.08);
  osc.connect(sineEnv);
  osc.start(now);
  osc.stop(now + hitDur);

  const clickDur = 0.012;
  const click    = ac.createBufferSource();
  click.buffer   = makeNoiseBuffer(ac, clickDur);
  const clickEnv = ac.createGain();
  clickEnv.gain.setValueAtTime(peak * 0.5, now);
  clickEnv.gain.exponentialRampToValueAtTime(0.001, now + clickDur);
  clickEnv.connect(limiter);
  click.connect(clickEnv);
  click.start(now);

  later(hitDur + 0.15, sineEnv, clickEnv, limiter, send);
}

// ── Snare Drum ─────────────────────────────────────────────────────────────────
// Bandpass noise 2000 Hz, 2 ms attack / 120 ms decay.

function synthSnare(ac: AudioContext, dest: AudioNode, _freqs: number[], _duration: number, peak: number): void {
  const now    = ac.currentTime;
  const hitDur = 0.122;

  const noise = ac.createBufferSource();
  noise.buffer = makeNoiseBuffer(ac, hitDur + 0.01);

  const bpf = ac.createBiquadFilter();
  bpf.type = 'bandpass';
  bpf.frequency.value = 2000;
  bpf.Q.value = 1.33;

  const env = ac.createGain();
  env.gain.setValueAtTime(0, now);
  env.gain.linearRampToValueAtTime(peak * 2.2, now + 0.002);
  env.gain.exponentialRampToValueAtTime(0.001, now + hitDur);

  noise.connect(bpf);
  bpf.connect(env);
  env.connect(dest);
  const send = sendToReverb(env, WET['snare drum']);
  noise.start(now);

  later(hitDur + 0.1, bpf, env, send);
}

// ── Hi-Hat ─────────────────────────────────────────────────────────────────────
// High-passed noise. Duration: 0.04 s (closed) or 0.20 s (open).

function synthHiHat(ac: AudioContext, dest: AudioNode, _freqs: number[], duration: number, peak: number): void {
  const now    = ac.currentTime;
  const hitDur = duration;

  const noise = ac.createBufferSource();
  noise.buffer = makeNoiseBuffer(ac, hitDur + 0.01);

  const hpf = ac.createBiquadFilter();
  hpf.type = 'highpass';
  hpf.frequency.value = 8000;

  const env = ac.createGain();
  env.gain.setValueAtTime(peak, now);
  env.gain.exponentialRampToValueAtTime(0.001, now + hitDur);

  noise.connect(hpf);
  hpf.connect(env);
  env.connect(dest);
  const send = sendToReverb(env, WET['hi-hat']);
  noise.start(now);

  later(hitDur + 0.05, hpf, env, send);
}

// ── Chimes ─────────────────────────────────────────────────────────────────────
// Four inharmonic sine partials at bell-like frequency ratios.
// Higher partials decay faster, matching acoustic bell behaviour.
// Global reverb replaces the old manual tap-delay bank.

const BELL_PARTIALS = [
  { mult: 1.000, gain: 1.00, decay: 1.00 },
  { mult: 2.756, gain: 0.55, decay: 0.65 },
  { mult: 5.404, gain: 0.28, decay: 0.42 },
  { mult: 8.933, gain: 0.12, decay: 0.28 },
] as const;

function synthChimes(ac: AudioContext, dest: AudioNode, freqs: number[], duration: number, peak: number): void {
  const now    = ac.currentTime;
  const hpDest = addHpf(ac, dest);

  for (const freq of freqs) {
    const n       = freqs.length;
    const velMult = 0.85 + Math.random() * 0.30; // ±15% velocity randomization

    for (const { mult, gain: hGain, decay } of BELL_PARTIALS) {
      const partialDur = duration * decay;

      const env = ac.createGain();
      env.gain.setValueAtTime(0, now);
      env.gain.linearRampToValueAtTime((peak / n) * hGain * velMult, now + 0.012);
      env.gain.exponentialRampToValueAtTime(0.001, now + partialDur);
      env.connect(hpDest);
      const send = sendToReverb(env, WET['chimes']);

      const osc = ac.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq * mult;
      osc.connect(env);
      osc.start(now);
      osc.stop(now + partialDur + 0.05);

      later(partialDur + 0.1, env, send);
    }
  }
  later(duration + 0.15, hpDest);
}

// ── Synth Pad ──────────────────────────────────────────────────────────────────
// Two slightly detuned sawtooths per voice (±7 cents) for a lush chorus width.
// Low-pass filter sweeps open over the attack — pads bloom into the mix.

const PAD_DETUNE = [-7, 7] as const;

function synthPad(ac: AudioContext, dest: AudioNode, freqs: number[], duration: number, peak: number): void {
  const now        = ac.currentTime;
  const attackTime = 0.28;
  const releaseAt  = Math.max(now + attackTime + 0.1, now + duration - 0.42);
  const hpDest     = addHpf(ac, dest);

  const lpf = ac.createBiquadFilter();
  lpf.type = 'lowpass';
  lpf.frequency.setValueAtTime(300, now);
  lpf.frequency.exponentialRampToValueAtTime(2500, now + attackTime);
  lpf.Q.value = 0.5;
  lpf.connect(hpDest);
  const send = sendToReverb(lpf, WET['synth pad']);

  const perVoice = peak / (freqs.length * PAD_DETUNE.length);

  for (const freq of freqs) {
    for (const cents of PAD_DETUNE) {
      const vg = ac.createGain();
      vg.gain.setValueAtTime(0, now);
      vg.gain.linearRampToValueAtTime(perVoice, now + attackTime);
      vg.gain.setValueAtTime(perVoice, releaseAt);
      vg.gain.exponentialRampToValueAtTime(0.001, now + duration);
      vg.connect(lpf);

      const osc = ac.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = freq * Math.pow(2, cents / 1200);
      osc.connect(vg);
      osc.start(now);
      osc.stop(now + duration + 0.1);
      later(duration + 0.3, vg);
    }
  }

  later(duration + 0.3, lpf, send, hpDest);
}

// ── Horns / Brass ──────────────────────────────────────────────────────────────
// Additive synthesis using odd harmonics only (1, 3, 5, 7) — the harmonic
// series of a closed cylinder. WaveShaperNode adds the characteristic brass rasp.
// ±3 Hz LFO breath modulates the fundamental only.

const BRASS_HARMONICS = [
  { mult: 1, gain: 1.00 },
  { mult: 3, gain: 0.65 },
  { mult: 5, gain: 0.35 },
  { mult: 7, gain: 0.15 },
] as const;

function synthHorns(ac: AudioContext, dest: AudioNode, freqs: number[], duration: number, peak: number): void {
  const now        = ac.currentTime;
  const attackTime = 0.08;
  const decayAt    = now + duration * 0.35;
  const normGain   = 1 / BRASS_HARMONICS.reduce((s, h) => s + h.gain, 0);
  const hpDest     = addHpf(ac, dest);

  const shaper = ac.createWaveShaper();
  shaper.curve      = softClipCurve(25);
  shaper.oversample = '2x';
  shaper.connect(hpDest);
  const send = sendToReverb(shaper, WET['horn/bass']);

  const lpf = ac.createBiquadFilter();
  lpf.type = 'lowpass';
  lpf.frequency.value = 3200;
  lpf.Q.value = 0.7;
  lpf.connect(shaper);

  for (const freq of freqs) {
    const env = ac.createGain();
    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(peak / freqs.length, now + attackTime);
    env.gain.exponentialRampToValueAtTime(0.001, decayAt);
    env.connect(lpf);

    const sumGain = ac.createGain();
    sumGain.gain.value = normGain;
    sumGain.connect(env);

    // Breath vibrato on the fundamental only — slightly loosens the pitch
    // of higher harmonics relative to the fundamental for realism.
    const lfo = ac.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 4.5;
    const lfoGain = ac.createGain();
    lfoGain.gain.value = 3; // ±3 Hz
    lfo.connect(lfoGain);
    lfo.start(now);
    lfo.stop(now + duration + 0.1);

    for (const { mult, gain: hGain } of BRASS_HARMONICS) {
      const hg = ac.createGain();
      hg.gain.value = hGain;
      hg.connect(sumGain);

      const osc = ac.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq * mult;
      if (mult === 1) lfoGain.connect(osc.frequency);
      osc.connect(hg);
      osc.start(now);
      osc.stop(now + duration + 0.1);
      later(duration + 0.3, hg);
    }

    later(duration + 0.3, env, sumGain, lfoGain);
  }

  later(duration + 0.3, lpf, shaper, send, hpDest);
}

// ── Synth Lead ─────────────────────────────────────────────────────────────────
// Four additive sine harmonics approximate a bright sawtooth with controlled
// harmonic content. 5 ms portamento glide between notes. 1/8-note feedback delay
// at current BPM. Vibrato LFO shared across all harmonics via detune (cents).

const LEAD_HARMONICS = [
  { mult: 1, gain: 1.00 },
  { mult: 2, gain: 0.50 },
  { mult: 3, gain: 0.25 },
  { mult: 4, gain: 0.12 },
] as const;

function synthLead(ac: AudioContext, dest: AudioNode, freqs: number[], duration: number, peak: number): void {
  const now        = ac.currentTime;
  const attackEnd  = now + 0.013;
  const releaseAt  = now + duration * 0.60;
  const normGain   = 1 / LEAD_HARMONICS.reduce((s, h) => s + h.gain, 0);
  const hpDest     = addHpf(ac, dest);

  // 1/8-note delay tempo-synced to the current BPM.
  const bpm           = useTempoStore.getState().bpm;
  const eighthNoteSec = 30 / bpm; // 60 / (bpm * 2)

  const delayNode    = ac.createDelay(2.0);
  delayNode.delayTime.value = eighthNoteSec;
  const feedbackGain = ac.createGain();
  feedbackGain.gain.value = 0.30;
  const delayWet     = ac.createGain();
  delayWet.gain.value = 0.28;

  delayNode.connect(feedbackGain);
  feedbackGain.connect(delayNode); // feedback loop
  delayNode.connect(delayWet);
  delayWet.connect(hpDest);
  const delaySend = sendToReverb(delayWet, WET['synth lead']);

  // Capture portamento start before the loop mutates lastLeadFreq.
  const portaStart = lastLeadFreq > 0 ? lastLeadFreq : (freqs[0] ?? 0);

  for (const freq of freqs) {
    const env = ac.createGain();
    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(peak / freqs.length, attackEnd);
    env.gain.setValueAtTime(peak / freqs.length, releaseAt);
    env.gain.linearRampToValueAtTime(0, now + duration);
    env.connect(hpDest);
    env.connect(delayNode);

    const sumGain = ac.createGain();
    sumGain.gain.value = normGain;
    sumGain.connect(env);

    // One vibrato LFO per chord note, modulating all harmonics via detune (cents)
    // so vibrato depth is frequency-relative.
    const lfo = ac.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 5.5;
    const lfoGain = ac.createGain();
    lfoGain.gain.value = 12; // ±12 cents (~0.7% pitch deviation)
    lfo.connect(lfoGain);
    lfo.start(now);
    lfo.stop(now + duration + 0.06);

    for (const { mult, gain: hGain } of LEAD_HARMONICS) {
      const hg = ac.createGain();
      hg.gain.value = hGain;
      hg.connect(sumGain);

      const osc = ac.createOscillator();
      osc.type = 'sine';
      // Portamento: glide from previous pitch to current in 5 ms.
      osc.frequency.setValueAtTime(portaStart * mult, now);
      osc.frequency.linearRampToValueAtTime(freq * mult, now + 0.005);
      lfoGain.connect(osc.detune); // cents-based vibrato, same depth on all harmonics
      osc.connect(hg);
      osc.start(now);
      osc.stop(now + duration + 0.06);
      later(duration + 0.15, hg);
    }

    later(duration + 0.15, env, sumGain, lfoGain);
  }

  if (freqs.length > 0) lastLeadFreq = freqs[0];

  // Delay tail: give enough time for 8 feedback bounces to decay.
  const tailSec = Math.min(eighthNoteSec * 8, 4.0);
  later(duration + tailSec + 0.5, delayNode, feedbackGain, delayWet, delaySend, hpDest);
}

// ── Vocal Pad ──────────────────────────────────────────────────────────────────
// Sawtooth source (inherently harmonic-rich) through two parallel band-pass
// filters approximating the formant structure of a vowel around 800–1200 Hz.
// Slowest attack (600 ms), long 800 ms release — sits beneath the mix.

const VOCAL_FORMANTS = [
  { freq: 800,  Q: 10 },
  { freq: 1200, Q: 15 },
] as const;

function synthVocal(ac: AudioContext, dest: AudioNode, freqs: number[], duration: number, peak: number): void {
  const now       = ac.currentTime;
  const attackEnd = now + 0.42;
  const releaseAt = Math.max(attackEnd + 0.1, now + duration - 0.56);
  const hpDest    = addHpf(ac, dest);

  for (const baseFreq of freqs) {
    const osc = ac.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = baseFreq;

    const preGain = ac.createGain();
    preGain.gain.value = peak / freqs.length;
    osc.connect(preGain);

    // Two parallel formant band-pass filters; their outputs are mixed equally.
    const fmix = ac.createGain();
    fmix.gain.value = 1 / VOCAL_FORMANTS.length;

    for (const f of VOCAL_FORMANTS) {
      const bpf = ac.createBiquadFilter();
      bpf.type = 'bandpass';
      bpf.frequency.value = f.freq;
      bpf.Q.value = f.Q;
      preGain.connect(bpf);
      bpf.connect(fmix);
    }

    const env = ac.createGain();
    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(1, attackEnd);
    env.gain.setValueAtTime(0.84, releaseAt);
    env.gain.linearRampToValueAtTime(0, now + duration);
    fmix.connect(env);
    env.connect(hpDest);
    const send = sendToReverb(env, WET['vocal pad']);

    osc.start(now);
    osc.stop(now + duration + 0.1);
    later(duration + 0.3, preGain, fmix, env, send);
  }
  later(duration + 0.4, hpDest);
}

// ── Dispatch table ─────────────────────────────────────────────────────────────

const SYNTHS: Record<InstrumentName, SynthFn> = {
  '808 bass':   synth808,
  'kick drum':  synthKick,
  'snare drum': synthSnare,
  'hi-hat':     synthHiHat,
  'chimes':     synthChimes,
  'synth pad':  synthPad,
  'horn/bass':  synthHorns,
  'synth lead': synthLead,
  'vocal pad':  synthVocal,
};

// ── Public API ─────────────────────────────────────────────────────────────────

export async function playChord(
  frequencies:  number[],
  duration:     number         = 2.5,
  instrument:   InstrumentName = 'synth pad',
  volume:       number         = 1.0,
  drawingId?:   string,
  drawingGain:  number         = 1.0,
): Promise<void> {
  if (!ctx || frequencies.length === 0) return;

  if (ctx.state !== 'running') {
    try { await ctx.resume(); } catch { return; }
    // Re-read state after async resume; TypeScript's narrowing doesn't track mutations.
    if ((ctx.state as string) !== 'running') return;
  }

  if (!masterComp) ensureGraph();
  if (!masterComp) return;

  const dest = drawingId
    ? getOrCreateDrawingGain(drawingId, drawingGain)
    : masterComp;

  const peak = AMPLITUDE * Math.max(0, Math.min(1, volume)) * INSTRUMENT_GAIN[instrument];
  SYNTHS[instrument](ctx, dest, frequencies, duration, peak);
}
