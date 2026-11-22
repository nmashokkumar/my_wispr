const path = require('path');
const { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, screen, clipboard, session } = require('electron');
const { spawnSync } = require('child_process');
const fs = require('fs');
const LinuxKeyManager = require('./linuxKeyManager.cjs');
const GnomeGlobalShortcutsPortal = require('./gnomeGlobalShortcutsPortal.cjs');
const { GnomeShortcutManager, bindingToAccelerator } = require('./gnomeShortcut.cjs');

// Linux sandbox switches to prevent SUID sandbox errors in local dev
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu-sandbox');
app.commandLine.appendSwitch('allow-file-access-from-files');

let mainWindow = null;
let overlayWindow = null;
let tray = null;
let isQuitting = false;
let gnomeManager = null;
let gnomePortal = null;
let linuxKeyManager = null;

// Active registered accelerators
let activePttAccelerator = null;
let activeHfAccelerator = null;

// Robust content loader: connects to Vite dev server if active, with instant fallback to production bundle
async function loadWindowContent(win, hash = '') {
  const distIndex = path.join(__dirname, '..', 'dist', 'index.html');
  const targetHash = hash ? (hash.startsWith('/') ? hash.slice(1) : hash) : '';
  const devUrl = `http://127.0.0.1:3000${targetHash ? '#/' + targetHash : ''}`;

  // Check if local Vite dev server is responding
  let isDevRunning = false;
  try {
    const http = require('http');
    isDevRunning = await new Promise((resolve) => {
      const req = http.get('http://127.0.0.1:3000', { timeout: 800 }, (res) => {
        resolve(res.statusCode >= 200 && res.statusCode < 400);
      });
      req.on('error', () => resolve(false));
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });
    });
  } catch {
    isDevRunning = false;
  }

  if (isDevRunning) {
    console.log(`[Flow Daemon] Connecting window to Vite dev server: ${devUrl}`);
    try {
      await win.loadURL(devUrl);
      return;
    } catch (err) {
      console.warn(`[Flow Daemon] Failed to load Vite dev URL (${err.message}), falling back to built bundle.`);
    }
  }

  // Load production bundle directly via file://
  if (fs.existsSync(distIndex)) {
    console.log(`[Flow Daemon] Loading local bundle: ${distIndex}${targetHash ? ' hash=/' + targetHash : ''}`);
    const loadOptions = targetHash
      ? { hash: '/' + targetHash, query: { overlay: 'true' } }
      : {};
    await win.loadFile(distIndex, loadOptions);
  } else {
    console.error(`[Flow Daemon] ERROR: Neither Vite dev server nor built bundle (${distIndex}) is available.`);
  }
}

// Locate active ydotool socket for Wayland background typing
function getYdotoolSocket() {
  const candidates = [
    process.env.YDOTOOL_SOCKET,
    '/run/user/' + process.getuid() + '/ydotool_socket',
    '/run/user/' + process.getuid() + '/.ydotool_socket',
    '/tmp/.ydotool_socket',
  ].filter(Boolean);

  for (const sock of candidates) {
    try {
      fs.accessSync(sock, fs.constants.W_OK);
      return sock;
    } catch {
      // continue
    }
  }
  return null;
}

// Dictation lifecycle triggers
function handleDictationStart(mode = 'push_to_talk') {
  console.log(`[Flow Daemon] Dictation START: mode=${mode}`);
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.showInactive();
    overlayWindow.webContents.send('dictation-start', { mode });
  } else if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('dictation-start', { mode });
  }
}

function handleDictationStop(mode = 'push_to_talk') {
  console.log(`[Flow Daemon] Dictation STOP: mode=${mode}`);
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('dictation-stop', { mode });
  } else if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('dictation-stop', { mode });
  }
}

function handleDictationToggle(mode = 'hands_free') {
  console.log(`[Flow Daemon] Dictation TOGGLE: mode=${mode}`);
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.showInactive();
    overlayWindow.webContents.send('dictation-toggle', { mode });
  } else if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('dictation-toggle', { mode });
  }
}

// Center-bottom overlay position respecting the Ubuntu dock / workArea
function getOverlayBounds(width = 240, height = 54) {
  const primaryDisplay = screen.getPrimaryDisplay();
  const workArea = primaryDisplay.workArea || primaryDisplay.bounds;

  // Horizontal center within active workArea
  const x = Math.round(workArea.x + (workArea.width - width) / 2);

  // 14px margin directly above workArea bottom edge (right above the dock/taskbar)
  const margin = 14;
  const y = Math.round(workArea.y + workArea.height - height - margin);

  return { x, y, width, height };
}

