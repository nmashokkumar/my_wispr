export interface AudioRecorderCallbacks {
  onLevels: (bars: number[]) => void;
  onSilenceTimeout?: () => void;
  onError?: (message: string) => void;
}

export interface AudioRecordingResult {
  blob: Blob;
  durationMs: number;
  simulated: boolean;
}

export interface MicDeviceOption {
  deviceId: string;
  label: string;
}

const BAR_COUNT = 10;

export async function listAudioInputDevices(): Promise<MicDeviceOption[]> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
    return [{ deviceId: 'default', label: 'System Default Microphone' }];
  }
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const inputs = devices
      .filter((d) => d.kind === 'audioinput')
      .map((d, idx) => ({
        deviceId: d.deviceId || 'default',
        label: d.label || `Microphone ${idx + 1}`,
      }));
    if (inputs.length === 0) {
      return [{ deviceId: 'default', label: 'System Default Microphone' }];
    }
    return inputs;
  } catch {
    return [{ deviceId: 'default', label: 'System Default Microphone' }];
  }
}

/**
 * Wraps getUserMedia + MediaRecorder (webm/opus) + Web Audio AnalyserNode
 * for live waveform visualization and optional silence auto-stop in hands-free mode.
 */
export class AudioCaptureController {
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private chunks: Blob[] = [];
  private rafId: number | null = null;
  private startedAt = 0;
  private lastVoiceAt = 0;
  private silenceTriggered = false;
  private isSimulated = false;
  private stopResolver: ((res: AudioRecordingResult) => void) | null = null;

