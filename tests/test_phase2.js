/**
 * Automated Verification Suite for Phase 2:
 * Tests the Local SQLite Database & Audio Retention Engine
 */

const assert = require('assert');
const { FlowDatabase } = require('../client/src/main/db.js');

function runTests() {
  console.log('--- Starting Phase 2 Database & Retention Verification ---');

  // Test 1: In-memory DB instantiation
  const db = new FlowDatabase(':memory:', 10);
  assert.ok(db, 'Database instance should be created');

  // Test 2: History insert with audio BLOB and opusChunks
  const fakeAudio = Buffer.from('RIFF....WAVEfmt....datafakeaudiostream');
  const fakeOpus = ['chunk1_base64', 'chunk2_base64'];
  const recId = 'test-uuid-1';

  db.saveHistory({
    transcriptEntityId: recId,
    asrText: 'hello world',
    formattedText: 'Hello world.',
    audio: fakeAudio,
    opusChunks: fakeOpus,
    duration: 1200,
    numWords: 2,
    status: 'success',
    app: 'Google Chrome'
  });

  const recent = db.getRecentHistory(10);
  assert.strictEqual(recent.length, 1, 'Should have exactly 1 record');
  assert.strictEqual(recent[0].transcriptEntityId, recId);
  assert.strictEqual(recent[0].numWords, 2);
  assert.strictEqual(recent[0].hasAudio, true, 'hasAudio flag should be true');

  // Test 3: Audio retrieval for replay & re-transcribe
  const retrieved = db.getRecordingAudio(recId);
  assert.ok(retrieved, 'Should retrieve recording audio record');
  assert.strictEqual(retrieved.audio.toString('utf8'), fakeAudio.toString('utf8'), 'Audio buffer should match');
  assert.deepStrictEqual(retrieved.opusChunks, fakeOpus, 'Opus chunks should match');

  // Test 4: Re-transcription update
  db.updateHistoryTranscript(recId, {
    asrText: 'hello world retranscribed',
    formattedText: 'Hello world, retranscribed!',
    numWords: 3,
    status: 'success'
  });

  const updatedRec = db.getRecentHistory(1)[0];
  assert.strictEqual(updatedRec.formattedText, 'Hello world, retranscribed!');
  assert.strictEqual(updatedRec.numWords, 3);

  // Test 5: Circular Buffer Retention (Store 15 items, verify last 10 keep audio, older pruned)
  console.log('Testing circular 10-audio retention buffer...');
  for (let i = 2; i <= 15; i++) {
    db.saveHistory({
      transcriptEntityId: `test-uuid-${i}`,
      asrText: `recording number ${i}`,
      formattedText: `Recording number ${i}.`,
      audio: Buffer.from(`audio-content-${i}`),
      opusChunks: [`opus-${i}`],
      duration: 1000 + i * 100,
      numWords: 3,
      status: 'success'
    });
  }

  const allRecent = db.getRecentHistory(20);
  assert.strictEqual(allRecent.length, 15, 'Should have 15 total text records');

  // The latest 10 (UUIDs 15 down to 6) must have audio
  for (let i = 0; i < 10; i++) {
    const item = allRecent[i];
    assert.strictEqual(item.hasAudio, true, `Record ${item.transcriptEntityId} should have retained audio`);
    const audioData = db.getRecordingAudio(item.transcriptEntityId);
    assert.ok(audioData.audio !== null, `Record ${item.transcriptEntityId} audio buffer must not be null`);
  }

  // Older records (UUIDs 5 down to 1) must have their audio pruned to NULL
  for (let i = 10; i < allRecent.length; i++) {
    const item = allRecent[i];
    assert.strictEqual(item.hasAudio, false, `Older record ${item.transcriptEntityId} audio should be pruned`);
    const audioData = db.getRecordingAudio(item.transcriptEntityId);
    assert.strictEqual(audioData.audio, null, `Pruned record ${item.transcriptEntityId} audio must be null`);
    assert.strictEqual(audioData.opusChunks, null, `Pruned record ${item.transcriptEntityId} opusChunks must be null`);
  }

  // Test 6: Dictionary operations
  console.log('Testing custom vocabulary dictionary...');
  db.addDictionaryWord('Antigravity');
  db.addDictionaryWord('WisprFlow');
  db.addDictionaryWord('Antigravity'); // frequency should increment to 2

  const words = db.getDictionaryWords();
  assert.strictEqual(words.length, 2, 'Should have 2 unique words');
  assert.strictEqual(words[0].phrase, 'Antigravity');
  assert.strictEqual(words[0].frequencyUsed, 2, 'Frequency should be 2 for Antigravity');

  db.removeDictionaryWord('WisprFlow');
  assert.strictEqual(db.getDictionaryWords().length, 1);

  // Test 7: Polish presets
  console.log('Testing polish presets...');
  db.savePolishPreset({
    id: 'concise',
    promptName: 'Concise Mode',
    prompt: 'Summarize into short bullet points',
    shortcutKey: 'Alt+C'
  });

  const presets = db.getPolishPresets();
  assert.strictEqual(presets.length, 1);
  assert.strictEqual(presets[0].promptName, 'Concise Mode');
  assert.strictEqual(presets[0].shortcutKey, 'Alt+C');

  db.close();
  console.log('✅ ALL Phase 2 Automated Tests Passed Successfully!');
}

runTests();
