import { desktop } from '../services/desktop.js';

export function useShortcuts(workspace) {
  let unsubscribe = null;
  const {
    isBusy,
    state,
    currentView,
    windowState,
    mockSubmit,
    navigate,
    askQuestion,
    captureAndAnswer,
    chooseScreens,
    newSession,
    toggleTransparentMode,
    setTransparentMode,
  } = workspace;

  function onKeydown(event) {
    const modifier = event.ctrlKey || event.metaKey;
    if (modifier && event.shiftKey && event.key.toLowerCase() === 't') {
      event.preventDefault();
      if (!event.repeat) toggleTransparentMode(true);
      return;
    }
    if (event.key === 'Escape' && windowState.transparentMode) {
      event.preventDefault();
      if (!event.repeat) setTransparentMode(false);
      return;
    }
    if (event.repeat || isBusy.value || !state.value || event.isComposing) return;
    if (modifier && event.altKey && !event.shiftKey && event.key === 'Enter') {
      event.preventDefault();
      captureAndAnswer();
      return;
    }
    if (modifier && !event.altKey && event.key === 'Enter') {
      event.preventDefault();
      if (currentView.value === 'mock') mockSubmit.value?.();
      else if (currentView.value === 'assistant') askQuestion();
    }
    if (modifier && !event.shiftKey && event.key.toLowerCase() === 'n') {
      event.preventDefault();
      newSession();
    }
  }

  function onShortcut(event) {
    const type = typeof event === 'string' ? event : event?.type;
    if (type === 'toggle-transparent') return toggleTransparentMode(true);
    if (isBusy.value) return;
    if (type === 'capture') {
      navigate('assistant');
      chooseScreens();
    }
    if (type === 'capture-answer') captureAndAnswer();
    if (type === 'ask') {
      navigate('assistant');
      askQuestion();
    }
    if (type === 'new-session') newSession();
  }

  function register() {
    if (unsubscribe) return;
    unsubscribe = desktop.onShortcut(onShortcut);
    document.addEventListener('keydown', onKeydown);
  }

  function dispose() {
    unsubscribe?.();
    unsubscribe = null;
    document.removeEventListener('keydown', onKeydown);
  }

  return { register, dispose };
}
