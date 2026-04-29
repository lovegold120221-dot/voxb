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

export class AudioRecorder {
  private audioContext: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
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
    this.processor.connect(this.audioContext.destination);
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
  }
}
