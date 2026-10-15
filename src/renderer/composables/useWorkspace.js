import { inject, nextTick, reactive, ref, shallowRef } from 'vue';
import { desktop } from '../services/desktop.js';
import { useAssistant } from './useAssistant.js';
import { useRecorder } from './useRecorder.js';
import { useSessions } from './useSessions.js';
import { useShortcuts } from './useShortcuts.js';
import { errorText, toast } from './useToasts.js';
import { useWindowMode } from './useWindowMode.js';

export const workspaceKey = Symbol('workspace');
const views = new Set(['assistant', 'mock', 'library', 'history', 'settings']);

// The workspace composes shared state and independent features. Page-only form
// state lives with its page, and native capabilities stay behind desktop.js.
export function createWorkspace() {
  const state = ref(null);
  const currentView = ref('assistant');
  const currentMode = ref('text');
  const question = ref('');
  const imageData = ref(null);
  const pendingSource = ref('text');
  const isBusy = ref(false);
  const startupError = ref('');
  const questionInputRef = shallowRef(null);
  const mockSubmit = shallowRef(null);
  const screenPicker = reactive({ open: false, screens: [] });
  let unsubscribeWindow = null;

  function navigate(view) {
    if (views.has(view)) currentView.value = view;
  }

  function setMode(mode) {
    if (['text', 'voice', 'screenshot'].includes(mode)) currentMode.value = mode;
  }

  function focusQuestion() {
    nextTick(() => questionInputRef.value?.focus({ preventScroll: true }));
  }

  async function perform(operation, failure = '操作失败，请重试。') {
    if (isBusy.value) return undefined;
    isBusy.value = true;
    try {
      return await operation();
    } catch (error) {
      toast(errorText(error, failure), true);
      return undefined;
    } finally {
      isBusy.value = false;
    }
  }

  function applyState(next) {
    if (!next || !Array.isArray(next.sessions) || !next.settings) {
      throw new Error('应用返回了无效的数据。');
    }
    windowMode.syncAppearance(next);
    state.value = next;
  }

  const workspace = {
    state,
    currentView,
    currentMode,
    question,
    imageData,
    pendingSource,
    isBusy,
    startupError,
    questionInputRef,
    mockSubmit,
    screenPicker,
    navigate,
    setMode,
    focusQuestion,
    perform,
    applyState,
    toast,
    errorText,
  };
  const windowMode = useWindowMode(workspace);
  const recorder = useRecorder(workspace);
  Object.assign(workspace, windowMode, { recorder, isRecording: recorder.isRecording });
  Object.assign(workspace, useSessions(workspace));
  Object.assign(workspace, useAssistant(workspace));
  const shortcuts = useShortcuts(workspace);

  async function bootstrap() {
    await perform(async () => {
      startupError.value = '';
      try {
        if (!unsubscribeWindow) {
          unsubscribeWindow = desktop.onWindowState(windowMode.applyWindowState);
        }
        const initial = await desktop.bootstrap();
        applyState(initial);
        await windowMode.applyWindowState(initial.windowState);
        await windowMode.applyWindowState(await desktop.getWindowState());
        shortcuts.register();
      } catch (error) {
        startupError.value = errorText(error, '读取本地数据失败。');
        throw error;
      }
    }, '工作空间加载失败。');
  }

  function dispose() {
    windowMode.flushTransparencyAppearance();
    recorder.dispose();
    shortcuts.dispose();
    unsubscribeWindow?.();
    unsubscribeWindow = null;
  }

  return Object.assign(workspace, { bootstrap, dispose });
}

export function useWorkspace() {
  const workspace = inject(workspaceKey);
  if (!workspace) throw new Error('工作空间尚未初始化。');
  return workspace;
}
