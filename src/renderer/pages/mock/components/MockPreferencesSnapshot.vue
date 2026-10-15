<script setup>
import InterviewPreferenceDetails from '../../../components/common/InterviewPreferenceDetails.vue';

defineProps({ practice: { type: Object, required: true } });
</script>

<template>
  <details id="mock-preferences-snapshot" class="mock-question-source">
    <summary>查看本场使用的面试偏好</summary>
    <p class="mock-session-note mock-source-note">
      追加问题和逐题点评沿用本场保存的偏好。修改设置后，点击“新的面试”会使用最新偏好。
    </p>
    <InterviewPreferenceDetails
      :preferences="practice.preferences"
      :role="practice.role"
      :class="practice.preferences ? 'mock-preferences-list' : 'mock-session-note'"
    >
      <template #empty>这是旧版面试记录，当时未保存详细偏好。</template>
    </InterviewPreferenceDetails>
  </details>
</template>
