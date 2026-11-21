const path = require('path');
const { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, screen, clipboard } = require('electron');
const { spawnSync } = require('child_process');
const fs = require('fs');

// Linux sandbox switches to prevent SUID sandbox errors in local dev
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu-sandbox');

let mainWindow = null;
let overlayWindow = null;
let tray = null;
let isQuitting = false;

// Active registered accelerators
let activePttAccelerator = null;
let activeHfAccelerator = null;

// Determine socket path for ydotool daemon
function getYdotoolSocket() {
  const uid = process.getuid ? process.getuid() : null;
  const candidates = [
    process.env.YDOTOOL_SOCKET,
    uid !== null ? `/run/user/${uid}/.ydotool_socket` : null,
    '/tmp/.ydotool_socket'
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
    // Solo Fn key is handled by mapping to a standard default accelerator on Linux desktop
    return parts.length > 0 ? [...parts, 'Space'].join('+') : 'Control+Space';
  } else if (/^(Control|Alt|Shift|Meta)(Left|Right)?$/.test(key)) {
    // Solo modifier key press
    return 'Control+Space';
  }

  // If key wasn't empty, append it
  if (key && !parts.includes(key)) {
    parts.push(key);
  }

  if (parts.length === 0) return null;
  return parts.join('+');
}

// Fixed center-bottom position higher than the Ubuntu dock / taskbar
function getOverlayBounds(width = 240, height = 56) {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { bounds, workArea } = primaryDisplay;

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
    },
  });

  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    console.log(`[MainWindow Console] [${level}] ${message} (${sourceId}:${line})`);
  });
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error(`[MainWindow Load Error] ${errorCode} (${errorDescription}) on ${validatedURL}`);
    if (validatedURL && validatedURL.includes('localhost:3000')) {
      const indexPath = path.join(__dirname, '..', 'dist', 'index.html');
      if (fs.existsSync(indexPath)) {
        console.log('[MainWindow] Falling back to local built bundle:', indexPath);
        mainWindow.loadFile(indexPath);
      }
    }
  });

  const devUrl = 'http://localhost:3000';
  mainWindow.loadURL(devUrl).catch(() => {
    // Fallback to built dist if Vite dev server is not active
    const indexPath = path.join(__dirname, '..', 'dist', 'index.html');
    if (fs.existsSync(indexPath)) {
      mainWindow.loadFile(indexPath);
    }
  });

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
    if (validatedURL && validatedURL.includes('localhost:3000')) {
      const indexPath = path.join(__dirname, '..', 'dist', 'index.html');
      if (fs.existsSync(indexPath)) {
        console.log('[Overlay] Falling back to local built bundle:', indexPath);
        overlayWindow.loadFile(indexPath, { hash: '/overlay' });
      }
    }
  });

  const devOverlayUrl = 'http://localhost:3000/#/overlay';
  overlayWindow.loadURL(devOverlayUrl).catch(() => {
    const indexPath = path.join(__dirname, '..', 'dist', 'index.html');
    if (fs.existsSync(indexPath)) {
      overlayWindow.loadFile(indexPath, { hash: '/overlay' });
    }
  });

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
        if (overlayWindow && !overlayWindow.isDestroyed()) {
          overlayWindow.showInactive();
          overlayWindow.webContents.send('dictation-trigger', { mode: 'hands_free' });
        }
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
  // Clear any existing
  if (activePttAccelerator) {
    globalShortcut.unregister(activePttAccelerator);
    activePttAccelerator = null;
  }
  if (activeHfAccelerator) {
    globalShortcut.unregister(activeHfAccelerator);
    activeHfAccelerator = null;
  }

  const pttAcc = bindingToAccelerator(pttBinding) || 'Control+Space';
  const hfAcc = bindingToAccelerator(hfBinding) || 'Control+Alt+Space';

  // Register Push-to-Talk shortcut
  try {
    const pttOk = globalShortcut.register(pttAcc, () => {
      console.log(`[Flow Daemon] Push-to-Talk hotkey triggered: ${pttAcc}`);
      if (overlayWindow && !overlayWindow.isDestroyed()) {
        overlayWindow.showInactive();
        overlayWindow.webContents.send('dictation-trigger', { mode: 'push_to_talk' });
      }
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

  // Register Hands-Free shortcut
  try {
    const hfOk = globalShortcut.register(hfAcc, () => {
      console.log(`[Flow Daemon] Hands-Free hotkey triggered: ${hfAcc}`);
      if (overlayWindow && !overlayWindow.isDestroyed()) {
        overlayWindow.showInactive();
        overlayWindow.webContents.send('dictation-trigger', { mode: 'hands_free' });
      }
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

  return {
    success: true,
    pttAcc: activePttAccelerator,
    hfAcc: activeHfAccelerator,
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
  });

  app.on('window-all-closed', (e) => {
    // Do not quit when windows are closed; keep daemon alive in tray
    e.preventDefault();
  });
}
