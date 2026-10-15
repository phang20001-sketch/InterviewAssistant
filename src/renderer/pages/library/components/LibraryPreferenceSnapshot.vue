<script setup>
import InterviewPreferenceDetails from '../../../components/common/InterviewPreferenceDetails.vue';

defineProps({ preferences: { type: Object, default: null } });
</script>

<template>
  <details class="library-batch-preferences">
    <summary>查看本批次使用的面试偏好</summary>
    <InterviewPreferenceDetails
      :preferences="preferences"
      :class="preferences ? 'library-preference-fields' : 'library-batch-legacy'"
    >
      <template #empty> 这批历史记录未保存面试偏好快照，题目和原始回答仍然保留。 </template>
    </InterviewPreferenceDetails>
  </details>
</template>
