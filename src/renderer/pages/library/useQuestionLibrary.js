import { computed, ref } from 'vue';
import { useWorkspace } from '../../composables/useWorkspace.js';
import { desktop } from '../../services/desktop.js';

const categoryNames = {
  frontend: '前端开发',
  backend: '后端与架构',
  behavior: '行为面试',
  project: '项目经历',
  technical: '技术能力',
  general: '综合问题',
};

export function useQuestionLibrary() {
  const workspace = useWorkspace();
  const { state, isBusy, isRecording, perform, applyState, toast } = workspace;
  const search = ref('');
  const category = ref('all');
  const batchId = ref('all');
  const count = ref(5);
  const generating = ref(false);
  const latestGeneration = ref(null);
  const disabled = computed(() => isBusy.value || isRecording.value);
  const hasResume = computed(() => Boolean(state.value?.settings?.resume?.trim()));
  const aiReady = computed(
    () => state.value?.settings?.hasApiKey && !state.value?.settings?.demoMode,
  );
  const batches = computed(() => [...(state.value?.questionBatches || [])].reverse());
  const allQuestions = computed(() =>
    batches.value.flatMap((batch) =>
      (batch.questions || []).map((item) => ({ ...item, batchId: batch.id })),
    ),
  );
  const selectedBatches = computed(() =>
    batchId.value === 'all'
      ? batches.value
      : batches.value.filter((batch) => batch.id === batchId.value),
  );
  const categories = computed(() => {
    const values = new Map();
    for (const item of allQuestions.value) {
      if (item.category) {
        values.set(item.category, categoryNames[item.category] || item.topic || item.category);
      }
    }
    return [
      { value: 'all', label: '全部问题' },
      ...Array.from(values, ([value, label]) => ({ value, label })),
    ];
  });
  const questions = computed(() => {
    const query = search.value.trim().toLocaleLowerCase();
    return allQuestions.value.filter((item) => {
      const matchesBatch = batchId.value === 'all' || item.batchId === batchId.value;
      const matchesCategory = category.value === 'all' || item.category === category.value;
      const text = [item.title, item.description, item.topic, item.tags].join(' ');
      return matchesBatch && matchesCategory && text.toLocaleLowerCase().includes(query);
    });
  });

  async function generateQuestions() {
    if (disabled.value || !hasResume.value || !aiReady.value) return;
    const previousIds = new Set(batches.value.map((batch) => batch.id));
    generating.value = true;
    try {
      await perform(async () => {
        const saved = await desktop.generateQuestionBank({ count: Number(count.value) });
        applyState(saved);
        const added = batches.value.find((batch) => !previousIds.has(batch.id));
        if (!added) throw new Error('未找到本次生成记录，请重新打开题库查看。');
        batchId.value = 'all';
        category.value = 'all';
        search.value = '';
        latestGeneration.value = {
          added: added.questions?.length || 0,
          total: allQuestions.value.length,
        };
        toast(
          added.questions?.length
            ? `本次新增 ${added.questions.length} 道题，累计 ${allQuestions.value.length} 道，已保存在本地。`
            : `本次模型原文已保存，原有 ${allQuestions.value.length} 道题仍可继续练习。`,
        );
      }, '生成题库失败，请检查模型配置后重试。');
    } finally {
      generating.value = false;
    }
  }

  function selectQuestion(item) {
    workspace.question.value = item.title;
    workspace.removeScreenshot();
    workspace.setMode('text');
    workspace.pendingSource.value = 'text';
    workspace.navigate('assistant');
    workspace.focusQuestion();
    toast('题目已带入，生成回答时会参考已保存的简历和面试偏好。');
  }

  return {
    currentView: workspace.currentView,
    search,
    category,
    batchId,
    count,
    generating,
    latestGeneration,
    disabled,
    hasResume,
    aiReady,
    batches,
    allQuestions,
    selectedBatches,
    categories,
    questions,
    generateQuestions,
    selectQuestion,
    navigate: workspace.navigate,
  };
}
