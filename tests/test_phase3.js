/**
 * Automated Verification Suite for Phase 3:
 * Tests Linux Audio Processing, WAV packaging, RMS calculation,
 * Cloud Server Client, Offline Audio Caching, and Re-Transcription.
 */

const assert = require('assert');
const http = require('http');
const { LinuxAudioCapture } = require('../client/src/main/audio.js');
const { WisprServerClient } = require('../client/src/main/client.js');
const { FlowDatabase } = require('../client/src/main/db.js');

async function runTests() {
  console.log('--- Starting Phase 3 Audio & Network Client Verification ---');

  // Test 1: WAV header generation
  console.log('Testing WAV header generation...');
  const fakePcm = Buffer.alloc(3200); // 100ms of 16kHz 16-bit mono
  const wav = LinuxAudioCapture.createWav(fakePcm, 16000, 1);
  assert.strictEqual(wav.length, 44 + 3200, 'WAV size must be 44-byte header + PCM payload');
  assert.strictEqual(wav.subarray(0, 4).toString('ascii'), 'RIFF');
  assert.strictEqual(wav.subarray(8, 12).toString('ascii'), 'WAVE');
  assert.strictEqual(wav.readUInt16LE(22), 1, 'Channels must be 1');
  assert.strictEqual(wav.readUInt32LE(24), 16000, 'Sample rate must be 16000');
  assert.strictEqual(wav.readUInt16LE(34), 16, 'Bit depth must be 16');

  // Test 2: Audio RMS energy calculation
  console.log('Testing RMS calculation...');
  const silentRms = LinuxAudioCapture.calculateRms(fakePcm);
  assert.strictEqual(silentRms, 0, 'Silent PCM should have 0 RMS');

  const loudPcm = Buffer.alloc(3200);
  for (let i = 0; i < loudPcm.length; i += 2) {
    loudPcm.writeInt16LE(20000, i);
  }
  const loudRms = LinuxAudioCapture.calculateRms(loudPcm);
  assert.ok(loudRms > 0.5, `Loud PCM should have high RMS (got ${loudRms})`);

  // Test 3: Offline error caching in SQLite
  console.log('Testing offline network error handling & audio retention...');
  const db = new FlowDatabase(':memory:', 10);
  const client = new WisprServerClient({
    server: {
      api_base_url: 'http://127.0.0.1:59999', // Non-existent port
      timeout_ms: 1000
    }
  }, db);

  const offlineRes = await client.transcribeAudio({
    wavBuffer: wav,
    durationMs: 1200,
    promptPreset: 'standard'
  });

  assert.strictEqual(offlineRes.ok, false, 'Should report failure when server is down');
  assert.strictEqual(offlineRes.cached, true, 'Audio must be cached in database');

  const cachedRec = db.getRecentHistory(1)[0];
  assert.strictEqual(cachedRec.status, 'error');
  assert.strictEqual(cachedRec.hasAudio, true, 'Cached recording must retain audio buffer');

  // Test 4: Live Mock Server & Re-transcribe flow
  console.log('Testing mock server transcription & offline recovery (re-transcribe)...');
  const mockPort = 8765;
  const mockServer = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/v1/audio/transcriptions') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        const payload = JSON.parse(body);
        assert.ok(payload.audio_base64, 'Must send base64 audio');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'ok',
          text: 'testing wispr flow linux reconstruction',
          formatted_text: 'Testing Wispr Flow Linux reconstruction.',
          num_words: 5,
          total_time: 0.15
        }));
      });
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  await new Promise(resolve => mockServer.listen(mockPort, resolve));

  // Point client to live mock server
  client.config.api_base_url = `http://127.0.0.1:${mockPort}`;

  // Call retranscribe on the previously failed recording!
  const retranscribeRes = await client.retranscribe(cachedRec.transcriptEntityId);
  assert.strictEqual(retranscribeRes.ok, true, 'Re-transcribe should succeed');
  assert.strictEqual(retranscribeRes.formattedText, 'Testing Wispr Flow Linux reconstruction.');
  assert.strictEqual(retranscribeRes.numWords, 5);

  // Verify database record was updated from 'error' to 'success'
  const updatedRec = db.getRecentHistory(1)[0];
  assert.strictEqual(updatedRec.status, 'success');
  assert.strictEqual(updatedRec.formattedText, 'Testing Wispr Flow Linux reconstruction.');
  assert.strictEqual(updatedRec.numWords, 5);

  // Cleanup
  await new Promise(resolve => mockServer.close(resolve));
  db.close();

  console.log('✅ ALL Phase 3 Automated Tests Passed Successfully!');
}

runTests().catch(err => {
  console.error('❌ Phase 3 Test Failed:', err);
  process.exit(1);
});
