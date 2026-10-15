<script setup>
import { computed } from 'vue';

const props = defineProps({
  preferences: { type: Object, default: null },
  role: { type: String, default: '' },
});
const choiceLabels = {
  experienceLevel: {
    unspecified: '未指定，结合简历判断',
    student: '在校生 / 应届生',
    junior: '初级',
    mid: '中级',
    senior: '高级',
    lead: '技术负责人 / 管理者',
  },
  interviewType: {
    mixed: '综合面试',
    technical: '技术面试',
    project: '项目深挖',
    behavior: '行为面试',
  },
  interviewDifficulty: { basic: '基础', standard: '标准', challenging: '挑战' },
  answerStyle: { concise: '简洁', detailed: '详细' },
};
const fields = [
  ['experienceLevel', '经验 / 职级'],
  ['targetCompany', '目标公司 / 行业'],
  ['jobDescription', '岗位要求 / JD'],
  ['interviewType', '面试方向'],
  ['interviewDifficulty', '题目难度'],
  ['focusAreas', '重点知识 / 项目方向'],
  ['improvementGoals', '希望改善的能力'],
  ['additionalRequirements', '补充要求'],
  ['language', '回答语言'],
  ['answerStyle', '回答风格'],
];
const savedFields = computed(() =>
  fields.map(([key, label]) => {
    const value = props.preferences?.[key];
    return { key, label, value: choiceLabels[key]?.[value] || value || '未填写' };
  }),
);
</script>

<template>
  <dl v-if="preferences" class="interview-preference-details">
    <div v-if="role">
      <dt>面试岗位</dt>
      <dd>{{ role }}</dd>
    </div>
    <div v-for="field in savedFields" :key="field.key">
      <dt>{{ field.label }}</dt>
      <dd>{{ field.value }}</dd>
    </div>
  </dl>
  <p v-else class="interview-preference-legacy">
    <slot name="empty">这条历史记录未保存面试偏好快照，已有内容仍然保留。</slot>
  </p>
</template>

<style scoped>
.interview-preference-details {
  display: grid;
  gap: 10px;
  line-height: 1.8;
}

.interview-preference-details dt {
  margin-bottom: 3px;
}

.interview-preference-details dd {
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.interview-preference-legacy {
  line-height: 1.8;
}
</style>
