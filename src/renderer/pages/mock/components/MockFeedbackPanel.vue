<script setup>
import { computed, nextTick, ref, watch } from 'vue';
import AppIcon from '../../../components/common/AppIcon.vue';
import MockReviewRound from './MockReviewRound.vue';
import MockScoredReview from './MockScoredReview.vue';

const props = defineProps({
  questions: { type: Array, default: () => [] },
  reviews: { type: Array, default: () => [] },
  messages: { type: Array, default: () => [] },
  hasPractice: Boolean,
  submitting: Boolean,
  generating: Boolean,
  canNext: Boolean,
  completed: Boolean,
  disabled: Boolean,
});

defineEmits(['next']);
const feedback = ref(null);
const legacyRounds = computed(() => {
  let round = 0;
  return props.messages.map((message, index) => {
    if (message.role === 'user') round += 1;
    return { message, round: round || 1, key: message.id || index };
  });
});

function questionFor(review, index) {
  return (
    props.questions.find((question) => question.id === review.questionId) || props.questions[index]
  );
}

watch(
  () => [props.reviews.length, props.messages.length, props.submitting, props.generating],
  async () => {
    await nextTick();
    if (feedback.value) feedback.value.scrollTop = feedback.value.scrollHeight;
  },
  { immediate: true },
);
</script>

<template>
  <section class="card mock-feedback-card">
    <div class="card-header">
      <div class="section-title">
        <span class="ai-symbol">✳</span>
        <h2>点评与评分</h2>
      </div>
      <button
        id="next-mock-question"
        class="text-button"
        :disabled="disabled || !canNext"
        @click="$emit('next')"
      >
        {{ completed ? '本轮已完成' : '下一题' }}
        <span v-if="!completed" aria-hidden="true">→</span>
      </button>
    </div>
    <div id="mock-feedback" ref="feedback" class="mock-feedback">
      <template v-if="hasPractice">
        <MockScoredReview
          v-for="(review, index) in reviews"
          :key="review.questionId || index"
          :review="review"
          :question="questionFor(review, index)"
          :round="index + 1"
        />
      </template>
      <template v-else-if="messages.length">
        <p class="mock-session-note">旧版练习记录保留原始内容，未提供的评分不作补填。</p>
        <MockReviewRound
          v-for="item in legacyRounds"
          :key="item.key"
          :message="item.message"
          :round="item.round"
        />
      </template>

      <div v-if="submitting" class="answer-loading">
        <span class="loading-spark">✳</span><strong>正在点评并评分</strong>
        <p>AI 正在结合本场简历、面试偏好和你的回答分析，完成后自动保存。</p>
      </div>
      <div v-else-if="!reviews.length && !messages.length" class="simple-empty">
        <span class="simple-empty-icon"><AppIcon name="message" /></span>
        <h3>{{ generating ? '本轮问题生成中' : '每一次回答，都留下进步' }}</h3>
        <p>提交回答后，在这里查看 AI 点评和评分。<br />可以通过“面试记录”重新打开整轮练习。</p>
      </div>

      <p v-if="completed" class="mock-session-note mock-completed-note">
        本场所有回答与点评已保存在本地。点击“追加问题”继续练习，
        或点击“新的面试”使用当前设置另开一场，已有记录会保留。
      </p>
    </div>
  </section>
</template>
