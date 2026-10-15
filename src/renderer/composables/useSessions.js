import { computed } from 'vue';
import { desktop } from '../services/desktop.js';
import { errorText } from './useToasts.js';

export function useSessions(workspace) {
  const { state, question, recorder, applyState, perform, navigate, toast } = workspace;
  const activeSession = computed(
    () =>
      state.value?.sessions.find((session) => session.id === state.value.activeSessionId) || null,
  );
  const assistantSession = computed(() =>
    activeSession.value?.mode === 'mock' ? null : activeSession.value,
  );
  const latestAnswer = computed(
    () =>
      [...(assistantSession.value?.messages || [])]
        .reverse()
        .find((message) => message.role === 'assistant')?.content || '',
  );

  async function ensureSession(mode) {
    const session = activeSession.value;
    if (session && (mode === 'mock' ? session.mode === 'mock' : session.mode !== 'mock')) {
      return session;
    }
    applyState(await desktop.createSession({ mode }));
    return activeSession.value;
  }

  async function newSession(mode = 'interview') {
    if (recorder.isRecording.value) return toast('请先结束当前录音。');
    await perform(async () => {
      applyState(await desktop.createSession({ mode }));
      if (mode === 'mock') {
        navigate('mock');
      } else {
        question.value = '';
        workspace.removeScreenshot();
        workspace.setMode('text');
        navigate('assistant');
      }
      toast(mode === 'mock' ? '新练习已准备好。' : '已开始新会话。');
    }, '创建会话失败。');
  }

  async function switchSession(id) {
    await perform(async () => {
      applyState(await desktop.switchSession(id));
      navigate(activeSession.value?.mode === 'mock' ? 'mock' : 'assistant');
    }, '打开会话失败。');
  }

  async function deleteSession(id) {
    const session = state.value?.sessions.find((item) => item.id === id);
    if (!session) return;
    if (!window.confirm(`删除“${session.title || '未命名会话'}”？此操作无法撤销。`)) return;
    await perform(async () => {
      applyState(await desktop.deleteSession(id));
      toast('会话已删除。');
    }, '删除会话失败。');
  }

  async function clearAllSessions() {
    if (!state.value || workspace.isBusy.value || recorder.isRecording.value) return;
    const confirmed = window.confirm(
      '清除所有会话？这会永久删除面试助手、模拟面试的全部聊天记录及应用内本地聊天备份，' +
        '无法恢复。模型配置和 API Key 会保留。',
    );
    if (!confirmed) return;
    await perform(async () => {
      applyState(await desktop.clearSessions());
      question.value = '';
      workspace.removeScreenshot();
      workspace.setMode('text');
      workspace.pendingSource.value = 'text';
      workspace.screenPicker.open = false;
      toast('所有会话及本地聊天备份已清除。');
    }, '清除会话失败，请重试。');
  }

  async function exportSession(id = assistantSession.value?.id) {
    if (!id) return toast('开始一段对话后即可导出。');
    await perform(async () => {
      const result = await desktop.exportSession(id);
      if (!result.canceled) toast('会话已导出。');
    }, '导出失败。');
  }

  async function copyAnswer() {
    try {
      try {
        await navigator.clipboard.writeText(latestAnswer.value);
      } catch {
        const text = document.createElement('textarea');
        text.value = latestAnswer.value;
        text.className = 'clipboard-fallback';
        document.body.append(text);
        text.select();
        const copied = document.execCommand('copy');
        text.remove();
        if (!copied) throw new Error('系统未授予剪贴板权限。');
      }
      toast('回答已复制。');
    } catch (error) {
      toast(errorText(error, '复制失败，请重试。'), true);
    }
  }

  return {
    activeSession,
    assistantSession,
    latestAnswer,
    ensureSession,
    newSession,
    switchSession,
    deleteSession,
    clearAllSessions,
    exportSession,
    copyAnswer,
  };
}
