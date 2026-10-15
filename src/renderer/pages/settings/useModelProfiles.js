import { computed, reactive, ref, watch } from 'vue';
import { useWorkspace } from '../../composables/useWorkspace.js';
import { desktop } from '../../services/desktop.js';

const credentialMask = '••••••••••••••••';

export function useModelProfiles() {
  const { state, currentView, isBusy, isRecording, perform, applyState, toast, errorText } =
    useWorkspace();
  const profiles = computed(() => state.value?.modelProfiles || []);
  const activeProfileId = computed(() => state.value?.activeModelProfileId || '');
  const activeProfile = computed(() =>
    profiles.value.find((profile) => profile.id === activeProfileId.value),
  );
  const keyStatus = computed(() => {
    const profile = activeProfile.value;
    if (!profile) return '尚未选择模型';
    const key = profile.hasApiKey ? 'Key 已保存' : '未配置 Key';
    return `${key} · ${profile.demoMode ? '演示模式' : 'AI 模式'}`;
  });
  const disabled = computed(() => isBusy.value || isRecording.value);
  const testingProfileId = ref('');
  const savingAndTesting = ref(false);
  const verificationResults = reactive({});
  const editorOpen = ref(false);
  const editingId = ref(null);
  const draft = reactive({ name: '', baseUrl: '', model: '', demoMode: false });
  const credential = reactive({ value: '', saved: false, readOnly: false });

  // Native dialogs remain in the top layer even when the page is hidden. A
  // shortcut that leaves settings must release the dialog and its unsaved key.
  watch(currentView, (view) => {
    if (view === 'settings') return;
    editorOpen.value = false;
    credential.value = '';
  });

  function resetCredential(saved) {
    Object.assign(credential, {
      saved: Boolean(saved),
      readOnly: Boolean(saved),
      value: saved ? credentialMask : '',
    });
  }

  function openEditor(profile = null) {
    if (disabled.value) return;
    editingId.value = profile?.id || null;
    Object.assign(draft, {
      name: profile?.name || '',
      baseUrl: profile?.baseUrl || 'https://api.openai.com/v1',
      model: profile?.model || '',
      demoMode: Boolean(profile?.demoMode),
    });
    // New configurations always start with an empty credential. Only an existing
    // configuration may retain its own encrypted key through an omitted field.
    resetCredential(profile?.hasApiKey);
    editorOpen.value = true;
  }

  function closeEditor() {
    if (disabled.value) return;
    editorOpen.value = false;
    credential.value = '';
  }

  function toggleCredentialEditing() {
    if (disabled.value) return;
    if (credential.readOnly) {
      credential.readOnly = false;
      credential.value = '';
    } else resetCredential(credential.saved);
  }

  async function verifyConnection(profileId, saved = false) {
    testingProfileId.value = profileId;
    delete verificationResults[profileId];
    try {
      const result = await desktop.testConnection(profileId);
      if (result.state) applyState(result.state);
      verificationResults[profileId] = 'success';
      toast(
        saved
          ? '模型配置已保存，本次连接验证通过，已关闭此配置的演示模式。'
          : result.message || '本次连接验证通过，已关闭此配置的演示模式。',
      );
    } catch (error) {
      verificationResults[profileId] = 'error';
      const detail = errorText(error, '').trim() || '连接验证失败，请检查模型配置后重试。';
      toast(saved ? `模型配置已保存，但连接验证失败：${detail}` : detail, true);
    } finally {
      testingProfileId.value = '';
    }
  }

  async function testProfile(profile) {
    if (disabled.value) return;
    await perform(() => verifyConnection(profile.id), '连接验证失败。');
  }

  async function saveProfile(test = false) {
    if (disabled.value) return;
    const id = editingId.value;
    const payload = {
      name: draft.name.trim(),
      baseUrl: draft.baseUrl.trim(),
      model: draft.model.trim(),
      demoMode: draft.demoMode,
    };
    if (id) payload.id = id;
    const key = credential.value.trim();
    if (!credential.readOnly && key && key !== credentialMask) payload.apiKey = key;

    await perform(async () => {
      savingAndTesting.value = test;
      try {
        const previousIds = new Set(profiles.value.map((profile) => profile.id));
        const saved = await desktop.saveModelProfile(payload);
        const savedId =
          id || saved.modelProfiles.find((profile) => !previousIds.has(profile.id))?.id;
        applyState(saved);
        if (savedId) delete verificationResults[savedId];
        editorOpen.value = false;
        credential.value = '';
        if (test && savedId) await verifyConnection(savedId, true);
        else toast(id ? '模型配置已保存。' : '模型已添加，点击「使用」即可切换。');
      } finally {
        savingAndTesting.value = false;
      }
    }, '保存模型配置失败。');
  }

  async function selectProfile(profile) {
    if (disabled.value || profile.id === activeProfileId.value) return;
    await perform(async () => {
      applyState(await desktop.selectModelProfile(profile.id));
      toast(`已切换到「${profile.name}」。`);
    }, '切换模型失败。');
  }

  async function deleteProfile(profile) {
    if (disabled.value || profiles.value.length <= 1) return;
    const isActive = profile.id === activeProfileId.value;
    const message = isActive
      ? `删除当前模型「${profile.name}」及其保存的 Key？删除后将切换到另一个模型配置。`
      : `删除模型「${profile.name}」及其保存的 Key？`;
    if (!window.confirm(message)) return;
    await perform(async () => {
      applyState(await desktop.deleteModelProfile(profile.id));
      delete verificationResults[profile.id];
      toast('模型配置已删除。');
    }, '删除模型配置失败。');
  }

  return {
    profiles,
    activeProfileId,
    activeProfile,
    keyStatus,
    disabled,
    testingProfileId,
    savingAndTesting,
    verificationResults,
    editorOpen,
    editingId,
    draft,
    credential,
    openEditor,
    closeEditor,
    toggleCredentialEditing,
    saveProfile,
    testProfile,
    selectProfile,
    deleteProfile,
  };
}