// Create the main settings / dashboard window
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 980,
    height: 700,
    minWidth: 780,
    minHeight: 560,
    title: 'Wispr Flow',
    backgroundColor: '#0F0F11',
    show: false, // Starts minimized to tray by default
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
      allowRunningInsecureContent: true,
    },
  });

  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    console.log(`[MainWindow Console] [${level}] ${message} (${sourceId}:${line})`);
  });
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error(`[MainWindow Load Error] ${errorCode} (${errorDescription}) on ${validatedURL}`);
    if (validatedURL && (validatedURL.includes('127.0.0.1:3000') || validatedURL.includes('localhost:3000'))) {
      const indexPath = path.join(__dirname, '..', 'dist', 'index.html');
      if (fs.existsSync(indexPath)) {
        console.log('[MainWindow] Falling back to local built bundle:', indexPath);
        mainWindow.loadFile(indexPath);
      }
    }
  });

  loadWindowContent(mainWindow);

  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

// Create the floating overlay pill window
function createOverlayWindow() {
  const { x, y, width, height } = getOverlayBounds(240, 54);

  overlayWindow = new BrowserWindow({
    x,
    y,
    width,
    height,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false, // Prevents stealing keyboard cursor/focus from active window!
    resizable: false,
    movable: false,
    hasShadow: false,
    show: false,
    acceptFirstMouse: true,
    type: 'toolbar', // Wayland / X11 unmanaged toolbar / notification type
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
      allowRunningInsecureContent: true,
      backgroundThrottling: false, // Prevents animation freezing when unfocused
    },
  });

  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlayWindow.setAlwaysOnTop(true, 'screen-saver');

  // Start with click-through enabled
  overlayWindow.setIgnoreMouseEvents(true, { forward: true });

  overlayWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    console.log(`[Overlay Console] [${level}] ${message} (${sourceId}:${line})`);
  });
  overlayWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error(`[Overlay Load Error] ${errorCode} (${errorDescription}) on ${validatedURL}`);
    if (validatedURL && (validatedURL.includes('127.0.0.1:3000') || validatedURL.includes('localhost:3000'))) {
      const indexPath = path.join(__dirname, '..', 'dist', 'index.html');
      if (fs.existsSync(indexPath)) {
        console.log('[Overlay] Falling back to local built bundle:', indexPath);
        overlayWindow.loadFile(indexPath, { hash: '/overlay' });
      }
    }
  });

  loadWindowContent(overlayWindow, 'overlay');

  overlayWindow.on('closed', () => {
    overlayWindow = null;
  });
}

// Create System Tray
function createTray() {
  const iconPath = path.join(__dirname, '..', 'public', 'assets', 'tray', 'TrayIconWindows.png');
  tray = new Tray(iconPath);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Wispr Flow',
      enabled: false,
    },
    { type: 'separator' },
    {
      label: 'Open Dashboard & Settings',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    {
      label: 'Toggle Dictation (Hands-Free)',
      click: () => handleDictationToggle('hands_free'),
    },
    {
      label: 'Toggle Dictation (Push-to-Talk)',
      click: () => handleDictationToggle('push_to_talk'),
    },
    { type: 'separator' },
    {
      label: 'Quit Wispr Flow',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setToolTip('Wispr Flow — Voice Dictation Daemon');
  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    }
  });
}

function isEligibleAccelerator(acc) {
  if (!acc || typeof acc !== 'string') return false;
  if (/^(Control|Alt|Shift|Super|Meta)(Left|Right)?$/i.test(acc)) return false;
  return true;
}

