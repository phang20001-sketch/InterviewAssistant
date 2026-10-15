<script setup>
import AppIcon from '../../../components/common/AppIcon.vue';

defineProps({
  count: { type: Number, required: true },
  hasBatches: Boolean,
  hasResume: Boolean,
  aiReady: Boolean,
  disabled: Boolean,
  generating: Boolean,
  latestGeneration: { type: Object, default: null },
});
defineEmits(['update:count', 'generate', 'settings']);
</script>

<template>
  <section class="library-generation card" aria-label="AI 题库生成">
    <div class="library-generation-copy">
      <strong>{{ hasBatches ? '继续追加你的专属题库' : '根据简历和面试偏好生成题库' }}</strong>
      <p>每次都参考简历和已保存的面试偏好，新题追加到已有题库。只有点击生成才会请求 AI。</p>
      <p v-if="latestGeneration" id="library-generation-summary" role="status">
        本次新增 {{ latestGeneration.added }} 道题，累计
        {{ latestGeneration.total }} 道题，已保存到本地。
        <template v-if="!latestGeneration.added"
          >完整模型回答保存在下方，已有题目继续保留。</template
        >
      </p>
      <p v-if="!hasResume" class="library-generation-hint">请先上传或粘贴简历。</p>
      <p v-else-if="!aiReady" class="library-generation-hint">
        请先在模型设置里配置 Key 并验证启用 AI。
        <button type="button" :disabled="disabled" @click="$emit('settings')">
          前往模型设置 ↗
        </button>
      </p>
    </div>
    <div class="library-generation-actions">
      <label for="library-question-count">本次生成</label>
      <select
        id="library-question-count"
        :value="count"
        :disabled="disabled"
        @change="$emit('update:count', Number($event.target.value))"
      >
        <option :value="5">5 道题</option>
        <option :value="10">10 道题</option>
      </select>
      <button
        id="generate-question-bank"
        class="button primary"
        type="button"
        :disabled="disabled || !hasResume || !aiReady"
        @click="$emit('generate')"
      >
        <AppIcon :name="generating ? 'refresh' : 'sparkles'" />
        {{ generating ? '正在生成…' : hasBatches ? '继续生成' : '生成题库' }}
      </button>
    </div>
  </section>
</template>
