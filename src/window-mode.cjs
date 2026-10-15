// A transparent native surface is created once; switching modes keeps the same
// webContents, draft text, media stream, and pending model request alive.
function createWindowModeController(window, screen, applySettings) {
  let transparentMode = false;
  let manualMaximized = false;
  let restoreBounds = window.getBounds();
  let wasMaximized = false;
  let unmaximizedBounds = null;
  let changingBounds = false;
  let lastModeChange = 0;

  function state() {
    return { transparentMode, isMaximized: manualMaximized || window.isMaximized() };
  }

  function publish() {
    if (!window.isDestroyed() && !window.webContents.isDestroyed())
      window.webContents.send('studio:window-state', state());
  }

  function setBounds(bounds) {
    changingBounds = true;
    try {
      window.setBounds(bounds);
    } finally {
      changingBounds = false;
    }
  }

  function maximize() {
    unmaximizedBounds = window.getBounds();
    manualMaximized = true;
    setBounds(screen.getDisplayMatching(unmaximizedBounds).workArea);
  }

  function setTransparentMode(enabled) {
    if (typeof enabled !== 'boolean') throw new Error('透明模式参数无效。');
    if (window.isDestroyed()) throw new Error('窗口已关闭。');
    if (enabled === transparentMode) return state();
    lastModeChange = Date.now();
    if (enabled) {
      wasMaximized = manualMaximized || window.isMaximized();
      restoreBounds = manualMaximized ? { ...unmaximizedBounds } : window.getNormalBounds();
      const area = screen.getDisplayMatching(window.getBounds()).workArea;
      const width = Math.min(760, area.width);
      const height = Math.min(620, area.height);
      const x = Math.max(
        area.x,
        Math.min(
          Math.round(restoreBounds.x + (restoreBounds.width - width) / 2),
          area.x + area.width - width,
        ),
      );
      const y = Math.max(area.y, Math.min(restoreBounds.y + 36, area.y + area.height - height));
      transparentMode = true;
      manualMaximized = false;
      if (window.isMaximized()) window.unmaximize();
      window.setMinimumSize(Math.min(480, width), Math.min(320, height));
      // Electron transparent windows need a fixed native size while transparent.
      window.setResizable(false);
      window.setMaximizable(false);
      setBounds({ x, y, width, height });
    } else {
      transparentMode = false;
      window.setResizable(true);
      window.setMaximizable(true);
      window.setMinimumSize(1000, 700);
      setBounds(restoreBounds);
      if (wasMaximized) maximize();
    }
    window.setBackgroundColor('#00000000');
    applySettings();
    publish();
    return state();
  }

  function control(action) {
    if (window.isDestroyed()) throw new Error('窗口已关闭。');
    if (action === 'minimize') window.minimize();
    else if (action === 'toggle-maximize') {
      if (!transparentMode) {
        if (manualMaximized) {
          manualMaximized = false;
          setBounds(unmaximizedBounds || restoreBounds);
        } else if (window.isMaximized()) window.unmaximize();
        else maximize();
      }
    } else if (action === 'close') {
      setImmediate(() => {
        if (!window.isDestroyed()) window.close();
      });
    } else throw new Error('不支持的窗口操作。');
    publish();
    return state();
  }

  window.on('resize', () => {
    if (manualMaximized && !changingBounds) {
      const bounds = window.getBounds();
      const area = screen.getDisplayMatching(bounds).workArea;
      if (Math.abs(bounds.width - area.width) > 2 || Math.abs(bounds.height - area.height) > 2)
        manualMaximized = false;
    }
    publish();
  });
  window.on('maximize', publish);
  window.on('unmaximize', publish);
  window.on('restore', publish);
  return {
    state,
    setTransparentMode,
    control,
    recentlyChanged: () => Date.now() - lastModeChange < 300,
  };
}

module.exports = { createWindowModeController };
