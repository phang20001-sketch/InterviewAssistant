import { nextTick, reactive, ref } from 'vue';
import { desktop } from '../services/desktop.js';
import { errorText, toast } from './useToasts.js';

const opacityKeys = {
  transparentTextOpacity: 'text',
  transparentBackgroundOpacity: 'background',
};
const fontSizeKey = 'transparentFontSize';

function opacity(value, fallback) {
  return Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : fallback;
}

function fontSize(value, fallback) {
  return Number.isFinite(value) ? Math.max(12, Math.min(32, Math.round(value))) : fallback;
}

export function useWindowMode({ state, navigate, screenPicker, focusQuestion }) {
  const windowState = reactive({ transparentMode: false, isMaximized: false });
  const transparencyAppearance = reactive({ text: 100, background: 0, fontSize: 16 });
  const transparencyPending = ref(false);
  let initialized = false;
  let pendingAppearance = {};
  let saveTimer = null;
  let saveChain = Promise.resolve();
  let lastShortcut = Number.NEGATIVE_INFINITY;

  function syncAppearance(snapshot) {
    if (!initialized) {
      transparencyAppearance.text = opacity(snapshot.settings.transparentTextOpacity, 100);
      transparencyAppearance.background = opacity(
        snapshot.settings.transparentBackgroundOpacity,
        0,
      );
      transparencyAppearance.fontSize = fontSize(snapshot.settings[fontSizeKey], 16);
      initialized = true;
    }
    // Async conversation snapshots must not undo a more recent slider preview.
    for (const [key, name] of Object.entries(opacityKeys)) {
      snapshot.settings[key] = transparencyAppearance[name];
      document.documentElement.style.setProperty(
        `--transparent-${name}-opacity`,
        String(transparencyAppearance[name] / 100),
      );
    }
    snapshot.settings[fontSizeKey] = transparencyAppearance.fontSize;
    document.documentElement.style.setProperty(
      '--transparent-font-size',
      `${transparencyAppearance.fontSize}px`,
    );
  }

  function flushTransparencyAppearance() {
    clearTimeout(saveTimer);
    saveTimer = null;
    if (!Object.keys(pendingAppearance).length) return saveChain;
    const patch = pendingAppearance;
    pendingAppearance = {};
    saveChain = saveChain.then(async () => {
      try {
        await desktop.saveSettings(patch);
      } catch (error) {
        toast(errorText(error, '透明模式设置保存失败，请重新调整后重试。'), true);
      }
    });
    return saveChain;
  }

  function changeTransparencyAppearance(key, value) {
    const isFontSize = key === fontSizeKey;
    const name = isFontSize ? 'fontSize' : opacityKeys[key];
    if (!state.value || !initialized || !name) return;
    const normalize = isFontSize ? fontSize : opacity;
    const next = normalize(Number(value), transparencyAppearance[name]);
    transparencyAppearance[name] = next;
    state.value.settings[key] = next;
    pendingAppearance[key] = next;
    document.documentElement.style.setProperty(
      isFontSize ? '--transparent-font-size' : `--transparent-${name}-opacity`,
      isFontSize ? `${next}px` : String(next / 100),
    );
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flushTransparencyAppearance, 180);
  }

  async function applyWindowState(next) {
    if (!next || typeof next !== 'object') return;
    const entering = next.transparentMode === true && !windowState.transparentMode;
    if (typeof next.transparentMode === 'boolean') {
      if (next.transparentMode !== windowState.transparentMode) lastShortcut = performance.now();
      windowState.transparentMode = next.transparentMode;
    }
    if (typeof next.isMaximized === 'boolean') windowState.isMaximized = next.isMaximized;
    document.body.classList.toggle('transparent-mode', windowState.transparentMode);
    document.documentElement.classList.toggle('transparent-mode', windowState.transparentMode);
    if (windowState.transparentMode) {
      screenPicker.open = false;
      navigate('assistant');
      if (entering) {
        await nextTick();
        focusQuestion();
      }
    }
  }

  async function setTransparentMode(enabled) {
    if (transparencyPending.value || enabled === windowState.transparentMode) return;
    transparencyPending.value = true;
    try {
      await applyWindowState(await desktop.setTransparentMode(enabled));
    } catch (error) {
      toast(errorText(error, '切换透明模式失败。'), true);
    } finally {
      transparencyPending.value = false;
    }
  }

  function toggleTransparentMode(fromShortcut = false) {
    if (fromShortcut) {
      const now = performance.now();
      if (now - lastShortcut < 250) return;
      lastShortcut = now;
    }
    return setTransparentMode(!windowState.transparentMode);
  }

  async function controlWindow(action) {
    try {
      if (action === 'close') await flushTransparencyAppearance();
      await applyWindowState(await desktop.windowControl(action));
    } catch (error) {
      toast(errorText(error, '窗口操作失败。'), true);
    }
  }

  return {
    windowState,
    transparencyAppearance,
    transparencyPending,
    syncAppearance,
    applyWindowState,
    changeTransparencyAppearance,
    flushTransparencyAppearance,
    setTransparentMode,
    toggleTransparentMode,
    controlWindow,
  };
}
