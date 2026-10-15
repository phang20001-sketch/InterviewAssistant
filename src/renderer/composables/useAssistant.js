import { ref } from 'vue';
import { desktop } from '../services/desktop.js';

export function useAssistant(workspace) {
  const {
    state,
    isBusy,
    question,
    imageData,
    pendingSource,
    recorder,
    screenPicker,
    perform,
    ensureSession,
    applyState,
    navigate,
    setMode,
    toast,
  } = workspace;
  const assistantLoading = ref(null);
  const captureAnswerPhase = ref(null);

  function removeScreenshot() {
    imageData.value = null;
    pendingSource.value = workspace.currentMode.value === 'voice' ? 'voice' : 'text';
  }

  async function askQuestion() {
    const text =
      question.value.trim() || (imageData.value ? '请分析截图中的问题，给出回答和解题思路。' : '');
    if (!text || !state.value || isBusy.value || recorder.isRecording.value) return;
    if (text.length > 12000) {
      toast('问题不能超过 12000 字，请精简后再提问。', true);
      return;
    }
    await perform(async () => {
      const session = await ensureSession('interview');
      if (!session) throw new Error('无法创建会话。');
      const payload = {
        sessionId: session.id,
        question: text,
        source: imageData.value ? 'screenshot' : pendingSource.value,
      };
      if (imageData.value) payload.image = imageData.value;
      assistantLoading.value = {
        title: state.value.settings.demoMode ? '正在整理示例思路' : '正在组织回答',
        description: state.value.settings.demoMode
          ? '演示内容来自内置练习示例，不会请求 AI。'
          : '正在向你配置的模型服务请求回答，请稍候。',
      };
      try {
        applyState(await desktop.ask(payload));
        question.value = '';
        removeScreenshot();
        pendingSource.value = 'text';
      } finally {
        assistantLoading.value = null;
      }
    }, '获取回答失败，输入内容已保留。');
  }

  async function chooseScreens() {
    if (!state.value || isBusy.value || recorder.isRecording.value) return;
    await perform(async () => {
      screenPicker.screens = (await desktop.listScreens()) || [];
      screenPicker.open = true;
    }, '无法获取屏幕，请检查系统权限。');
  }

  async function captureScreen(id) {
    await perform(async () => {
      const result = await desktop.captureScreen(id);
      if (!/^data:image\/(?:png|jpeg|webp);base64,/.test(result.dataUrl)) {
        throw new Error('截图格式无效。');
      }
      imageData.value = result.dataUrl;
      pendingSource.value = 'screenshot';
      setMode('screenshot');
      screenPicker.open = false;
      navigate('assistant');
      toast('截图已添加。补充文字后即可提问。');
    }, '截图失败，请重试。');
  }

  async function captureAndAnswer() {
    if (!state.value || isBusy.value) return;
    if (recorder.isRecording.value) return toast('请先结束当前录音。', true);
    if (state.value.settings.demoMode) {
      toast('请先在模型与设置中配置支持图片的模型，并关闭演示模式，再使用截屏作答。', true);
      return;
    }
    await perform(async () => {
      captureAnswerPhase.value = 'capturing';
      navigate('assistant');
      screenPicker.open = false;
      try {
        const session = await ensureSession('interview');
        if (!session) throw new Error('无法创建会话。');
        assistantLoading.value = {
          title: '正在截取当前屏幕',
          description: '即将识别画面中的题目。',
        };
        const screenshot = await desktop.captureCurrentScreen();
        captureAnswerPhase.value = 'answering';
        assistantLoading.value = {
          title: '正在识别并作答',
          description: '正在等待 AI 返回回答。',
        };
        applyState(
          await desktop.ask({
            sessionId: session.id,
            question: '截屏作答',
            image: screenshot.dataUrl,
            source: 'screenshot',
            answerFormat: 'numbered-only',
          }),
        );
      } finally {
        captureAnswerPhase.value = null;
        assistantLoading.value = null;
      }
    }, '截屏作答失败。');
  }

  return {
    assistantLoading,
    captureAnswerPhase,
    removeScreenshot,
    askQuestion,
    chooseScreens,
    captureScreen,
    captureAndAnswer,
  };
}
