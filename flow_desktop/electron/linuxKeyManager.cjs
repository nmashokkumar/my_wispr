const { spawn } = require('child_process');
const path = require('path');
const EventEmitter = require('events');
const fs = require('fs');

const INPUT_DIR = '/dev/input';
const INPUT_SYSFS_DIR = '/sys/class/input';
const EV_KEY = 1n;
const KEY_A = 30n;

function couldBeKeyboard(device) {
  const capabilities = path.join(INPUT_SYSFS_DIR, device, 'device', 'capabilities');
  const hasBit = (bitmap, bit) => {
    try {
      const words = fs.readFileSync(path.join(capabilities, bitmap), 'utf8').trim().split(' ');
      return ((BigInt(`0x${words.at(-1)}`) >> bit) & 1n) === 1n;
    } catch {
      return false;
    }
  };
  try {
    return hasBit('ev', EV_KEY) && hasBit('key', KEY_A);
  } catch {
    return true;
  }
}

class LinuxKeyManager extends EventEmitter {
  constructor() {
    super();
    this.isSupported = process.platform === 'linux';
    this.hasReportedError = false;
    this.hasReportedUnavailable = false;
    this.listeners = new Map(); // key -> { child }
  }

  setKeys(keys) {
    if (!this.isSupported) return;
    const desired = new Set(keys.filter(Boolean));

    for (const key of [...this.listeners.keys()]) {
      if (!desired.has(key)) this._stopKey(key);
    }

    if (desired.size === 0) return;

    const listenerPath = this.resolveListenerBinary();
    if (!listenerPath) {
      if (!this.hasReportedUnavailable) {
        this.hasReportedUnavailable = true;
        this.emit('unavailable', new Error('Linux key listener binary not found'));
      }
      return;
    }

    for (const key of desired) {
      if (!this.listeners.has(key)) this._startKey(key, listenerPath);
    }
  }

  _startKey(key, listenerPath) {
    let child;
    try {
      child = spawn(listenerPath, [key], { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (error) {
      console.error('[LinuxKeyManager] Failed to spawn key listener:', error.message);
      this.reportError(error);
      return;
    }

    this.hasReportedError = false;
    const entry = { child };
    this.listeners.set(key, entry);
    console.log(`[LinuxKeyManager] Watching key: ${key} (binary: ${listenerPath})`);

    let lineBuffer = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      if (this.listeners.get(key) !== entry) return;
      lineBuffer += chunk;
      const lines = lineBuffer.split(/\r?\n/);
      lineBuffer = lines.pop();
      for (const raw of lines) {
        if (this.listeners.get(key) !== entry) return;
        const line = raw.trim();
        if (line) this.handleOutputLine(line, key);
      }
    });

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (data) => {
      const msg = data.toString().trim();
      if (msg) console.log(`[LinuxKeyManager] native stderr (${key}): ${msg}`);
    });

    child.on('error', (error) => {
      if (this.listeners.get(key) !== entry) return;
      this._stopKey(key);
      this.reportError(error);
    });

    child.on('close', (code, signal) => {
      const trailing = lineBuffer.trim();
      if (trailing && this.listeners.get(key) === entry) {
        this.handleOutputLine(trailing, key);
      }
      const wasTracked = this.listeners.get(key) === entry;
      if (wasTracked) this._stopKey(key);
      if (wasTracked && (code || signal)) {
        console.warn(`[LinuxKeyManager] Key listener exited: code=${code}, signal=${signal}`);
      }
    });
  }

  _stopKey(key) {
    const entry = this.listeners.get(key);
    if (!entry) return;
    this.listeners.delete(key);
    console.log(`[LinuxKeyManager] Stopped watching key: ${key}`);
    try {
      entry.child.kill();
    } catch {
      // Ignored
    }
  }

  handleOutputLine(line, key) {
    if (line === 'READY') {
      console.log(`[LinuxKeyManager] Key listener ready for: ${key}`);
      this.emit('ready', key);
      return;
    }
    if (line === 'NO_PERMISSION') {
      console.warn('[LinuxKeyManager] No permission to read /dev/input devices (requires input group)');
      this.emit('permission-denied');
      return;
    }
    if (line === 'KEY_DOWN') {
      this.emit('key-down', key);
      return;
    }
    if (line === 'KEY_UP') {
      this.emit('key-up', key);
      return;
    }
  }

  stop() {
    for (const key of [...this.listeners.keys()]) this._stopKey(key);
  }

  checkAvailability() {
    if (!this.resolveListenerBinary()) return { available: false, reason: 'binary_missing' };

    let devices;
    try {
      devices = fs.readdirSync(INPUT_DIR).filter((entry) => entry.startsWith('event'));
    } catch (error) {
      const denied = error.code === 'EACCES' || error.code === 'EPERM';
      return {
        available: false,
        reason: denied ? 'input_access_denied' : 'input_devices_unavailable',
      };
    }

    let denied = false;
    for (const device of devices) {
      try {
        fs.accessSync(path.join(INPUT_DIR, device), fs.constants.R_OK);
      } catch {
        denied = true;
        continue;
      }
      if (couldBeKeyboard(device)) return { available: true };
    }

    return denied ? { available: false, reason: 'input_access_denied' } : { available: true };
  }

  reportError(error) {
    if (this.hasReportedError) return;
    this.hasReportedError = true;
    console.warn('[LinuxKeyManager] Listener error:', error.message);
    this.emit('error', error);
  }

  resolveListenerBinary() {
    const arch = process.arch;
    const candidates = [
      path.join(__dirname, '..', 'resources', 'bin', `linux-key-listener-${arch}`),
      path.join(__dirname, '..', 'resources', 'bin', 'linux-key-listener'),
      path.join(__dirname, '..', 'resources', `linux-key-listener-${arch}`),
      path.join(__dirname, '..', 'resources', 'linux-key-listener'),
    ];

    for (const candidate of candidates) {
      try {
        const stats = fs.statSync(candidate);
        if (stats.isFile()) return candidate;
      } catch {
        // continue
      }
    }
    return null;
  }
}

module.exports = LinuxKeyManager;
