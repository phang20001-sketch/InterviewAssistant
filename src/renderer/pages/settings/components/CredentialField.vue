<script setup>
import { computed, nextTick, ref } from 'vue';

const props = defineProps({
  name: { type: String, required: true },
  label: { type: String, required: true },
  credential: { type: Object, required: true },
  hint: { type: String, default: '' },
  inputId: { type: String, default: '' },
  replaceId: { type: String, default: '' },
  hintId: { type: String, default: 'api-key-hint' },
  emptyPlaceholder: { type: String, default: '' },
  disabled: Boolean,
});
const emit = defineEmits(['toggle', 'update:value']);
const input = ref(null);
const fieldId = computed(() => props.inputId || `setting-${props.name}`);
const replacementId = computed(() => props.replaceId || `replace-${props.name}`);
const placeholder = computed(() => {
  if (props.credential.readOnly) return '已保存';
  if (props.credential.saved) return '输入新的 Key，留空保留已保存的 Key';
  if (props.emptyPlaceholder) return props.emptyPlaceholder;
  return props.name === 'apiKey' ? '输入 API Key' : '留空则沿用模型 API Key';
});

async function toggleEditing() {
  emit('toggle');
  await nextTick();
  if (!props.credential.readOnly) input.value?.focus();
}
</script>

<template>
  <div class="field">
    <div class="field-label-row">
      <label :for="fieldId">{{ label }}</label>
      <button
        :id="replacementId"
        type="button"
        class="text-button"
        :hidden="!credential.saved"
        :disabled="disabled"
        @click="toggleEditing"
      >
        {{ credential.readOnly ? '更换' : '取消更换' }}
      </button>
    </div>
    <input
      :id="fieldId"
      ref="input"
      type="password"
      autocomplete="new-password"
      :placeholder="placeholder"
      :readonly="credential.readOnly"
      :value="credential.value"
      :disabled="disabled"
      @input="emit('update:value', $event.target.value)"
    />
    <small v-if="hint" :id="hintId">{{ hint }}</small>
  </div>
</template>
