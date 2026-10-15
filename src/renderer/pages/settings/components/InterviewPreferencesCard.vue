<script setup>
import AppIcon from '../../../components/common/AppIcon.vue';
import CareerPreferencesFields from './CareerPreferencesFields.vue';
import InterviewFormatFields from './InterviewFormatFields.vue';
import PracticeFocusFields from './PracticeFocusFields.vue';
import ResumePreferencesField from './ResumePreferencesField.vue';

defineProps({
  draft: { type: Object, required: true },
  disabled: Boolean,
});
const emit = defineEmits(['import-resume']);
</script>

<template>
  <section class="card settings-card interview-preferences-card wide-card">
    <div class="card-header">
      <div class="section-title">
        <AppIcon name="user" />
        <h2>面试偏好</h2>
      </div>
      <span class="subtle-tag">保存后应用于新提问和练习</span>
    </div>
    <div class="settings-body">
      <p class="settings-section-hint">
        说明你想应聘什么岗位、重点练什么，AI 会结合简历调整回答、出题和点评。
        已生成的题库与面试记录会保留原内容。
      </p>
      <div class="preferences-grid">
        <CareerPreferencesFields :draft="draft" :disabled="disabled" />
        <InterviewFormatFields :draft="draft" :disabled="disabled" />
        <PracticeFocusFields :draft="draft" :disabled="disabled" />
        <ResumePreferencesField
          :draft="draft"
          :disabled="disabled"
          @import-resume="emit('import-resume')"
        />
      </div>
    </div>
  </section>
</template>
