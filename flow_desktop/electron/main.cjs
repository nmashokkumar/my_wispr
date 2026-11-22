const path = require('path');
const { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, screen, clipboard } = require('electron');
const { spawnSync } = require('child_process');
const fs = require('fs');
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
    try {
      await win.loadFile(distIndex, loadOptions);
    } catch (err) {
      console.error(`[Flow Daemon] Failed to load bundle: ${err.message}`);
    }
  } else {
    console.error(`[Flow Daemon] Production bundle not found at: ${distIndex}. Please run 'npm run build'.`);
  }
}

// Determine socket path for ydotool daemon
function getYdotoolSocket() {
  const uid = process.getuid ? process.getuid() : null;
  const candidates = [
    process.env.YDOTOOL_SOCKET,
    uid !== null ? `/run/user/${uid}/.ydotool_socket` : null,
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

// Trigger dictation across overlay and main windows
function triggerDictation(mode = 'hands_free') {
  console.log(`[Flow Daemon] Dictation triggered globally: mode=${mode}`);
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.showInactive();
    overlayWindow.webContents.send('dictation-trigger', { mode });
  }
}

// Fixed center-bottom position higher than the Ubuntu dock / taskbar
function getOverlayBounds(width = 240, height = 56) {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { bounds } = primaryDisplay;

  // Horizontal center
  const x = Math.round(bounds.x + (bounds.width - width) / 2);

  // Position comfortably above the bottom dock:
  // Ubuntu taskbar/dock is 48-72px, plus hover expansion.
  // 100px from the bottom edge ensures it is never covered or hidden when opening the dock.
  const bottomOffset = 100;
  const y = bounds.y + bounds.height - height - bottomOffset;

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
  const { x, y, width, height } = getOverlayBounds(240, 56);

  overlayWindow = new BrowserWindow({
    x,
    y,
    width,
    height,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    resizable: false,
    movable: false, // User requested: fixed, not draggable!
    hasShadow: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
      allowRunningInsecureContent: true,
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
      click: () => {
        triggerDictation('hands_free');
      },
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

  tray.setToolTip('Wispr Flow - Background Dictation');
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

// Register global shortcuts
function registerShortcuts(pttBinding, hfBinding) {
  // Clear any existing globalShortcuts
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

  // 1. Electron globalShortcut fallback (works in X11 / XWayland)
  try {
    const pttOk = globalShortcut.register(pttAcc, () => {
      console.log(`[Flow Daemon] Push-to-Talk hotkey triggered (globalShortcut): ${pttAcc}`);
      triggerDictation('push_to_talk');
    });
    if (pttOk) {
      activePttAccelerator = pttAcc;
      console.log(`[Flow Daemon] Successfully registered PTT shortcut: ${pttAcc}`);
    } else {
      console.warn(`[Flow Daemon] Could not register PTT shortcut: ${pttAcc}`);
    }
  } catch (err) {
    console.error(`[Flow Daemon] Error registering PTT shortcut:`, err);
  }

  try {
    const hfOk = globalShortcut.register(hfAcc, () => {
      console.log(`[Flow Daemon] Hands-Free hotkey triggered (globalShortcut): ${hfAcc}`);
      triggerDictation('hands_free');
    });
    if (hfOk) {
      activeHfAccelerator = hfAcc;
      console.log(`[Flow Daemon] Successfully registered Hands-Free shortcut: ${hfAcc}`);
    } else {
      console.warn(`[Flow Daemon] Could not register Hands-Free shortcut: ${hfAcc}`);
    }
  } catch (err) {
    console.error(`[Flow Daemon] Error registering Hands-Free shortcut:`, err);
  }

  // 2. Robust GNOME / Ubuntu Wayland registration via gsettings
  // Intercepted at compositor level so it works anywhere in any application where user can type
  if (gnomeManager && GnomeShortcutManager.isGnome()) {
    try {
      const gnomeHf = GnomeShortcutManager.convertToGnomeFormat(hfAcc);
      if (gnomeHf) {
        gnomeManager.registerSlot('hf', gnomeHf);
      }
    } catch (err) {
      console.warn('[Flow Daemon] Failed to register GNOME Hands-Free shortcut:', err);
    }

    try {
      const gnomePtt = GnomeShortcutManager.convertToGnomeFormat(pttAcc);
      if (gnomePtt) {
        gnomeManager.registerSlot('ptt', gnomePtt);
      }
    } catch (err) {
      console.warn('[Flow Daemon] Failed to register GNOME PTT shortcut:', err);
    }
  }

  return {
    success: true,
    pttAcc: activePttAccelerator || pttAcc,
    hfAcc: activeHfAccelerator || hfAcc,
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
          console.log('[Flow Daemon] Injected via ydotool (Shift+Insert)');
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

    setupIpcHandlers();
    createTray();
    createOverlayWindow();
    createMainWindow();

    // Initialize GNOME / Wayland global shortcuts manager
    gnomeManager = new GnomeShortcutManager({
      onDictationTrigger: (mode) => triggerDictation(mode),
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
      { code: 'Space', ctrl: true, alt: false, shift: false, meta: false },
      { code: 'Space', ctrl: true, alt: true, shift: false, meta: false }
    );

    // Keep overlay positioned correctly if screen resolution / work area changes
    screen.on('display-metrics-changed', () => {
      if (overlayWindow && !overlayWindow.isDestroyed()) {
        const bounds = getOverlayBounds(240, 56);
        overlayWindow.setBounds(bounds);
      }
    });

    console.log('[Flow Daemon] Ready in background.');
  });

  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
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
