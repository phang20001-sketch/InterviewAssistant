<script setup>
import { computed } from 'vue';
import MarkdownContent from '../../../components/common/MarkdownContent.vue';

const props = defineProps({
  message: { type: Object, required: true },
  round: { type: Number, required: true },
});
const isUser = computed(() => props.message.role === 'user');
const answerParts = computed(() => {
  if (!isUser.value) return null;
  return /^面试题：([\s\S]*?)\n\n我的回答：\n([\s\S]*?)\n\n请以面试官/.exec(props.message.content);
});
</script>

<template>
  <article class="mock-review-round">
    <div class="message-meta">
      <span class="message-avatar">{{ isUser ? '我' : 'AI' }}</span>
      <strong>第 {{ round }} 题 · {{ isUser ? '你的作答' : '练习点评' }}</strong>
      <span v-if="!isUser && message.demo" class="demo-message-label">本地示例 · 非真实评估</span>
    </div>
    <template v-if="isUser">
      <h3 v-if="answerParts" class="mock-review-question">{{ answerParts[1] }}</h3>
      <div class="question-bubble">{{ answerParts ? answerParts[2] : message.content }}</div>
    </template>
    <template v-else>
      <p v-if="message.demo" class="mock-session-note">
        以下是本地示例点评，并非模型对你本次回答的真实评估。
      </p>
      <MarkdownContent :content="message.content" />
    </template>
  </article>
</template>
