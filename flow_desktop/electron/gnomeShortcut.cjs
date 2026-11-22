const http = require('http');
const { execFileSync } = require('child_process');

const DBUS_SERVICE_NAME = 'com.wisprflow.App';
const DBUS_OBJECT_PATH = '/com/wisprflow/App';
const DBUS_INTERFACE = 'com.wisprflow.App';

const KEYBINDING_SCHEMA = 'org.gnome.settings-daemon.plugins.media-keys.custom-keybinding';
const MEDIA_KEYS_SCHEMA = 'org.gnome.settings-daemon.plugins.media-keys';

const SLOT_CONFIG = {
  hf: {
    path: '/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/wisprflow-hf/',
    name: 'Wispr Flow Dictation (Hands-Free)',
    defaultBinding: '<Control><Alt>space',
    command: 'dbus-send --session --type=method_call --dest=com.wisprflow.App /com/wisprflow/App com.wisprflow.App.ToggleHandsFree || curl -s http://127.0.0.1:51119/trigger?mode=hands_free',
  },
  ptt: {
    path: '/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/wisprflow-ptt/',
    name: 'Wispr Flow Dictation (Push-to-Talk)',
    defaultBinding: '<Control>space',
    command: 'dbus-send --session --type=method_call --dest=com.wisprflow.App /com/wisprflow/App com.wisprflow.App.TogglePushToTalk || curl -s http://127.0.0.1:51119/trigger?mode=push_to_talk',
  },
};

// Map Electron key names (lowercased) to X11 keysym names (case-sensitive)
const ELECTRON_TO_GNOME_KEY_MAP = {
  space: 'space',
  tab: 'Tab',
  escape: 'Escape',
  backspace: 'BackSpace',
  delete: 'Delete',
  return: 'Return',
  enter: 'Return',
  home: 'Home',
  end: 'End',
  insert: 'Insert',
  pause: 'Pause',
  print: 'Print',
  printscreen: 'Print',
  pageup: 'Page_Up',
  pagedown: 'Page_Down',
  scrolllock: 'Scroll_Lock',
  arrowup: 'Up',
  arrowdown: 'Down',
  arrowleft: 'Left',
  arrowright: 'Right',
  up: 'Up',
  down: 'Down',
  left: 'Left',
  right: 'Right',
  ',': 'comma',
  '.': 'period',
  '/': 'slash',
  '-': 'minus',
  '=': 'equal',
  ';': 'semicolon',
  "'": 'apostrophe',
  '[': 'bracketleft',
  ']': 'bracketright',
  '\\': 'backslash',
  plus: 'plus',
  '+': 'plus',
  comma: 'comma',
  period: 'period',
  slash: 'slash',
  minus: 'minus',
  equal: 'equal',
};

// Valid pattern for GNOME shortcut format using X11 keysym names
const VALID_SHORTCUT_PATTERN =
  /^(<(Control|Alt|Shift|Super)>)*(F([1-9]|1[0-9]|2[0-4])|comma|period|slash|plus|minus|equal|semicolon|apostrophe|backslash|bracketleft|bracketright|asciitilde|exclam|at|numbersign|dollar|percent|asciicircum|ampersand|asterisk|parenleft|parenright|underscore|braceleft|braceright|bar|colon|quotedbl|less|greater|question|[a-z0-9]|space|Escape|Tab|BackSpace|grave|Pause|Scroll_Lock|Insert|Delete|Home|End|Page_Up|Page_Down|Up|Down|Left|Right|Return|Print)$/;

function createHotkeyRepeatGate(windowMs = 500, now = Date.now) {
  let lastFireAt = -Infinity;
  return () => {
    const firedAt = now();
    const isRepeat = firedAt - lastFireAt < windowMs;
    if (!isRepeat) {
      lastFireAt = firedAt;
    }
    return !isRepeat;
  };
}

// Convert user HotkeyBinding from React into an Electron global accelerator string
function bindingToAccelerator(binding) {
  if (!binding || typeof binding !== 'object') return null;

  const code = binding.code || '';
  const parts = [];

  // Handle modifiers
  if (binding.ctrl) parts.push('Control');
  if (binding.alt) parts.push('Alt');
  if (binding.shift) parts.push('Shift');
  if (binding.meta) parts.push('Super');

  // Handle key code
  let key = code;
  if (key.startsWith('Key')) key = key.slice(3);
  else if (key.startsWith('Digit')) key = key.slice(5);
  else if (key === 'Space') key = 'Space';
  else if (key === 'Fn' || key === 'WakeUp') {
    return parts.length > 0 ? [...parts, 'Space'].join('+') : 'Control+Space';
  } else if (/^(Control|Alt|Shift|Meta)(Left|Right)?$/.test(key)) {
    return 'Control+Space';
  }

  if (key && !parts.includes(key)) {
    parts.push(key);
  }

  if (parts.length === 0) return null;
  return parts.join('+');
}