// Register global shortcuts
async function registerShortcuts(pttBinding, hfBinding) {
  console.log('[Flow Daemon] Registering shortcuts:', { ptt: pttBinding, hf: hfBinding });

  // Clear existing accelerators
  if (activePttAccelerator) {
    try {
      globalShortcut.unregister(activePttAccelerator);
    } catch {}
    activePttAccelerator = null;
  }
  if (activeHfAccelerator) {
    try {
      globalShortcut.unregister(activeHfAccelerator);
    } catch {}
    activeHfAccelerator = null;
  }

  const pttAcc = bindingToAccelerator(pttBinding) || 'Control+Space';
  const hfAcc = bindingToAccelerator(hfBinding) || 'Control+Alt+Space';

  // 1. Setup Linux low-level evdev key listener (supports RightControl, RightAlt, Fn, etc.)
  if (linuxKeyManager) {
    let pttKey = 'RightControl';
    if (pttBinding && pttBinding.code) {
      if (pttBinding.code === 'ControlRight') pttKey = 'RightControl';
      else if (pttBinding.code === 'ControlLeft') pttKey = 'Control';
      else if (pttBinding.code === 'AltRight') pttKey = 'RightAlt';
      else if (pttBinding.code === 'AltLeft') pttKey = 'Alt';
      else if (pttBinding.code === 'ShiftRight') pttKey = 'RightShift';
      else if (pttBinding.code === 'ShiftLeft') pttKey = 'Shift';
      else if (pttBinding.code === 'MetaRight') pttKey = 'RightSuper';
      else if (pttBinding.code === 'Fn' || pttBinding.code === 'WakeUp') pttKey = 'Fn';
      else pttKey = pttAcc;
    }
    linuxKeyManager.setKeys([pttKey]);
  }

  // 2. Setup Gnome Global Shortcuts Portal (Wayland compositor-level key-down and key-up)
  if (gnomePortal) {
    try {
      const portalTrigger = hfAcc.toUpperCase().replace(/\s+/g, '');
      await gnomePortal.registerKeybinding(portalTrigger, (_hotkey, phase) => {
        if (phase === 'down') {
          handleDictationToggle('hands_free');
        }
      });
    } catch (err) {
      console.log('[Flow Daemon] Global shortcuts portal bind note:', err.message);
    }
  }

  // 3. Setup Electron globalShortcut fallback
  const eligibleHf = isEligibleAccelerator(hfAcc) ? hfAcc : 'Control+Alt+Space';
  try {
    const hfOk = globalShortcut.register(eligibleHf, () => {
      console.log(`[Flow Daemon] Hands-Free hotkey triggered (globalShortcut): ${eligibleHf}`);
      handleDictationToggle('hands_free');
    });
    if (hfOk) activeHfAccelerator = eligibleHf;
  } catch (err) {
    console.warn('[Flow Daemon] Error registering globalShortcut for HF:', err);
  }

  // 4. Setup GNOME media-keys (gsettings custom-keybinding)
  if (gnomeManager && GnomeShortcutManager.isGnome()) {
    try {
      let gnomeHf = GnomeShortcutManager.convertToGnomeFormat(hfAcc);
      if (!gnomeHf || !GnomeShortcutManager.isValidShortcut(gnomeHf)) {
        gnomeHf = '<Control><Alt>space';
      }
      gnomeManager.registerSlot('hf', gnomeHf);
    } catch (err) {
      console.warn('[Flow Daemon] Failed to register GNOME Hands-Free shortcut:', err);
    }

    try {
      let gnomePtt = GnomeShortcutManager.convertToGnomeFormat(pttAcc);
      // GNOME does not support solo modifiers; provide a reliable combo fallback
      if (!gnomePtt || !GnomeShortcutManager.isValidShortcut(gnomePtt)) {
        gnomePtt = '<Control><Shift>space';
      }
      gnomeManager.registerSlot('ptt', gnomePtt);
    } catch (err) {
      console.warn('[Flow Daemon] Failed to register GNOME PTT shortcut:', err);
    }
  }

  return {
    success: true,
    pttAcc,
    hfAcc,
  };
}

// Linux Smart Paste text injection into the active focused window
function injectTextIntoActiveWindow(text) {
  if (!text) return { success: false, error: 'Empty text' };

  console.log(`[Flow Daemon] Injecting text: "${text.slice(0, 30)}..."`);

  // 1. Write text to Wayland & X11 clipboard
  clipboard.writeText(text);
  clipboard.writeText(text, 'selection'); // Primary selection for terminals

  // Also write via wl-copy for native Wayland clients
  try {
    spawnSync('wl-copy', ['--', text], { timeout: 200 });
    spawnSync('wl-copy', ['--primary', '--', text], { timeout: 200 });
  } catch {
    // Ignore if wl-copy is absent
  }

  // 2. Wait a brief delay for clipboard buffer to settle
  setTimeout(() => {
    const ydotoolSocket = getYdotoolSocket();
    let pasted = false;

    // A. Use ydotool with Shift+Insert (Universal Linux paste, works in Terminal + GUI)
    if (ydotoolSocket) {
      try {
        const env = { ...process.env, YDOTOOL_SOCKET: ydotoolSocket };
        // 42 = Shift, 110 = Insert
        const res = spawnSync('ydotool', ['key', '42:1', '110:1', '110:0', '42:0'], { env, timeout: 500 });
        if (res.status === 0) {
          pasted = true;
          console.log('[Flow Daemon] Injected via ydotool Shift+Insert');
        }
      } catch (err) {
        console.warn('[Flow Daemon] ydotool key failed:', err);
      }
    }

    // B. Fallback: ydotool type if keycodes were rejected
    if (!pasted && ydotoolSocket) {
      try {
        const env = { ...process.env, YDOTOOL_SOCKET: ydotoolSocket };
        const res = spawnSync('ydotool', ['type', text], { env, timeout: 2000 });
        if (res.status === 0) {
          pasted = true;
          console.log('[Flow Daemon] Injected via ydotool type');
        }
      } catch (err) {
        console.warn('[Flow Daemon] ydotool type failed:', err);
      }
    }

    if (!pasted) {
      console.log('[Flow Daemon] Clipboard updated. Auto-paste simulated where supported.');
    }
  }, 60);

  return { success: true };
}

