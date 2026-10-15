<script setup>
import { icons } from './icons.js';

defineProps({
  name: {
    type: String,
    default: 'message',
  },
});
</script>

<template>
  <span :data-icon="name">
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.6"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path v-for="(path, index) in icons[name] || icons.message" :key="index" :d="path" />
    </svg>
  </span>
</template>
