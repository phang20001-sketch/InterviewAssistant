<script setup>
import { computed } from 'vue';

const props = defineProps({
  draft: { type: Object, required: true },
  disabled: Boolean,
});
const languages = computed(() => [
  ...new Set(['简体中文', 'English', '中英双语', props.draft.language]),
]);
const interviewTypes = [
  { value: 'mixed', label: '综合面试 · 多方向覆盖' },
  { value: 'technical', label: '技术面试 · 原理与实践' },
  { value: 'project', label: '项目深挖 · 经历与决策' },
  { value: 'behavior', label: '行为面试 · 沟通与协作' },
];
const difficulties = [
  { value: 'basic', label: '基础 · 先掌握核心概念' },
  { value: 'standard', label: '标准 · 贴近实际面试' },
  { value: 'challenging', label: '挑战 · 深挖边界与权衡' },
];
const answerStyles = computed(() => {
  const options = [
    { value: 'concise', label: '简洁 · 抓住重点' },
    { value: 'detailed', label: '详细 · 深入展开' },
  ];
  if (props.draft.answerStyle && !options.some((item) => item.value === props.draft.answerStyle)) {
    options.push({ value: props.draft.answerStyle, label: props.draft.answerStyle });
  }
  return options;
});
</script>

<template>
  <section class="preference-group" aria-labelledby="interview-format-title">
    <h3 id="interview-format-title">面试方式与回答</h3>
    <p>设置出题方向、难度和回答习惯，适用于后续新请求。</p>
    <div class="field">
      <label for="setting-interviewType">面试方向</label>
      <select id="setting-interviewType" v-model="draft.interviewType" :disabled="disabled">
        <option v-for="type in interviewTypes" :key="type.value" :value="type.value">
          {{ type.label }}
        </option>
      </select>
    </div>
    <div class="field">
      <label for="setting-interviewDifficulty">题目难度</label>
      <select
        id="setting-interviewDifficulty"
        v-model="draft.interviewDifficulty"
        :disabled="disabled"
      >
        <option
          v-for="difficulty in difficulties"
          :key="difficulty.value"
          :value="difficulty.value"
        >
          {{ difficulty.label }}
        </option>
      </select>
      <small>难度会结合经验 / 职级与简历调整。</small>
    </div>
    <div class="field-row">
      <div class="field">
        <label for="setting-language">回答语言</label>
        <select id="setting-language" v-model="draft.language" :disabled="disabled">
          <option v-for="language in languages" :key="language" :value="language">
            {{ language }}
          </option>
        </select>
      </div>
      <div class="field">
        <label for="setting-answerStyle">回答风格</label>
        <select id="setting-answerStyle" v-model="draft.answerStyle" :disabled="disabled">
          <option v-for="option in answerStyles" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
      </div>
    </div>
  </section>
</template>
