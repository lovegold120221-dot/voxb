export class AudioStreamer {
  private audioContext: AudioContext | null = null;
  private source: AudioBufferSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private dataArray: Uint8Array | null = null;
  private queue: Float32Array[] = [];
  private isPlaying = false;
  private sampleRate = 24000;
  private scheduledTime = 0;

  async init(sampleRate = 24000) {
    if (this.audioContext && this.audioContext.state !== 'closed') {
      try {
        await this.audioContext.close();
      } catch (e) {}
    }
    this.sampleRate = sampleRate;
    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
      sampleRate,
    });
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 64;
    const bufferLength = this.analyser.frequencyBinCount;
    this.dataArray = new Uint8Array(bufferLength);
    this.analyser.connect(this.audioContext.destination);

    this.scheduledTime = 0;
    this.isPlaying = false;
    this.queue = [];
  }

  getFrequencies(numBins: number = 5): number[] {
    if (!this.analyser || !this.dataArray) return Array(numBins).fill(0);
    this.analyser.getByteFrequencyData(this.dataArray);
    const result = [];
    const step = Math.floor(this.dataArray.length / numBins);
    for (let i = 0; i < numBins; i++) {
      let sum = 0;
      for (let j = 0; j < step; j++) {
        sum += this.dataArray[i * step + j];
      }
      result.push((sum / step) / 255);
    }
    return result;
  }

  addPCM16(base64: string) {
    if (!this.audioContext) return;
    const binary = atob(base64);
    const buffer = new ArrayBuffer(binary.length);
    const view = new DataView(buffer);
    for (let i = 0; i < binary.length; i++) {
        view.setUint8(i, binary.charCodeAt(i));
    }
    const int16Array = new Int16Array(buffer);
    const float32Array = new Float32Array(int16Array.length);
    for (let i = 0; i < int16Array.length; i++) {
        float32Array[i] = int16Array[i] / (int16Array[i] < 0 ? 0x8000 : 0x7FFF);
    }
    this.queue.push(float32Array);
    if (!this.isPlaying) {
      this.playNext();
    }
  }

  private playNext() {
    if (!this.audioContext || this.queue.length === 0) {
      this.isPlaying = false;
      return;
    }
    this.isPlaying = true;
    const chunk = this.queue.shift()!;
    const audioBuffer = this.audioContext.createBuffer(1, chunk.length, this.sampleRate);
    audioBuffer.getChannelData(0).set(chunk);
    
    this.source = this.audioContext.createBufferSource();
    this.source.buffer = audioBuffer;
    this.source.connect(this.analyser || this.audioContext.destination);
    
    const currentTime = this.audioContext.currentTime;
    if (this.scheduledTime < currentTime) {
      this.scheduledTime = currentTime;
    }
    
    this.source.start(this.scheduledTime);
    this.scheduledTime += audioBuffer.duration;
    
    // Play next seamlessly, not perfect but avoids large gaps
    setTimeout(() => {
        this.playNext();
    }, (audioBuffer.duration * 1000) - 20); 
  }

  stop() {
    this.queue = [];
    if (this.source) {
      try {
        this.source.stop();
      } catch (e) {}
    }
    this.isPlaying = false;
    this.scheduledTime = 0;
  }
}

export class AmbientConversationBed {
  private audioContext: AudioContext | null = null;
  private source: AudioBufferSourceNode | null = null;
  private highpass: BiquadFilterNode | null = null;
  private lowpass: BiquadFilterNode | null = null;
  private gain: GainNode | null = null;
  private baseVolume = 0.012;
  private isDucked = false;

  async start(volume = 0.012) {
    this.baseVolume = this.clampVolume(volume);

    if (this.audioContext && this.audioContext.state !== 'closed') {
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }
      this.applyGain();
      return;
    }

    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const sampleRate = this.audioContext.sampleRate;
    const buffer = this.audioContext.createBuffer(1, sampleRate * 8, sampleRate);
    const channel = buffer.getChannelData(0);
    let slowNoise = 0;

    for (let i = 0; i < channel.length; i++) {
      slowNoise = slowNoise * 0.985 + (Math.random() * 2 - 1) * 0.015;
      channel[i] = slowNoise * 0.42;
    }

    this.source = this.audioContext.createBufferSource();
    this.source.buffer = buffer;
    this.source.loop = true;

    this.highpass = this.audioContext.createBiquadFilter();
    this.highpass.type = 'highpass';
    this.highpass.frequency.value = 90;
    this.highpass.Q.value = 0.2;

