<script setup>
import { onMounted, ref, watch } from 'vue';
import AppIcon from '../../../components/common/AppIcon.vue';
import CredentialField from './CredentialField.vue';

const props = defineProps({
  open: Boolean,
  editing: Boolean,
  draft: { type: Object, required: true },
  credential: { type: Object, required: true },
  disabled: Boolean,
  savingAndTesting: Boolean,
});
const emit = defineEmits(['close', 'save', 'save-test', 'toggle-credential']);
const dialog = ref(null);
const form = ref(null);

function synchronizeDialog() {
  if (!dialog.value) return;
  if (props.open && !dialog.value.open) dialog.value.showModal();
  if (!props.open && dialog.value.open) dialog.value.close();
}

function closeEditor() {
  if (!props.disabled) emit('close');
}

function closeOnBackdrop(event) {
  if (event.target === event.currentTarget) closeEditor();
}

function onNativeClose() {
  if (!dialog.value?.open) closeEditor();
}

function saveProfile(test = false) {
  if (!props.disabled && form.value?.reportValidity()) emit(test ? 'save-test' : 'save');
}

watch(() => props.open, synchronizeDialog, { flush: 'post' });
onMounted(synchronizeDialog);
</script>

<template>
  <dialog
    id="model-profile-dialog"
    ref="dialog"
    class="model-profile-dialog"
    aria-labelledby="model-profile-title"
    @click="closeOnBackdrop"
    @cancel.prevent="closeEditor"
    @close="onNativeClose"
    @keydown.stop
  >
    <div class="dialog-header">
      <div>
        <h2 id="model-profile-title">{{ editing ? '编辑模型配置' : '添加模型配置' }}</h2>
        <p>此处统一管理连接信息。保存并验证会请求此模型，保存后可在列表中选择使用。</p>
      </div>
      <button
        id="close-model-profile"
        type="button"
        class="icon-button"
        aria-label="关闭模型编辑"
        :disabled="disabled"
        @click="closeEditor"
      >
        <AppIcon name="x" />
      </button>
    </div>
    <form id="model-profile-form" ref="form" @submit.prevent="saveProfile()">
      <div class="field">
        <label for="profile-name">配置名称</label>
        <input
          id="profile-name"
          v-model="draft.name"
          placeholder="例如：日常问答、截图识题"
          maxlength="80"
          :disabled="disabled"
          required
        />
      </div>
      <div class="field">
        <label for="profile-baseUrl">API 服务地址</label>
        <input
          id="profile-baseUrl"
          v-model="draft.baseUrl"
          type="url"
          placeholder="https://api.openai.com/v1"
          :disabled="disabled"
          required
        />
      </div>
      <div class="field">
        <label for="profile-model">模型名称</label>
        <input
          id="profile-model"
          v-model="draft.model"
          placeholder="填写服务商提供的模型名称"
          :disabled="disabled"
          required
        />
      </div>
      <CredentialField
        name="profileApiKey"
        input-id="profile-apiKey"
        replace-id="replace-profile-apiKey"
        hint-id="profile-api-key-hint"
        empty-placeholder="输入此模型的 API Key"
        label="API Key"
        :credential="credential"
        :hint="
          credential.saved
            ? '此配置已保存独立的 Key。更换时留空会保留原 Key。'
            : '此配置使用独立的 Key；不会沿用其他模型的 Key。'
        "
        :disabled="disabled"
        @update:value="credential.value = $event"
        @toggle="emit('toggle-credential')"
      />
      <label class="toggle-setting model-profile-demo">
        <span>
          <strong>演示模式</strong>
          <small>开启后使用本地示例回答。连接验证成功后自动关闭。</small>
        </span>
        <input
          id="profile-demoMode"
          v-model="draft.demoMode"
          type="checkbox"
          class="switch-input"
          :disabled="disabled"
        />
        <span class="switch-track"></span>
      </label>
      <div class="model-profile-editor-actions">
        <button
          id="cancel-model-profile"
          type="button"
          class="button"
          :disabled="disabled"
          @click="closeEditor"
        >
          取消
        </button>
        <button id="save-model-profile" type="submit" class="button" :disabled="disabled">
          保存模型
        </button>
        <button
          id="save-test-model-profile"
          type="button"
          class="button primary"
          :disabled="disabled"
          @click="saveProfile(true)"
        >
          <AppIcon name="link" />{{ savingAndTesting ? '保存并验证中…' : '保存并验证' }}
        </button>
      </div>
    </form>
  </dialog>
</template>
