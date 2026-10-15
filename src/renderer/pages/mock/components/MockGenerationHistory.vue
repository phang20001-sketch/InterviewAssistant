<script setup>
import { computed } from 'vue';
import MarkdownContent from '../../../components/common/MarkdownContent.vue';

const props = defineProps({ practice: { type: Object, required: true } });

const generations = computed(() => {
  if (props.practice.generations?.length) return props.practice.generations;
  if (!props.practice.rawQuestions) return [];
  return [
    {
      id: 'legacy-generation',
      createdAt: props.practice.createdAt,
      questionIds: props.practice.questions.map((question) => question.id),
      raw: props.practice.rawQuestions,
      model: props.practice.model,
    },
  ];
});

function formatTime(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('zh-CN', { hour12: false });
}
</script>

<template>
  <details
    v-if="generations.length"
    id="mock-generation-history"
    class="mock-question-source"
    :open="!generations[generations.length - 1]?.questionIds?.length"
  >
    <summary>本场生成记录 · {{ generations.length }} 次 · 每次完整原文均已保存</summary>
    <p class="mock-session-note mock-source-note">
      新生成的问题会累加在本场末尾，已有问题、回答和评分会一直保留。
      未识别成题目的回复也保留完整原文。
    </p>
    <details
      v-for="(generation, index) in generations"
      :key="generation.id || index"
      class="mock-generation-batch"
      :open="!generation.questionIds?.length"
      :data-generation-id="generation.id"
    >
      <summary>
        第 {{ index + 1 }} 次{{ index ? '追加' : '生成' }} ·
        {{ generation.questionIds?.length || 0 }} 道题
        <template v-if="generation.model"> · {{ generation.model }}</template>
        <time v-if="generation.createdAt" :datetime="generation.createdAt">
          {{ formatTime(generation.createdAt) }}
        </time>
      </summary>
      <MarkdownContent :content="generation.raw || '模型未返回可展示的内容。'" plain-text />
    </details>
  </details>
</template>
