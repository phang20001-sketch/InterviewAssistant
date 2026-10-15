<script setup>
import AppIcon from '../../../components/common/AppIcon.vue';
import TranscriptionSettings from './TranscriptionSettings.vue';

defineProps({
  draft: { type: Object, required: true },
  credential: { type: Object, required: true },
  disabled: Boolean,
});
const emit = defineEmits(['toggle-credential']);
</script>

<template>
  <section class="card settings-card transcription-card wide-card">
    <div class="card-header">
      <div class="section-title">
        <AppIcon name="mic" />
        <h2>语音转写</h2>
      </div>
      <span class="subtle-tag">可选配置</span>
    </div>
    <div class="settings-body">
      <TranscriptionSettings
        :draft="draft"
        :credential="credential"
        :disabled="disabled"
        @toggle-credential="emit('toggle-credential')"
      />
    </div>
  </section>
</template>