// IPC Handlers
function setupIpcHandlers() {
  ipcMain.handle('update-hotkeys', (_event, hotkeys) => {
    if (!hotkeys) return { success: false };
    return registerShortcuts(hotkeys.pushToTalk, hotkeys.handsFree);
  });

  ipcMain.handle('inject-text', (_event, text) => {
    return injectTextIntoActiveWindow(text);
  });

  ipcMain.on('set-ignore-mouse-events', (_event, ignore, options) => {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.setIgnoreMouseEvents(Boolean(ignore), options || { forward: true });
    }
  });

  ipcMain.on('show-overlay', () => {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.showInactive();
    }
  });

  ipcMain.on('hide-overlay', () => {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.hide();
    }
  });

  ipcMain.on('show-dashboard', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    console.log('[Flow Daemon] Wispr Flow background daemon initializing...');

    // Explicitly grant microphone permissions to all windows
    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
      if (permission === 'media') {
        return callback(true);
      }
      callback(true);
    });
    session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
      if (permission === 'media') {
        return true;
      }
      return true;
    });

    setupIpcHandlers();
    createTray();
    createOverlayWindow();
    createMainWindow();

    // 1. Initialize Linux evdev low-level key listener
    linuxKeyManager = new LinuxKeyManager();
    linuxKeyManager.on('key-down', (key) => {
      console.log(`[Flow Daemon] Linux low-level key-down: ${key}`);
      handleDictationStart('push_to_talk');
    });
    linuxKeyManager.on('key-up', (key) => {
      console.log(`[Flow Daemon] Linux low-level key-up: ${key}`);
      handleDictationStop('push_to_talk');
    });
    linuxKeyManager.on('permission-denied', () => {
      console.log('[Flow Daemon] Note: To enable kernel-level Push-to-Talk (Right Ctrl/Fn), run: sudo usermod -aG input $USER');
    });

    // 2. Initialize GNOME Wayland Global Shortcuts Portal
    gnomePortal = new GnomeGlobalShortcutsPortal();
    gnomePortal.init().catch(() => {});

    // 3. Initialize GNOME custom-keybinding (media-keys) manager
    gnomeManager = new GnomeShortcutManager({
      onDictationTrigger: (mode) => {
        if (mode === 'push_to_talk') {
          handleDictationToggle('push_to_talk');
        } else {
          handleDictationToggle('hands_free');
        }
      },
      onShowDashboard: () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.show();
          mainWindow.focus();
        }
      },
      onHideOverlay: () => {
        if (overlayWindow && !overlayWindow.isDestroyed()) {
          overlayWindow.hide();
        }
      },
    });
    gnomeManager.init();

    // Default initial hotkeys
    registerShortcuts(
      { code: 'ControlRight', ctrl: false, alt: false, shift: false, meta: false },
      { code: 'Space', ctrl: true, alt: true, shift: false, meta: false }
    );

    // Keep overlay positioned correctly if screen resolution / work area changes
    screen.on('display-metrics-changed', () => {
      if (overlayWindow && !overlayWindow.isDestroyed()) {
        const bounds = getOverlayBounds(240, 54);
        overlayWindow.setBounds(bounds);
      }
    });

    console.log('[Flow Daemon] Ready in background.');
  });

  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
    if (linuxKeyManager) {
      linuxKeyManager.stop();
      linuxKeyManager = null;
    }
    if (gnomePortal) {
      gnomePortal.close().catch(() => {});
      gnomePortal = null;
    }
    if (gnomeManager) {
      gnomeManager.close();
      gnomeManager = null;
    }
  });

  app.on('window-all-closed', (e) => {
    // Do not quit when windows are closed; keep daemon alive in tray
    e.preventDefault();
  });
}
