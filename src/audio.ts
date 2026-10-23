// Sound effects, synthesized with the Web Audio API (no audio files needed).
// Browsers only allow sound after the player interacts, so unlockAudio() is called on the first click or key.

import { persist, save } from "./save";

let ac: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;

export function unlockAudio(): void {
  if (!ac) {
    try {
      ac = new AudioContext();
    } catch {
      return; // no Web Audio support: play silently
    }
    master = ac.createGain();
    master.gain.value = 0.5;
    master.connect(ac.destination);
    noiseBuffer = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  if (ac.state === "suspended") void ac.resume();
}

export function toggleMute(): void {
  save.muted = !save.muted;
  persist();
}

function ready(): AudioContext | null {
  return ac && master && !save.muted ? ac : null;
}

// A single note with a quick attack and exponential decay; optionally slides to another pitch.
function tone(freq: number, dur: number, type: OscillatorType = "sine", vol = 0.2, delay = 0, slideTo?: number): void {
  const a = ready();
  if (!a || !master) return;
  const t = a.currentTime + delay;
  const osc = a.createOscillator();
  const gain = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(vol, t + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

// Filtered white noise, for impacts, hisses and whooshes. Returns a function that stops it early.
function noise(dur: number, vol: number, filter: BiquadFilterType, freq: number, delay = 0, freqTo?: number, loop = false): () => void {
  const a = ready();
  if (!a || !master || !noiseBuffer) return () => {};
  const t = a.currentTime + delay;
  const src = a.createBufferSource();
  src.buffer = noiseBuffer;
  src.loop = loop;
  const f = a.createBiquadFilter();
  f.type = filter;
  f.frequency.setValueAtTime(freq, t);
  if (freqTo) f.frequency.exponentialRampToValueAtTime(freqTo, t + dur);
  const gain = a.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.05, dur / 4));
  if (!loop) gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(gain).connect(master);
  src.start(t);
  if (!loop) src.stop(t + dur + 0.02);
  return () => {
    gain.gain.setTargetAtTime(0.0001, a.currentTime, 0.03);
    src.stop(a.currentTime + 0.15);
  };
}

const arpeggio = (notes: number[], step: number, type: OscillatorType, vol: number, dur = 0.3) =>
  notes.forEach((f, i) => tone(f, dur, type, vol, i * step));

export const sfx = {
  // Hammer on hot metal: a bright metallic ring
  hit() {
    const base = 1100 + Math.random() * 200;
    tone(base, 0.45, "triangle", 0.22);
    tone(base * 2.4, 0.3, "sine", 0.1);
    tone(base * 3.6, 0.15, "sine", 0.05);
    noise(0.05, 0.25, "highpass", 2500);
  },
  // Missing the golden zone: a dull thud
  miss() {
    tone(150, 0.14, "sine", 0.3, 0, 70);
    noise(0.07, 0.12, "lowpass", 500);
  },
  cold() { tone(300, 0.15, "square", 0.06, 0, 180); },
  reheat() { noise(0.7, 0.18, "bandpass", 400, 0, 1600); },
  coin() {
    tone(1320, 0.08, "square", 0.06);
    tone(1760, 0.2, "square", 0.06, 0.07);
  },
  legendary() { arpeggio([523, 659, 784, 1047, 1319], 0.08, "triangle", 0.16, 0.4); },
  quench() { noise(1.3, 0.28, "highpass", 4000, 0, 700); },
  // Grinding on the whetstone while held; call the returned function to stop
  grind(): () => void { return noise(10, 0.12, "bandpass", 2200, 0, undefined, true); },
  done() { arpeggio([660, 880], 0.08, "triangle", 0.12); },
  levelUp() { arpeggio([392, 523, 659, 784, 1047], 0.07, "square", 0.08, 0.25); },
  click() { tone(900, 0.04, "square", 0.04); },
  error() { tone(200, 0.18, "sawtooth", 0.06, 0, 140); },
  // Mining
  pick() {
    tone(260 + Math.random() * 60, 0.12, "triangle", 0.12, 0, 140);
    noise(0.08, 0.2, "lowpass", 1200);
  },
  rockBreak() {
    noise(0.35, 0.3, "lowpass", 900, 0, 200);
    tone(120, 0.25, "sine", 0.15, 0, 60);
  },
  // Dungeon fights
  slash() {
    noise(0.1, 0.22, "bandpass", 1800, 0, 600);
    tone(500, 0.08, "sawtooth", 0.04, 0, 250);
  },
  hurt() { tone(240, 0.16, "square", 0.07, 0, 110); },
  monsterDown() { tone(300, 0.35, "sawtooth", 0.07, 0, 60); },
  victory() { arpeggio([392, 523, 659, 784], 0.12, "triangle", 0.15, 0.4); },
  defeat() { arpeggio([392, 330, 262, 196], 0.18, "triangle", 0.15, 0.5); },
};
