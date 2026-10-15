<script setup>
import AppIcon from '../../../components/common/AppIcon.vue';
import { useWorkspace } from '../../../composables/useWorkspace.js';

const { isBusy, recorder } = useWorkspace();
const { isRecording, recordingLabel, recordingHint, buttonLabel, toggleRecording } = recorder;
</script>

<template>
  <div class="voice-panel" id="voice-panel">
    <div class="waveform" id="waveform" :class="{ 'is-recording': isRecording }" aria-hidden="true">
      <i v-for="bar in 29" :key="bar"></i>
    </div>
    <strong id="recording-label">{{ recordingLabel }}</strong>
    <p id="recording-hint">{{ recordingHint }}</p>
    <button
      class="button record-button"
      id="record-button"
      :class="{ recording: isRecording }"
      :disabled="isBusy"
      @click="toggleRecording"
    >
      <AppIcon name="mic" />
      <span id="record-button-label">{{ buttonLabel }}</span>
    </button>
  </div>
</template>
