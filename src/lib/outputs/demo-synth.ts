export class DemoSynth {
  private ctx: AudioContext | null = null;
  private osc1: OscillatorNode | null = null;
  private osc2: OscillatorNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private gain: GainNode | null = null;
  private reverbGain: GainNode | null = null;
  private dryGain: GainNode | null = null;
  private masterGain: GainNode | null = null;
  private _active = false;

  get active(): boolean {
    return this._active;
  }

  async init(): Promise<void> {
    const Ctor: typeof AudioContext =
      (window as any).AudioContext || (window as any).webkitAudioContext;
    this.ctx = new Ctor();
    if (this.ctx.state === 'suspended') {
      try { await this.ctx.resume(); } catch { /* will retry on first start() */ }
    }

    this.osc1 = this.ctx.createOscillator();
    this.osc1.type = 'sawtooth';
    this.osc1.frequency.value = 220;

    this.osc2 = this.ctx.createOscillator();
    this.osc2.type = 'square';
    this.osc2.frequency.value = 221;

    this.filter = this.ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 2000;
    this.filter.Q.value = 5;

    this.gain = this.ctx.createGain();
    this.gain.gain.value = 0.3;

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0;

    this.dryGain = this.ctx.createGain();
    this.dryGain.gain.value = 0.7;

    this.reverbGain = this.ctx.createGain();
    this.reverbGain.gain.value = 0.3;

    const delay = this.ctx.createDelay();
    delay.delayTime.value = 0.05;
    const feedback = this.ctx.createGain();
    feedback.gain.value = 0.6;

    this.osc1.connect(this.filter);
    this.osc2.connect(this.filter);
    this.filter.connect(this.gain);
    this.gain.connect(this.dryGain);
    this.gain.connect(delay);
    delay.connect(feedback);
    feedback.connect(delay);
    delay.connect(this.reverbGain);
    this.dryGain.connect(this.masterGain);
    this.reverbGain.connect(this.masterGain);
    this.masterGain.connect(this.ctx.destination);

    this.osc1.start();
    this.osc2.start();
  }

  start(): void {
    if (!this.masterGain || !this.ctx) return;
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(err => console.warn('[demo-synth] resume failed', err));
    }
    this.masterGain.gain.setTargetAtTime(1, this.ctx.currentTime, 0.1);
    this._active = true;
  }

  stop(): void {
    if (!this.masterGain || !this.ctx) return;
    this.masterGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3);
    this._active = false;
  }

  setFilterCutoff(value: number): void {
    if (!this.filter || !this.ctx) return;
    const freq = 100 * Math.pow(80, value);
    this.filter.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.02);
  }

  setFilterResonance(value: number): void {
    if (!this.filter || !this.ctx) return;
    this.filter.Q.setTargetAtTime(value * 20, this.ctx.currentTime, 0.02);
  }

  setOscPitch(value: number): void {
    if (!this.osc1 || !this.osc2 || !this.ctx) return;
    const freq = 55 * Math.pow(16, value);
    this.osc1.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.02);
    this.osc2.frequency.setTargetAtTime(freq * 1.005, this.ctx.currentTime, 0.02);
  }

  setOscDetune(value: number): void {
    if (!this.osc2 || !this.ctx) return;
    this.osc2.detune.setTargetAtTime(value * 50, this.ctx.currentTime, 0.02);
  }

  setReverbMix(value: number): void {
    if (!this.dryGain || !this.reverbGain || !this.ctx) return;
    this.dryGain.gain.setTargetAtTime(1 - value, this.ctx.currentTime, 0.05);
    this.reverbGain.gain.setTargetAtTime(value, this.ctx.currentTime, 0.05);
  }

  setWaveform(type: OscillatorType): void {
    if (this.osc1) this.osc1.type = type;
    if (this.osc2) this.osc2.type = type;
  }

  triggerDrum(): void {
    if (!this.ctx) return;
    const bufferSize = this.ctx.sampleRate * 0.1;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.1));
    }
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const drumGain = this.ctx.createGain();
    drumGain.gain.value = 0.5;
    source.connect(drumGain);
    drumGain.connect(this.ctx.destination);
    source.start();
  }

  destroy(): void {
    this.osc1?.stop();
    this.osc2?.stop();
    this.ctx?.close();
    this._active = false;
  }
}
