<script setup>
import { useToasts } from '../../composables/useToasts.js';

const { toasts } = useToasts();
</script>

<template>
  <div id="toast-container" class="toast-container" aria-live="polite" aria-atomic="true">
    <div v-for="item in toasts" :key="item.id" class="toast" :class="{ error: item.error }">
      {{ item.message }}
    </div>
  </div>
</template>
