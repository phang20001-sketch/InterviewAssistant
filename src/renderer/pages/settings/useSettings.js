import { computed, reactive, ref, watch } from 'vue';
import { useWorkspace } from '../../composables/useWorkspace.js';
import { desktop } from '../../services/desktop.js';

const textDefaults = {
  transcriptionBaseUrl: '',
  transcriptionModel: 'whisper-1',
  role: '',
  language: '简体中文',
  answerStyle: 'concise',
  resume: '',
  experienceLevel: 'unspecified',
  targetCompany: '',
  jobDescription: '',
  interviewType: 'mixed',
  interviewDifficulty: 'standard',
  focusAreas: '',
  improvementGoals: '',
  additionalRequirements: '',
};
const textKeys = Object.keys(textDefaults);
const checkboxKeys = ['alwaysOnTop', 'contentProtection'];
const watchedKeys = [...textKeys, ...checkboxKeys, 'hasTranscriptionApiKey'];
const credentialMask = '••••••••••••••••';

export function useSettings() {
  const { state, isBusy: workspaceBusy, isRecording, perform, applyState, toast } = useWorkspace();
  const isBusy = computed(() => workspaceBusy.value || isRecording.value);
  const form = ref(null);
  const draft = reactive({ ...textDefaults });
  const credentials = reactive({
    transcriptionApiKey: { value: '', saved: false, readOnly: false },
  });

  function fillCredential(saved) {
    Object.assign(credentials.transcriptionApiKey, {
      saved: Boolean(saved),
      readOnly: Boolean(saved),
      value: saved ? credentialMask : '',
    });
  }

  function updateDraftField(key, value) {
    if (key === 'hasTranscriptionApiKey') {
      fillCredential(value);
    } else if (checkboxKeys.includes(key)) {
      draft[key] = Boolean(value);
    } else {
      draft[key] = value ?? textDefaults[key];
    }
  }

  function fillSettings(settings) {
    for (const key of watchedKeys) updateDraftField(key, settings[key]);
  }

  // Session snapshots, model switches and resume imports must preserve other
  // unsaved preferences. Only fields changed in the saved state are refreshed.
  watch(
    () => {
      const settings = state.value?.settings;
      return settings ? JSON.stringify(watchedKeys.map((key) => settings[key])) : null;
    },
    (value, previousValue) => {
      if (!value) return;
      const values = JSON.parse(value);
      const previousValues = previousValue ? JSON.parse(previousValue) : null;
      for (const [index, key] of watchedKeys.entries()) {
        if (previousValues && values[index] === previousValues[index]) continue;
        updateDraftField(key, values[index]);
      }
    },
    { immediate: true },
  );

  function toggleCredentialEditing(key) {
    const credential = credentials[key];
    if (!credential) return;
    if (credential.readOnly) {
      credential.readOnly = false;
      credential.value = '';
    } else {
      fillCredential(credential.saved);
    }
  }

  function settingsPatch() {
    const patch = {};
    for (const key of textKeys) patch[key] = String(draft[key] ?? '').trim();
    for (const key of checkboxKeys) patch[key] = Boolean(draft[key]);
    const credential = credentials.transcriptionApiKey;
    const value = credential.value.trim();
    if (!credential.readOnly && value && value !== credentialMask) {
      patch.transcriptionApiKey = value;
    }
    return patch;
  }

  async function saveSettings() {
    if (isBusy.value || !form.value?.reportValidity()) return;
    await perform(async () => {
      const saved = await desktop.saveSettings(settingsPatch());
      applyState(saved, true);
      fillSettings(saved.settings);
      toast('面试偏好、语音转写与桌面设置已保存。');
    }, '保存设置失败。');
  }

  async function importResume() {
    await perform(async () => {
      const result = await desktop.importResume();
      if (result.canceled || typeof result.text !== 'string') return;
      if (result.state) applyState(result.state);
      draft.resume = result.text.slice(0, 16000);
      toast('简历已保存在本地，之后无需重复上传，也无需再点击保存设置。');
    }, '导入简历失败。');
  }

  function openDataFolder() {
    return perform(() => desktop.showDataFolder(), '无法打开数据目录。');
  }

  return {
    form,
    draft,
    credentials,
    isBusy,
    toggleCredentialEditing,
    saveSettings,
    importResume,
    openDataFolder,
  };
}
