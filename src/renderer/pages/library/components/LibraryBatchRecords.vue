<script setup>
import LibraryPreferenceSnapshot from './LibraryPreferenceSnapshot.vue';

defineProps({ batches: { type: Array, required: true } });

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '本地生成记录' : date.toLocaleString('zh-CN');
}
</script>

<template>
  <section v-if="batches.length" class="library-batch-records" aria-label="本地生成记录">
    <h2>本地生成记录</h2>
    <p>新题持续追加，所有批次、生成依据与模型原始回答都会保留，可随时展开查看。</p>
    <details
      v-for="batch in batches"
      :key="batch.id"
      class="library-batch-record"
      :data-batch-id="batch.id"
      :open="!batch.questions?.length"
    >
      <summary>
        <span>{{ formatDate(batch.createdAt) }}</span>
        <span>{{ batch.questions?.length || 0 }} 道题 · {{ batch.model || 'AI 模型' }}</span>
      </summary>
      <p v-if="!batch.questions?.length" class="library-batch-notice">
        本次回答未识别出可练习的题目，完整内容已保留如下。
      </p>
      <details v-if="batch.resume" class="library-batch-resume">
        <summary>查看本批次使用的简历</summary>
        <pre>{{ batch.resume }}</pre>
      </details>
      <LibraryPreferenceSnapshot :preferences="batch.preferences" />
      <h3>模型原始回答</h3>
      <pre class="library-raw-content">{{ batch.raw || '本批次未附带原始回答。' }}</pre>
    </details>
  </section>
</template>
