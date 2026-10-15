<script setup>
import { useWorkspace } from '../../composables/useWorkspace.js';
import AppIcon from '../common/AppIcon.vue';
import { useCaptureControls } from '../common/useCaptureControls.js';

const { currentView, windowState, transparencyPending, toggleTransparentMode } = useWorkspace();
const { captureDisabled, captureLabel, captureAndAnswer } = useCaptureControls();

const viewNames = {
  assistant: '面试助手',
  mock: '模拟面试',
  library: '题库练习',
  history: '面试记录',
  settings: '模型与设置',
};
</script>

<template>
  <header class="topbar">
    <div class="breadcrumb">
      工作空间 <span>/</span>
      <strong id="breadcrumb-title">{{ viewNames[currentView] }}</strong>
    </div>
    <div class="topbar-right">
      <button
        id="capture-answer"
        type="button"
        class="button capture-answer-button"
        title="截取软件所在屏幕，提示 AI 优先返回题号和答案"
        :disabled="captureDisabled"
        @click="captureAndAnswer"
      >
        <AppIcon name="scan" />
        <span id="capture-answer-label">{{ captureLabel }}</span>
      </button>
      <button
        id="toggle-transparency"
        type="button"
        class="button transparency-button"
        data-window-control
        :aria-pressed="String(windowState.transparentMode)"
        :disabled="transparencyPending"
        title="只显示输入与回答（Ctrl Shift T）"
        @click="toggleTransparentMode()"
      >
        <AppIcon name="layers" />透明化
      </button>
      <span class="private-label"><AppIcon name="shield" /> 会话记录保存在本机</span>
      <span class="profile-avatar">我</span>
    </div>
  </header>
</template>
