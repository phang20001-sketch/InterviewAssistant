<script setup>
import { modifierLabel } from '../../services/platform.js';
import { computed } from 'vue';
import { useWorkspace } from '../../composables/useWorkspace.js';
import { useCaptureControls } from '../common/useCaptureControls.js';
import AppearanceSlider from './AppearanceSlider.vue';

const {
  state,
  isBusy,
  isRecording,
  question,
  imageData,
  windowState,
  transparencyPending,
  transparencyAppearance,
  askQuestion,
  setTransparentMode,
  changeTransparencyAppearance,
  flushTransparencyAppearance,
} = useWorkspace();
const { captureDisabled, captureLabel, captureTitle, captureAndAnswer } = useCaptureControls();

const sendDisabled = computed(
  () =>
    isBusy.value ||
    !state.value ||
    isRecording.value ||
    (!imageData.value && !question.value.trim()),
);
</script>

<template>
  <div
    id="transparent-toolbar"
    class="transparent-toolbar"
    aria-label="透明模式控制"
    :hidden="!windowState.transparentMode"
  >
    <div class="transparent-toolbar-actions">
      <button
        id="transparent-send"
        type="button"
        class="transparent-action"
        :title="`发送输入的问题（${modifierLabel} Enter）`"
        :disabled="sendDisabled"
        @click="askQuestion"
      >
        <span id="transparent-send-label">{{ isBusy ? '回答中…' : '发送' }}</span>
      </button>
      <button
        id="transparent-capture-answer"
        type="button"
        class="transparent-action transparent-capture-answer"
        aria-label="截取当前屏幕并让 AI 作答"
        :title="captureTitle"
        :hidden="!windowState.transparentMode"
        :disabled="captureDisabled"
        @click="captureAndAnswer"
      >
        <span id="transparent-capture-answer-label">{{ captureLabel }}</span>
      </button>
      <button
        id="exit-transparency"
        type="button"
        class="transparent-action exit-transparency"
        data-window-control
        aria-label="恢复完整界面"
        :title="`恢复完整界面（Esc / ${modifierLabel} Shift T）`"
        :hidden="!windowState.transparentMode"
        :disabled="transparencyPending"
        @click="setTransparentMode(false)"
      >
        <span>恢复</span>
      </button>
    </div>
    <div class="transparent-opacity-controls">
      <AppearanceSlider
        id="transparent-text-opacity"
        label="文字"
        title="文字不透明度：0% 隐藏文字，100% 完全显示"
        aria-label="文字不透明度"
        :value="transparencyAppearance.text"
        @input="changeTransparencyAppearance('transparentTextOpacity', $event)"
        @change="flushTransparencyAppearance"
      />
      <AppearanceSlider
        id="transparent-background-opacity"
        label="背景"
        title="背景不透明度：0% 全透明，100% 不透明"
        aria-label="背景不透明度"
        :value="transparencyAppearance.background"
        @input="changeTransparencyAppearance('transparentBackgroundOpacity', $event)"
        @change="flushTransparencyAppearance"
      />
      <AppearanceSlider
        id="transparent-font-size"
        label="字号"
        title="透明模式字号：12–32 像素"
        aria-label="字号"
        unit="px"
        :value="transparencyAppearance.fontSize"
        :min="12"
        :max="32"
        @input="changeTransparencyAppearance('transparentFontSize', $event)"
        @change="flushTransparencyAppearance"
      />
    </div>
  </div>
</template>
