<script setup>
import { onMounted, ref, watch } from 'vue';
import AppIcon from '../../../components/common/AppIcon.vue';
import { useWorkspace } from '../../../composables/useWorkspace.js';

const { screenPicker, isBusy, captureScreen } = useWorkspace();
const dialog = ref(null);

function closePicker() {
  screenPicker.open = false;
}

function synchronizeDialog() {
  if (!dialog.value) return;
  if (screenPicker.open && !dialog.value.open) dialog.value.showModal();
  if (!screenPicker.open && dialog.value.open) dialog.value.close();
}

function closeOnBackdrop(event) {
  if (event.target === event.currentTarget) closePicker();
}

function onDialogClose() {
  if (!dialog.value?.open) closePicker();
}

function thumbnailSource(screen) {
  return typeof screen.thumbnail === 'string' && screen.thumbnail.startsWith('data:image/')
    ? screen.thumbnail
    : undefined;
}

watch(() => screenPicker.open, synchronizeDialog, { flush: 'post' });
onMounted(synchronizeDialog);
</script>

<template>
  <dialog
    ref="dialog"
    id="screen-dialog"
    class="screen-dialog"
    @click="closeOnBackdrop"
    @cancel="closePicker"
    @close="onDialogClose"
  >
    <div class="dialog-header">
      <div>
        <h2>选择要截取的屏幕</h2>
        <p>请确认画面中不包含不希望发送给模型的信息。</p>
      </div>
      <button
        class="icon-button"
        id="close-screen-dialog"
        aria-label="关闭"
        :disabled="isBusy"
        @click="closePicker"
      >
        <AppIcon name="x" />
      </button>
    </div>
    <div id="screen-list" class="screen-list">
      <p v-if="!screenPicker.screens.length" class="screen-message">
        没有可用屏幕，请检查系统录屏权限后重试。
      </p>
      <button
        v-for="screen in screenPicker.screens"
        :key="screen.id"
        class="screen-option"
        :disabled="isBusy"
        @click="captureScreen(screen.id)"
      >
        <img :src="thumbnailSource(screen)" :alt="screen.name || '屏幕预览'" />
        <span>{{ screen.name || '未命名屏幕' }}</span>
      </button>
    </div>
  </dialog>
</template>
