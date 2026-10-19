import { isProxy, toRaw } from 'vue';

// Vue proxies cannot cross Electron's structured-clone boundary. Preserve binary
// recordings while copying the small plain objects used by the desktop API.
function ipcValue(value) {
  if (isProxy(value)) value = toRaw(value);
  if (Array.isArray(value)) return value.map(ipcValue);
  if (value && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, ipcValue(item)]));
  }
  return value;
}

function invoke(method, ...args) {
  if (typeof window.desktop?.[method] !== 'function') {
    throw new Error('桌面桥接服务未就绪，请重启应用。');
  }
  return window.desktop[method](...args.map(ipcValue));
}

export const desktop = {
  bootstrap: () => invoke('bootstrap'),
  getWindowState: () => invoke('getWindowState'),
  setTransparentMode: (enabled) => invoke('setTransparentMode', enabled),
  windowControl: (action) => invoke('windowControl', action),
  saveSettings: (patch) => invoke('saveSettings', patch),
  saveModelProfile: (profile) => invoke('saveModelProfile', profile),
  selectModelProfile: (id) => invoke('selectModelProfile', id),
  deleteModelProfile: (id) => invoke('deleteModelProfile', id),
  createSession: (options) => invoke('createSession', options),
  switchSession: (id) => invoke('switchSession', id),
  deleteSession: (id) => invoke('deleteSession', id),
  clearCurrentSession: (id) => invoke('clearCurrentSession', id),
  clearSessions: () => invoke('clearSessions'),
  ask: (question) => invoke('ask', question),
  startPractice: (options) => invoke('startPractice', options),
  appendPractice: (input) => invoke('appendPractice', input),
  reviewPractice: (input) => invoke('reviewPractice', input),
  generateQuestionBank: (options) => invoke('generateQuestionBank', options),
  listScreens: () => invoke('listScreens'),
  captureScreen: (id) => invoke('captureScreen', id),
  captureCurrentScreen: () => invoke('captureCurrentScreen'),
  transcribe: (recording) => invoke('transcribe', recording),
  testConnection: (id) => invoke('testConnection', id),
  exportSession: (id) => invoke('exportSession', id),
  importResume: () => invoke('importResume'),
  showDataFolder: () => invoke('showDataFolder'),
  onWindowState: (callback) => invoke('onWindowState', callback),
  onShortcut: (callback) => invoke('onShortcut', callback),
};