class GnomeShortcutManager {
  constructor(options = {}) {
    this.onDictationTrigger = options.onDictationTrigger || null;
    this.onShowDashboard = options.onShowDashboard || null;
    this.onHideOverlay = options.onHideOverlay || null;
    this.bus = null;
    this.httpServer = null;
    this.httpPort = options.httpPort || 51119;
    this.registeredSlots = new Set();
    this.hfGate = createHotkeyRepeatGate(400);
    this.pttGate = createHotkeyRepeatGate(400);
  }

  static isGnome() {
    const desktop = (process.env.XDG_CURRENT_DESKTOP || '').toLowerCase();
    const sessionDesktop = (process.env.XDG_SESSION_DESKTOP || '').toLowerCase();
    const desktopSession = (process.env.DESKTOP_SESSION || '').toLowerCase();
    const combined = `${desktop}:${sessionDesktop}:${desktopSession}`;
    return combined.includes('gnome') || combined.includes('ubuntu') || combined.includes('unity');
  }

  static isWayland() {
    return (
      (process.env.XDG_SESSION_TYPE || '').toLowerCase() === 'wayland' ||
      Boolean(process.env.WAYLAND_DISPLAY)
    );
  }

  static isValidShortcut(shortcut) {
    if (!shortcut || typeof shortcut !== 'string') return false;
    return VALID_SHORTCUT_PATTERN.test(shortcut);
  }

  static convertToGnomeFormat(hotkey) {
    if (!hotkey || typeof hotkey !== 'string') return '';

    const parts = hotkey
      .split('+')
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length === 0) return '';

    const key = parts.pop();
    const keyLower = key.toLowerCase();

    const modifiers = parts
      .map((mod) => {
        const m = mod.toLowerCase();
        if (m === 'commandorcontrol' || m === 'control' || m === 'ctrl') return '<Control>';
        if (m === 'alt' || m === 'option') return '<Alt>';
        if (m === 'shift') return '<Shift>';
        if (m === 'super' || m === 'meta' || m === 'win') return '<Super>';
        return '';
      })
      .filter(Boolean)
      .join('');

    let gnomeKey;
    if (key === ' ' || keyLower === 'space') {
      gnomeKey = 'space';
    } else if (ELECTRON_TO_GNOME_KEY_MAP[keyLower]) {
      gnomeKey = ELECTRON_TO_GNOME_KEY_MAP[keyLower];
    } else if (/^F\d+$/i.test(key)) {
      gnomeKey = key.toUpperCase();
    } else {
      gnomeKey = keyLower;
    }

