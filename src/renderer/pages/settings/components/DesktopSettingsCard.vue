<script setup>
import { isMac } from '../../../services/platform.js';
import AppIcon from '../../../components/common/AppIcon.vue';

defineProps({
  draft: { type: Object, required: true },
  disabled: Boolean,
});
const emit = defineEmits(['open-data-folder']);
</script>

<template>
  <section class="card settings-card wide-card">
    <div class="card-header">
      <div class="section-title">
        <AppIcon name="sliders" />
        <h2>桌面与数据</h2>
      </div>
    </div>
    <div class="settings-body desktop-settings">
      <label class="toggle-setting">
        <span><strong>窗口置顶</strong><small>让工作台保持在其他窗口上方。</small></span>
        <input
          id="setting-alwaysOnTop"
          v-model="draft.alwaysOnTop"
          type="checkbox"
          class="switch-input"
          :disabled="disabled"
        />
        <span class="switch-track"></span>
      </label>
      <label class="toggle-setting">
        <span>
          <strong>系统内容保护</strong>
          <small>{{
            isMac
              ? 'macOS 上使用 ScreenCaptureKit 的软件仍可能捕获此窗口。'
              : '请求系统限制窗口被截屏；实际效果取决于系统与录屏软件。'
          }}</small>
        </span>
        <input
          id="setting-contentProtection"
          v-model="draft.contentProtection"
          type="checkbox"
          class="switch-input"
          :disabled="disabled"
        />
        <span class="switch-track"></span>
      </label>
      <div class="data-setting">
        <span><strong>本地会话数据</strong><small>查看应用存储会话和设置的文件夹。</small></span>
        <button
          id="open-data-folder"
          type="button"
          class="button"
          :disabled="disabled"
          @click="emit('open-data-folder')"
        >
          <AppIcon name="folder" />打开数据目录
        </button>
      </div>
    </div>
  </section>
</template>
