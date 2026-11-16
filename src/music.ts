const sampleRate = 22050;
const secondsPerBeat = 60 / 88;
const beatsPerBar = 4;

// Every bar has a bass note and a close voicing. The lead alternates short motifs with rests.
const chords = [
  [48, 60, 64, 67, 71], [47, 59, 64, 67, 71], [45, 57, 60, 64, 67], [41, 57, 60, 64, 65],
  [48, 60, 64, 67, 71], [50, 57, 60, 62, 65], [43, 55, 59, 62, 67], [48, 60, 64, 67, 74],
  [41, 57, 60, 64, 65], [52, 60, 64, 67, 71], [45, 57, 60, 64, 67], [40, 55, 59, 62, 64],
  [41, 57, 60, 64, 65], [50, 57, 60, 62, 65], [43, 55, 59, 62, 65], [48, 60, 64, 67, 74],
];
const melody = [
  [[0, 76, .64], [1, 79, .55], [1.75, 81, .45], [2.5, 79, 1]],
  [[0, 76, .8], [1.5, 74, .55], [2.5, 71, 1]],
  [[.5, 72, .56], [1.25, 76, .55], [2, 79, .75], [3, 76, .56]],
  [[0, 74, .56], [1, 72, 1.3]],
  [[0, 76, .56], [1, 79, .56], [1.75, 84, 1], [3, 83, .58]],
  [[0, 81, .8], [1.5, 77, .56], [2.5, 76, .87]],
  [[.5, 74, .55], [1.25, 76, .56], [2, 79, .62], [3, 74, .56]],
  [[0, 72, 1.5], [2.5, 67, .8]],
  [[0, 77, .7], [1.25, 81, .55], [2, 84, 1], [3.25, 81, .57]],
  [[0, 79, .65], [1.25, 76, 1], [2.75, 74, .85]],
  [[.5, 72, .55], [1.25, 76, .56], [2, 81, .75], [3, 79, .56]],
  [[0, 76, 1], [1.75, 74, .55], [2.5, 71, .8]],
  [[0, 72, .55], [1, 76, .55], [1.75, 77, .65], [2.75, 81, .8]],
  [[0, 77, 1.1], [1.75, 76, .55], [2.5, 74, .8]],
  [[.5, 71, .55], [1.25, 74, .55], [2, 77, .65], [3, 74, .55]],
  [[0, 72, 2.15], [2.75, 76, .85]],
];

/** Original instrumental loop, synthesized once and reused for gapless playback. */
function renderMusic(context: AudioContext): AudioBuffer {
  const frames = Math.round(chords.length * beatsPerBar * secondsPerBeat * sampleRate);
  const buffer = context.createBuffer(1, frames, sampleRate);
  const samples = buffer.getChannelData(0);
  function note(pitch: number, beat: number, length: number, volume: number, brightness: number) {
    const start = Math.round(beat * secondsPerBeat * sampleRate);
    const duration = Math.round(length * secondsPerBeat * sampleRate);
    const angle = Math.PI * 2 * 440 * Math.pow(2, (pitch - 69) / 12) / sampleRate;
    for (let i = 0; i < duration && start + i < frames; i++) {
      const t = i / duration;
      const envelope = Math.min(1, i / 200) * (1 - t) * (1 - t);
      const phase = i * angle;
      const tone = Math.sin(phase) + brightness * (.66 * Math.sin(2 * phase) + .34 * Math.sin(3 * phase));
      samples[start + i] += tone * envelope * volume;
    }
  }
  chords.forEach(([bass, ...harmony], bar) => {
    const beat = bar * beatsPerBar;
    note(bass, beat, 1.8, .17, .13);
    note(bass + (bar % 4 === 3 ? 12 : 7), beat + 2.15, 1.35, .11, .16);
    for (const [index, pitch] of harmony.entries()) {
      note(pitch, beat + .47 + index * .22, 1.58, .085, .16);
      note(pitch, beat + 2.57 + index * .12, 1.05, .067, .16);
    }
    for (const [time, pitch, length] of melody[bar]) {
      note(pitch, beat + time, length, .16, .25);
      note(pitch, beat + time + .29, length * .68, .037, .12);
    }
  });
  return buffer;
}

export class GameMusic {
  private buffer?: AudioBuffer;
  private track?: {context: AudioContext; source: AudioBufferSourceNode; gain: GainNode; startedAt: number};
  private position = 0;
  private volume = .35;

  setVolume(volume: number) {
    this.volume = volume;
    const track = this.track;
    if (track) track.gain.gain.setTargetAtTime(volume * .48, track.context.currentTime, .04);
  }

  play(context: AudioContext): boolean {
    if (this.track?.context === context) return true;
    this.pause();
    try {
      this.buffer ??= renderMusic(context);
      const gain = context.createGain();
      const source = context.createBufferSource();
      const startedAt = context.currentTime;
      source.buffer = this.buffer;
      source.loop = true;
      source.onended = () => { source.disconnect(); gain.disconnect(); };
      gain.gain.value = 0;
      gain.gain.setTargetAtTime(this.volume * .48, startedAt, .05);
      source.connect(gain);
      gain.connect(context.destination);
      source.start(startedAt, this.position);
      this.track = {context, source, gain, startedAt};
      return true;
    } catch { return false; }
  }

  pause() {
    const track = this.track;
    if (!track || !this.buffer) return;
    this.track = undefined;
    const now = track.context.currentTime;
    this.position = (this.position + Math.max(0, now - track.startedAt)) % this.buffer.duration;
    try {
      track.gain.gain.setTargetAtTime(0, now, .013);
      track.source.stop(now + .06);
    } catch { track.source.disconnect(); track.gain.disconnect(); }
  }
}