    this.lowpass = this.audioContext.createBiquadFilter();
    this.lowpass.type = 'lowpass';
    this.lowpass.frequency.value = 520;
    this.lowpass.Q.value = 0.35;

    this.gain = this.audioContext.createGain();
    this.gain.gain.value = 0;

    this.source.connect(this.highpass);
    this.highpass.connect(this.lowpass);
    this.lowpass.connect(this.gain);
    this.gain.connect(this.audioContext.destination);
    this.source.start();
    this.applyGain();
  }

  setVolume(volume: number) {
    this.baseVolume = this.clampVolume(volume);
    this.applyGain();
  }

  duck(shouldDuck: boolean) {
    this.isDucked = shouldDuck;
    this.applyGain();
  }

  private clampVolume(volume: number) {
    return Math.max(0, Math.min(0.03, Number.isFinite(volume) ? volume : 0.012));
  }

  private applyGain() {
    if (!this.audioContext || !this.gain) return;
    const target = this.isDucked ? this.baseVolume * 0.18 : this.baseVolume;
    this.gain.gain.setTargetAtTime(target, this.audioContext.currentTime, 0.35);
  }

  stop() {
    if (this.source) {
      try {
        this.source.stop();
      } catch (e) {}
    }

    [this.source, this.highpass, this.lowpass, this.gain].forEach(node => {
      try {
        node?.disconnect();
      } catch (e) {}
    });

    if (this.audioContext && this.audioContext.state !== 'closed') {
      try {
        this.audioContext.close();
      } catch (e) {}
    }

    this.audioContext = null;
    this.source = null;
    this.highpass = null;
    this.lowpass = null;
    this.gain = null;
    this.isDucked = false;
  }
}

export class AudioRecorder {
  private audioContext: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private silentSink: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private dataArray: Uint8Array | null = null;
  private onData: (base64: string) => void;

  constructor(onData: (base64: string) => void) {
    this.onData = onData;
  }

  async start() {
    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
      sampleRate: 16000
    });
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const source = this.audioContext.createMediaStreamSource(this.stream);
    
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 64;
    const bufferLength = this.analyser.frequencyBinCount;
    this.dataArray = new Uint8Array(bufferLength);
    source.connect(this.analyser);

    this.processor = this.audioContext.createScriptProcessor(2048, 1, 1);
    this.processor.onaudioprocess = (e) => {
      const input = e.inputBuffer.getChannelData(0);
      const output = new Int16Array(input.length);
      for (let i = 0; i < input.length; i++) {
        const s = Math.max(-1, Math.min(1, input[i]));
        output[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }
      const buffer = new ArrayBuffer(output.length * 2);
      const view = new DataView(buffer);
      for (let i = 0; i < output.length; i++) {
        view.setInt16(i * 2, output[i], true);
      }
      const bytes = new Uint8Array(buffer);
      let binary = '';
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      this.onData(btoa(binary));
    };
    
    this.analyser.connect(this.processor);
    this.silentSink = this.audioContext.createGain();
    this.silentSink.gain.value = 0;
    this.processor.connect(this.silentSink);
    this.silentSink.connect(this.audioContext.destination);
  }

  getFrequencies(numBins: number = 5): number[] {
    if (!this.analyser || !this.dataArray) return Array(numBins).fill(0);
    this.analyser.getByteFrequencyData(this.dataArray);
    const result = [];
    const step = Math.floor(this.dataArray.length / numBins);
    for (let i = 0; i < numBins; i++) {
      let sum = 0;
      for (let j = 0; j < step; j++) {
        sum += this.dataArray[i * step + j];
      }
      result.push((sum / step) / 255);
    }
    return result;
  }

  stop() {
    if (this.processor && this.audioContext) {
      try {
        this.processor.disconnect();
      } catch (e) {}
    }
    if (this.silentSink) {
      try {
        this.silentSink.disconnect();
      } catch (e) {}
    }
    if (this.analyser) {
      try {
        this.analyser.disconnect();
      } catch (e) {}
    }
    if (this.stream) {
      this.stream.getTracks().forEach(track => {
        try {
          track.stop();
        } catch (e) {}
      });
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
      try {
        this.audioContext.close();
      } catch (e) {
        console.error("Failed to close AudioContext:", e);
      }
    }
    this.audioContext = null;
    this.stream = null;
    this.processor = null;
    this.silentSink = null;
    this.analyser = null;
    this.dataArray = null;
  }
}
