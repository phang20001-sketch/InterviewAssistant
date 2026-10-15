<script setup>
import CredentialField from './CredentialField.vue';

defineProps({
  draft: { type: Object, required: true },
  credential: { type: Object, required: true },
  disabled: Boolean,
});
const emit = defineEmits(['toggle-credential']);
</script>

<template>
  <details class="transcription-settings">
    <summary>语音转写配置 <span>可选</span></summary>
    <p>未填写时沿用当前使用模型的服务地址和 API Key。需服务商支持音频转写。</p>
    <div class="field">
      <label for="setting-transcriptionBaseUrl">转写 API 地址</label>
      <input
        id="setting-transcriptionBaseUrl"
        v-model="draft.transcriptionBaseUrl"
        type="url"
        placeholder="留空则沿用模型服务地址"
        :disabled="disabled"
      />
    </div>
    <div class="field-row">
      <div class="field">
        <label for="setting-transcriptionModel">转写模型</label>
        <input
          id="setting-transcriptionModel"
          v-model="draft.transcriptionModel"
          placeholder="whisper-1"
          :disabled="disabled"
        />
      </div>
      <CredentialField
        name="transcriptionApiKey"
        label="转写 API Key"
        :credential="credential"
        :disabled="disabled"
        @update:value="credential.value = $event"
        @toggle="emit('toggle-credential')"
      />
    </div>
  </details>
</template>
