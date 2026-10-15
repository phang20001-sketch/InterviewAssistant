<script setup>
import { computed } from 'vue';

const props = defineProps({ question: { type: Object, required: true }, disabled: Boolean });
defineEmits(['select']);
const tags = computed(() =>
  Array.isArray(props.question.tags) ? props.question.tags.join(' · ') : props.question.tags,
);
</script>

<template>
  <button class="library-question-card" :disabled="disabled" @click="$emit('select', question)">
    <div class="question-topline">
      <span class="topic-tag" :class="question.category">{{ question.topic }}</span>
      <span class="difficulty">{{ question.level }}</span>
    </div>
    <h3>{{ question.title }}</h3>
    <p>{{ question.description }}</p>
    <div class="question-card-footer">
      <span>{{ tags }}</span
      ><span>开始练习 ↗</span>
    </div>
  </button>
</template>