    return modifiers + gnomeKey;
  }

  trigger(mode = 'hands_free') {
    const gate = mode === 'push_to_talk' ? this.pttGate : this.hfGate;
    if (!gate()) {
      console.log(`[GnomeShortcut] Suppressed rapid repeat event for mode=${mode}`);
      return;
    }
    if (this.onDictationTrigger) {
      this.onDictationTrigger(mode);
    }
  }

  initDbus() {
    let dbusModule = null;
    try {
      dbusModule = require('@homebridge/dbus-native');
    } catch (err) {
      console.warn('[GnomeShortcut] dbus-native not available:', err.message);
      return false;
    }

    try {
      this.bus = dbusModule.sessionBus();
      this.bus.connection.on('error', (err) => {
        console.warn('[GnomeShortcut] D-Bus connection error:', err.message);
      });
      this.bus.requestName(DBUS_SERVICE_NAME, 0);
      this.bus.exportInterface(
        {
          Toggle: () => {
            console.log('[GnomeShortcut] D-Bus method invoked: Toggle (hands_free)');
            this.trigger('hands_free');
          },
          ToggleHandsFree: () => {
            console.log('[GnomeShortcut] D-Bus method invoked: ToggleHandsFree');
            this.trigger('hands_free');
          },
          TogglePushToTalk: () => {
            console.log('[GnomeShortcut] D-Bus method invoked: TogglePushToTalk');
            this.trigger('push_to_talk');
          },
          ShowDashboard: () => {
            if (this.onShowDashboard) this.onShowDashboard();
          },
          HideOverlay: () => {
            if (this.onHideOverlay) this.onHideOverlay();
          },
        },
        DBUS_OBJECT_PATH,
        {
          name: DBUS_INTERFACE,
          methods: {
            Toggle: ['', ''],
            ToggleHandsFree: ['', ''],
            TogglePushToTalk: ['', ''],
            ShowDashboard: ['', ''],
            HideOverlay: ['', ''],
          },
        }
      );
      console.log('[GnomeShortcut] D-Bus service registered successfully as', DBUS_SERVICE_NAME);
      return true;
    } catch (err) {
      console.warn('[GnomeShortcut] Failed to initialize D-Bus service:', err.message);
      if (this.bus) {
        try {
          this.bus.connection.end();
        } catch {}
        this.bus = null;
      }
      return false;
    }
  }

  initHttpServer() {
    try {
      this.httpServer = http.createServer((req, res) => {
        try {
          const parsed = new URL(req.url, `http://127.0.0.1:${this.httpPort}`);
          if (
            parsed.pathname === '/trigger' ||
            parsed.pathname === '/dictation/toggle' ||
            parsed.pathname === '/toggle'
          ) {
            const mode = parsed.searchParams.get('mode') || 'hands_free';
            console.log(`[GnomeShortcut] HTTP trigger received for mode=${mode}`);
            this.trigger(mode);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, mode }));
            return;
          }
          if (parsed.pathname === '/health' || parsed.pathname === '/status') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'ok', pid: process.pid }));
            return;
          }
          res.writeHead(404);
          res.end();
        } catch (err) {
          res.writeHead(500);
          res.end(err.message);
        }
      });

      this.httpServer.on('error', (err) => {
        console.warn('[GnomeShortcut] HTTP server error:', err.message);
      });

      this.httpServer.listen(this.httpPort, '127.0.0.1', () => {
        console.log(`[GnomeShortcut] HTTP trigger server listening on 127.0.0.1:${this.httpPort}`);
      });
      return true;
    } catch (err) {
      console.warn('[GnomeShortcut] Failed to start HTTP trigger server:', err.message);
      return false;
    }
  }

  init() {
    this.initDbus();
    this.initHttpServer();
  }

  getExistingKeybindings() {
    try {
      const out = execFileSync('gsettings', ['get', MEDIA_KEYS_SCHEMA, 'custom-keybindings'], {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'ignore'],
      });
      const match = out.match(/\[([^\]]*)\]/);
      if (!match || !match[1].trim()) return [];
      return match[1]
        .split(',')
        .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean);
    } catch (err) {
      console.warn('[GnomeShortcut] Failed to read gsettings custom-keybindings:', err.message);
      return [];
    }
  }

  registerSlot(slotKey, gnomeBinding, commandOverride) {
    if (!GnomeShortcutManager.isGnome()) {
      return false;
    }

    const slot = SLOT_CONFIG[slotKey];
    if (!slot) {
      console.warn(`[GnomeShortcut] Unknown slot: ${slotKey}`);
      return false;
    }

    if (!GnomeShortcutManager.isValidShortcut(gnomeBinding)) {
      console.warn(`[GnomeShortcut] Invalid GNOME shortcut format: "${gnomeBinding}"`);
      return false;
    }

    const keyPath = slot.path;
    const displayName = slot.name;
    const command = commandOverride || slot.command;

    try {
      const existing = this.getExistingKeybindings();
      const alreadyRegistered = existing.includes(keyPath);

      const schema = `${KEYBINDING_SCHEMA}:${keyPath}`;
      execFileSync('gsettings', ['set', schema, 'name', displayName], { stdio: 'pipe' });
      execFileSync('gsettings', ['set', schema, 'binding', gnomeBinding], { stdio: 'pipe' });
      execFileSync('gsettings', ['set', schema, 'command', command], { stdio: 'pipe' });

      if (!alreadyRegistered) {
        const newBindings = [...existing, keyPath];
        const bindingsStr = "['" + newBindings.join("', '") + "']";
        execFileSync('gsettings', ['set', MEDIA_KEYS_SCHEMA, 'custom-keybindings', bindingsStr], {
          stdio: 'pipe',
        });
      }

      this.registeredSlots.add(slotKey);
      console.log(
        `[GnomeShortcut] Keybinding "${gnomeBinding}" registered for slot "${slotKey}" (${displayName})`
      );
      return true;
    } catch (err) {
      console.warn(`[GnomeShortcut] Failed to register keybinding for slot "${slotKey}":`, err.message);
      return false;
    }
  }

  unregisterSlot(slotKey) {
    const slot = SLOT_CONFIG[slotKey];
    if (!slot) return false;
    const keyPath = slot.path;

    try {
      const existing = this.getExistingKeybindings();
      const filtered = existing.filter((p) => p !== keyPath);
      const bindingsStr = filtered.length > 0 ? "['" + filtered.join("', '") + "']" : '[]';

      execFileSync('gsettings', ['set', MEDIA_KEYS_SCHEMA, 'custom-keybindings', bindingsStr], {
        stdio: 'pipe',
      });

      const schema = `${KEYBINDING_SCHEMA}:${keyPath}`;
      execFileSync('gsettings', ['reset-recursively', schema], { stdio: 'pipe' });

      this.registeredSlots.delete(slotKey);
      console.log(`[GnomeShortcut] Keybinding unregistered for slot "${slotKey}"`);
      return true;
    } catch (err) {
      console.warn(`[GnomeShortcut] Failed to unregister keybinding for slot "${slotKey}":`, err.message);
      return false;
    }
  }

  unregisterAll() {
    for (const slotKey of Object.keys(SLOT_CONFIG)) {
      this.unregisterSlot(slotKey);
    }
  }

  close() {
    this.unregisterAll();
    if (this.httpServer) {
      try {
        this.httpServer.close();
      } catch {}
      this.httpServer = null;
    }
    if (this.bus) {
      try {
        this.bus.connection.end();
      } catch {}
      this.bus = null;
    }
  }
}

module.exports = {
  GnomeShortcutManager,
  bindingToAccelerator,
  createHotkeyRepeatGate,
  ELECTRON_TO_GNOME_KEY_MAP,
  VALID_SHORTCUT_PATTERN,
  SLOT_CONFIG,
};
