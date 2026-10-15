<script setup>
import { computed } from 'vue';
import MarkdownContent from '../../../components/common/MarkdownContent.vue';

const props = defineProps({
  review: { type: Object, required: true },
  question: { type: Object, default: null },
  round: { type: Number, required: true },
});
const score = computed(() => {
  const value = props.review.score;
  return Number.isFinite(value) && value >= 0 && value <= 100 ? value : null;
});
const content = computed(() => props.review.content || props.review.raw || '');
const hasSeparateRaw = computed(() =>
  Boolean(props.review.raw && props.review.raw !== content.value),
);
</script>

<template>
  <article class="mock-review-round mock-scored-review" :data-question-id="review.questionId">
    <div class="mock-review-heading">
      <div class="message-meta">
        <span class="message-avatar">✳</span>
        <strong>第 {{ round }} 题 · 点评</strong>
      </div>
      <span class="mock-review-score" :class="{ unavailable: score === null }">
        {{ score === null ? '评分未提供' : `${score} / 100 分` }}
      </span>
    </div>
    <h3 v-if="question" class="mock-review-question">{{ question.title }}</h3>
    <div class="mock-answer-label">你的作答</div>
    <div class="question-bubble">{{ review.answer }}</div>
    <div class="mock-answer-label">AI 点评</div>
    <MarkdownContent :content="content" />
    <p v-if="score === null" class="mock-session-note">
      模型未返回有效的 0–100 分评分，完整点评已保留。
    </p>
    <details v-if="hasSeparateRaw" class="mock-raw-review">
      <summary>查看模型完整原文</summary>
      <MarkdownContent :content="review.raw" />
    </details>
  </article>
</template>
