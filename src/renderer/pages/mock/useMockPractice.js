import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useWorkspace } from '../../composables/useWorkspace.js';
import { desktop } from '../../services/desktop.js';

export function useMockPractice() {
  const {
    state,
    isBusy: workspaceBusy,
    isRecording,
    activeSession,
    mockSubmit,
    perform,
    applyState,
    toast,
    navigate,
  } = useWorkspace();
  const isBusy = computed(() => workspaceBusy.value || isRecording.value);
  const questionCount = ref(5);
  const questionIndex = ref(0);
  const answer = ref('');
  const generating = ref(false);
  const appending = ref(false);
  const submitting = ref(false);
  const session = computed(() =>
    activeSession.value?.mode === 'mock' ? activeSession.value : null,
  );
  const practice = computed(() => session.value?.practice || null);
  const questions = computed(() => practice.value?.questions || []);
  const reviews = computed(() => practice.value?.reviews || []);
  const messages = computed(() => session.value?.messages || []);
  const question = computed(() => questions.value[questionIndex.value] || null);
  const reviewed = computed(() => questionIndex.value < reviews.value.length);
  const completed = computed(() => practice.value?.status === 'completed');
  const canNext = computed(
    () => reviewed.value && questionIndex.value + 1 < questions.value.length,
  );
  const hasResume = computed(() => Boolean(state.value?.settings?.resume?.trim()));
  const modelReady = computed(
    () => Boolean(state.value?.settings?.hasApiKey) && !state.value?.settings?.demoMode,
  );
  const canGenerate = computed(
    () => Boolean(state.value) && hasResume.value && modelReady.value && !isBusy.value,
  );
  const canAppend = computed(
    () => Boolean(practice.value?.resume?.trim()) && modelReady.value && !isBusy.value,
  );
  const validScores = computed(() =>
    reviews.value
      .map((review) => review.score)
      .filter((score) => Number.isFinite(score) && score >= 0 && score <= 100),
  );
  const averageScore = computed(() => {
    if (!validScores.value.length) return null;
    const total = validScores.value.reduce((sum, score) => sum + score, 0);
    return Math.round((total / validScores.value.length) * 10) / 10;
  });
  const progress = computed(() => {
    if (!questions.value.length) return '等待生成题目';
    if (completed.value) return `已完成 ${reviews.value.length} / ${questions.value.length} 题`;
    const current = questionIndex.value + 1;
    return `第 ${current} / ${questions.value.length} 题${reviewed.value ? ' · 已点评' : ''}`;
  });

  // Reopening a saved round resumes its first unanswered question. Submitting
  // keeps the reviewed question visible until the user chooses Next.
  watch(
    () => activeSession.value?.id,
    () => {
      questionIndex.value = Math.min(reviews.value.length, Math.max(questions.value.length - 1, 0));
      answer.value = reviews.value[questionIndex.value]?.answer || '';
    },
    { immediate: true, flush: 'sync' },
  );

  async function startPractice() {
    if (!canGenerate.value) return;
    await perform(async () => {
      generating.value = true;
      try {
        const next = await desktop.startPractice({ count: Number(questionCount.value) });
        applyState(next);
        questionIndex.value = 0;
        answer.value = '';
        if (questions.value.length) {
          toast(`已生成 ${questions.value.length} 道面试题并保存在本地。`);
        } else {
          toast('模型的原始回复已保存在本地，请查看回复后重新生成。', true);
        }
      } finally {
        generating.value = false;
      }
    }, '生成面试题失败，请检查模型设置后重试。');
  }

  async function appendQuestions() {
    if (!canAppend.value || !session.value) return;
    const sessionId = session.value.id;
    const previousQuestionCount = questions.value.length;
    const previousReviewCount = reviews.value.length;
    const previousIndex = questionIndex.value;
    const previousAnswer = answer.value;
    const wasCompleted = completed.value;

    await perform(async () => {
      appending.value = true;
      try {
        const next = await desktop.appendPractice({
          sessionId,
          count: Number(questionCount.value),
        });
        applyState(next);
        const addedCount = questions.value.length - previousQuestionCount;

        if (addedCount > 0 && (wasCompleted || previousQuestionCount === 0)) {
          questionIndex.value = previousReviewCount;
          answer.value = '';
        } else {
          // Appending questions must not skip the current question or discard a draft.
          questionIndex.value = previousIndex;
          answer.value = previousAnswer;
        }

        if (addedCount > 0) {
          toast(
            `已追加 ${addedCount} 道问题，本场共 ${questions.value.length} 道，全部保存在本地。`,
          );
        } else {
          toast('这次回复未识别出新题目，完整原文已保存，原有问题和作答保持不变。', true);
        }
      } finally {
        appending.value = false;
      }
    }, '追加面试题失败，原有问题、作答和评分已保留。');
  }

  async function submit() {
    const submittedAnswer = answer.value.trim();
    if (!submittedAnswer || !question.value || reviewed.value || !session.value || isBusy.value) {
      return;
    }
    if (submittedAnswer.length > 10000) {
      toast('本轮回答不能超过 10000 字，请精简后提交。', true);
      return;
    }
    const submittedIndex = questionIndex.value;
    const sessionId = session.value.id;
    await perform(async () => {
      submitting.value = true;
      try {
        const next = await desktop.reviewPractice({ sessionId, answer: submittedAnswer });
        applyState(next);
        questionIndex.value = submittedIndex;
        answer.value = submittedAnswer;
        toast(
          completed.value
            ? '本轮面试已完成，全部作答、点评和评分已保存到本地。'
            : '点评和评分已保存，查看后点击下一题继续。',
        );
      } finally {
        submitting.value = false;
      }
    }, '获取点评失败，回答内容已保留。');
  }

  function nextQuestion() {
    if (isBusy.value || !canNext.value) return;
    questionIndex.value = reviews.value.length;
    answer.value = '';
  }

  mockSubmit.value = submit;
  onBeforeUnmount(() => {
    if (mockSubmit.value === submit) mockSubmit.value = null;
  });

  return {
    state,
    isBusy,
    session,
    practice,
    questions,
    reviews,
    messages,
    question,
    answer,
    questionCount,
    progress,
    reviewed,
    completed,
    canNext,
    hasResume,
    modelReady,
    canGenerate,
    canAppend,
    generating,
    appending,
    submitting,
    averageScore,
    scoreCount: computed(() => validScores.value.length),
    submit,
    nextQuestion,
    startPractice,
    appendQuestions,
    openSettings: () => navigate('settings'),
    openHistory: () => navigate('history'),
  };
}
