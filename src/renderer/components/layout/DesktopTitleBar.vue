<script setup>
import { useWorkspace } from '../../composables/useWorkspace.js';

const { windowState, controlWindow } = useWorkspace();
</script>

<template>
  <header id="window-titlebar" class="window-titlebar" aria-label="窗口标题栏">
    <span class="window-caption">面试工作台 · Interview Studio</span>
    <div class="window-controls">
      <button
        id="window-minimize"
        type="button"
        class="window-control"
        data-window-control
        aria-label="最小化"
        title="最小化"
        @click="controlWindow('minimize')"
      >
        −
      </button>
      <button
        id="window-maximize"
        type="button"
        class="window-control"
        data-window-control
        :aria-label="windowState.isMaximized ? '还原窗口' : '最大化'"
        :title="windowState.isMaximized ? '还原窗口' : '最大化'"
        @click="controlWindow('toggle-maximize')"
      >
        <span id="window-maximize-icon" aria-hidden="true">{{
          windowState.isMaximized ? '❐' : '□'
        }}</span>
      </button>
      <button
        id="window-close"
        type="button"
        class="window-control window-close"
        data-window-control
        aria-label="关闭"
        title="关闭"
        @click="controlWindow('close')"
      >
        ×
      </button>
    </div>
  </header>
</template>
