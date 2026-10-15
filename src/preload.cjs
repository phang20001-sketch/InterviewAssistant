const { contextBridge, ipcRenderer } = require('electron');
const invoke = (channel, ...args) => ipcRenderer.invoke('studio:' + channel, ...args);
contextBridge.exposeInMainWorld('desktop', {
  bootstrap: () => invoke('bootstrap'),
  getWindowState: () => invoke('get-window-state'),
  setTransparentMode: (enabled) => invoke('set-transparent-mode', enabled),
  windowControl: (action) => invoke('window-control', action),
  saveSettings: (patch) => invoke('save-settings', patch),
  saveModelProfile: (profile) => invoke('save-model-profile', profile),
  selectModelProfile: (id) => invoke('select-model-profile', id),
  deleteModelProfile: (id) => invoke('delete-model-profile', id),
  createSession: (options) => invoke('create-session', options),
  switchSession: (id) => invoke('switch-session', id),
  deleteSession: (id) => invoke('delete-session', id),
  clearSessions: () => invoke('clear-sessions'),
  ask: (question) => invoke('ask', question),
  startPractice: (options) => invoke('start-practice', options),
  appendPractice: (input) => invoke('append-practice', input),
  reviewPractice: (input) => invoke('review-practice', input),
  generateQuestionBank: (options) => invoke('generate-question-bank', options),
  listScreens: () => invoke('list-screens'),
  captureScreen: (id) => invoke('capture-screen', id),
  captureCurrentScreen: () => invoke('capture-current-screen'),
  transcribe: (recording) => invoke('transcribe', recording),
  testConnection: (id) => invoke('test-connection', id),
  exportSession: (id) => invoke('export-session', id),
  importResume: () => invoke('import-resume'),
  showDataFolder: () => invoke('show-data-folder'),
  onWindowState: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('studio:window-state', listener);
    return () => ipcRenderer.removeListener('studio:window-state', listener);
  },
  onShortcut: (callback) => {
    const listener = (_event, action) => callback(action);
    ipcRenderer.on('studio:shortcut', listener);
    return () => ipcRenderer.removeListener('studio:shortcut', listener);
  },
});
