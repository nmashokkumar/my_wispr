import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  PCM_PACKET_BYTES,
  PCM_PACKET_SAMPLES,
  PcmPacketizer,
  deriveWebSocketUrl,
  downsampleFloat32To16kInt16,
  encodePcm16ToWavBlob,
  formatElapsedTimer,
} from './pcmAudio.ts';

describe('pcmAudio — resampling & 1,024-byte packetization', () => {
  it('downsamples 48kHz Float32 audio to 16kHz Int16 mono cleanly', () => {
    // 4800 samples at 48kHz = 100ms -> should produce 1600 samples at 16kHz
    const input = new Float32Array(4800);
    for (let i = 0; i < input.length; i += 1) {
      input[i] = Math.sin((2 * Math.PI * 440 * i) / 48000) * 0.5;
    }
    const downsampled = downsampleFloat32To16kInt16(input, 48000, 16000);
    assert.equal(downsampled.length, 1600);
    assert.ok(Math.max(...downsampled) > 10000);
    assert.ok(Math.min(...downsampled) < -10000);
  });

  it('clamps out-of-range Float32 samples safely to Int16 bounds', () => {
    const input = new Float32Array([1.5, -1.5, 0, 1.0, -1.0]);
    const out = downsampleFloat32To16kInt16(input, 16000, 16000);
    assert.deepEqual(Array.from(out), [32767, -32768, 0, 32767, -32768]);
  });

  it('emits exact 1,024-byte (512-sample) packets across uneven input chunks', () => {
    const packetizer = new PcmPacketizer(PCM_PACKET_SAMPLES);

    const chunk1 = new Int16Array(300).fill(1234);
    assert.equal(packetizer.push(chunk1).length, 0);

    const chunk2 = new Int16Array(800).fill(-2345);
    // 300 + 800 = 1100 samples -> 2 full packets (1024 samples) + 76 buffered
    const emitted = packetizer.push(chunk2);
    assert.equal(emitted.length, 2);
    assert.equal(emitted[0].byteLength, PCM_PACKET_BYTES);
    assert.equal(emitted[1].byteLength, PCM_PACKET_BYTES);

    // Check little-endian sample values
    const view0 = new DataView(emitted[0]);
    assert.equal(view0.getInt16(0, true), 1234);
    assert.equal(view0.getInt16(300 * 2, true), -2345);

    const tail = packetizer.flush();
    assert.ok(tail !== null);
    assert.equal(tail!.byteLength, PCM_PACKET_BYTES);
    assert.equal(packetizer.flush(), null);
  });

  it('encodes valid RIFF WAVE blob from Int16 PCM chunks', async () => {
    const samples = new Int16Array(160).fill(500);
    const wav = encodePcm16ToWavBlob([samples], 16000);
    assert.equal(wav.type, 'audio/wav');
    assert.equal(wav.size, 44 + 160 * 2);
    const header = new Uint8Array(await wav.slice(0, 12).arrayBuffer());
    assert.equal(String.fromCharCode(...header.slice(0, 4)), 'RIFF');
    assert.equal(String.fromCharCode(...header.slice(8, 12)), 'WAVE');
  });
});

describe('pcmAudio — WebSocket URL derivation & timer formatting', () => {
  it('derives wss://.../api/v1/meetings/transcribe from HTTPS base URL', () => {
    assert.equal(
      deriveWebSocketUrl('https://8000-agq75oq6i7eazd5pahfhehvvj4.instabox.tech'),
      'wss://8000-agq75oq6i7eazd5pahfhehvvj4.instabox.tech/api/v1/meetings/transcribe'
    );
    assert.equal(
      deriveWebSocketUrl('https://8000-agq75oq6i7eazd5pahfhehvvj4.instabox.tech/transcribe/'),
      'wss://8000-agq75oq6i7eazd5pahfhehvvj4.instabox.tech/api/v1/meetings/transcribe'
    );
    assert.equal(
      deriveWebSocketUrl('http://localhost:8000'),
      'ws://localhost:8000/api/v1/meetings/transcribe'
    );
  });

  it('formats elapsed recording timer cleanly', () => {
    assert.equal(formatElapsedTimer(0), '0:00');
    assert.equal(formatElapsedTimer(4200), '0:04');
    assert.equal(formatElapsedTimer(65900), '1:05');
    assert.equal(formatElapsedTimer(300000), '5:00');
  });
});