  async start(options: {
    deviceId?: string;
    silenceTimeoutMs?: number;
    allowSimulatedFallback?: boolean;
    callbacks: AudioRecorderCallbacks;
  }): Promise<void> {
    this.cleanup();
    this.chunks = [];
    this.startedAt = performance.now();
    this.lastVoiceAt = performance.now();
    this.silenceTriggered = false;
    this.isSimulated = false;

    const constraints: MediaStreamConstraints = {
      audio:
        options.deviceId && options.deviceId !== 'default'
          ? {
              deviceId: { exact: options.deviceId },
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            }
          : {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
    };

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Microphone capture is not supported in this browser context.');
      }

      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log(
        '[AudioCapture] Microphone stream acquired:',
        this.stream.getAudioTracks().map((t) => `${t.label} (${t.readyState})`).join(', ')
      );

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : '';

      this.recorder = mimeType
        ? new MediaRecorder(this.stream, { mimeType })
        : new MediaRecorder(this.stream);

      this.recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          this.chunks.push(ev.data);
        }
      };

      this.recorder.onstop = () => {
        const durationMs = Math.max(200, Math.round(performance.now() - this.startedAt));
        const blob = new Blob(this.chunks, { type: mimeType || 'audio/webm' });
        console.log(
          `[AudioCapture] Recorder stopped: totalChunks=${this.chunks.length}, blobSize=${blob.size} bytes, duration=${durationMs}ms`
        );
        const resolve = this.stopResolver;
        this.stopResolver = null;
        this.cleanup();
        resolve?.({ blob, durationMs, simulated: false });
      };

      // AnalyserNode drives the live 10-bar waveform and silence auto-stop
      const AudioContextCtor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioCtx = new AudioContextCtor();
      const source = this.audioCtx.createMediaStreamSource(this.stream);
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 64;
      this.analyser.smoothingTimeConstant = 0.78;
      source.connect(this.analyser);

      this.recorder.start(120);
      this.startMeterLoop(options.silenceTimeoutMs, options.callbacks);
    } catch (err) {
      const name = err instanceof DOMException ? err.name : '';
      if (options.allowSimulatedFallback) {
        // In Mock mode (or headless test environments without a hardware mic),
        // simulate a live waveform + silent WebM blob so the full dictation pipeline works smoothly.
        this.isSimulated = true;
        this.startSimulatedMeterLoop(options.silenceTimeoutMs, options.callbacks);
        return;
      }

      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        throw new Error('Microphone permission denied. Allow mic access in your browser or OS settings.');
      }
      if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        throw new Error('No microphone detected. Connect a microphone or enable Mock mode in Settings.');
      }
      throw new Error(err instanceof Error ? err.message : 'Unable to access microphone.');
    }
  }

  private startMeterLoop(silenceTimeoutMs: number | undefined, callbacks: AudioRecorderCallbacks) {
    const data = new Uint8Array(this.analyser ? this.analyser.frequencyBinCount : 16);

    const tick = () => {
      if (!this.analyser) return;
      this.analyser.getByteFrequencyData(data);

      const bars: number[] = [];
      let sum = 0;
      for (let i = 0; i < BAR_COUNT; i += 1) {
        const binIndex = Math.min(data.length - 1, Math.floor((i * data.length) / BAR_COUNT) + 1);
        const normalized = Math.min(1, data[binIndex] / 195);
        sum += normalized;
        bars.push(Math.max(0.14, normalized));
      }

      const avgLevel = sum / BAR_COUNT;
      callbacks.onLevels(bars);

      const now = performance.now();
      if (avgLevel > 0.08) {
        this.lastVoiceAt = now;
      } else if (
        silenceTimeoutMs &&
        silenceTimeoutMs > 0 &&
        !this.silenceTriggered &&
        now - this.startedAt > 1200 &&
        now - this.lastVoiceAt >= silenceTimeoutMs
      ) {
        this.silenceTriggered = true;
        callbacks.onSilenceTimeout?.();
        return;
      }

      this.rafId = requestAnimationFrame(tick);
    };

    this.rafId = requestAnimationFrame(tick);
  }

  private startSimulatedMeterLoop(silenceTimeoutMs: number | undefined, callbacks: AudioRecorderCallbacks) {
    const tick = () => {
      if (!this.isSimulated) return;
      const elapsed = performance.now() - this.startedAt;
      const t = elapsed / 140;
      const bars: number[] = [];
      for (let i = 0; i < BAR_COUNT; i += 1) {
        const centerWeight = 1 - Math.abs(i - (BAR_COUNT - 1) / 2) / (BAR_COUNT / 1.7);
        const wave = 0.32 + 0.52 * Math.abs(Math.sin(t + i * 0.65)) * centerWeight;
        bars.push(Math.max(0.18, Math.min(0.98, wave)));
      }
      callbacks.onLevels(bars);

      if (silenceTimeoutMs && silenceTimeoutMs > 0 && !this.silenceTriggered && elapsed >= silenceTimeoutMs + 2500) {
        this.silenceTriggered = true;
        callbacks.onSilenceTimeout?.();
        return;
      }

      this.rafId = requestAnimationFrame(tick);
    };

    this.rafId = requestAnimationFrame(tick);
  }

  async stop(): Promise<AudioRecordingResult> {
    if (this.isSimulated) {
      const durationMs = Math.max(900, Math.round(performance.now() - this.startedAt));
      this.cleanup();
      return {
        blob: new Blob(['simulated-audio-webm'], { type: 'audio/webm;codecs=opus' }),
        durationMs,
        simulated: true,
      };
    }

    if (!this.recorder || this.recorder.state === 'inactive') {
      const durationMs = Math.max(400, Math.round(performance.now() - this.startedAt));
      this.cleanup();
      return {
        blob: new Blob(this.chunks, { type: 'audio/webm;codecs=opus' }),
        durationMs,
        simulated: false,
      };
    }

    return new Promise<AudioRecordingResult>((resolve) => {
      this.stopResolver = resolve;
      try {
        this.recorder?.stop();
      } catch {
        const durationMs = Math.max(400, Math.round(performance.now() - this.startedAt));
        this.cleanup();
        resolve({
          blob: new Blob(this.chunks, { type: 'audio/webm;codecs=opus' }),
          durationMs,
          simulated: false,
        });
      }
    });
  }

  cancel(): void {
    this.stopResolver = null;
    if (this.recorder && this.recorder.state !== 'inactive') {
      try {
        this.recorder.onstop = null;
        this.recorder.stop();
      } catch {
        // Ignore recorder stop errors on cancel
      }
    }
    this.cleanup();
  }

  private cleanup(): void {
    this.isSimulated = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
    if (this.audioCtx) {
      this.audioCtx.close().catch(() => undefined);
      this.audioCtx = null;
    }
    this.analyser = null;
    this.recorder = null;
  }
}
