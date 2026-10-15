<script setup>
import { computed, ref, useId, watch } from 'vue';
import { useWorkspace } from '../../composables/useWorkspace.js';
import { desktop } from '../../services/desktop.js';
import AppIcon from './AppIcon.vue';

defineProps({ required: Boolean, compact: Boolean });

const { state, isBusy, isRecording, perform, applyState, toast } = useWorkspace();
const resume = computed(() => state.value?.settings?.resume || '');
const hasResume = computed(() => Boolean(resume.value.trim()));
const disabled = computed(() => isBusy.value || isRecording.value);
const editing = ref(false);
const draft = ref('');
const inputId = `resume-text-${useId()}`;

watch(resume, (value) => {
  if (!editing.value) draft.value = value;
});

function editResume() {
  draft.value = resume.value;
  editing.value = true;
}

async function uploadResume() {
  if (disabled.value) return;
  await perform(async () => {
    const result = await desktop.importResume();
    if (result.canceled) return;
    if (!result.state) throw new Error('简历保存结果无效，请重试。');
    applyState(result.state);
    editing.value = false;
    toast('简历已保存在本地，之后无需重复上传。');
  }, '导入简历失败。');
}

async function saveResume() {
  if (disabled.value || !draft.value.trim()) return;
  await perform(async () => {
    const saved = await desktop.saveSettings({ resume: draft.value.trim() });
    applyState(saved);
    editing.value = false;
    toast('简历已保存在本地，之后的面试问答会自动参考。');
  }, '保存简历失败。');
}
</script>

<template>
  <section
    class="resume-status"
    :class="{
      'resume-required': required && !hasResume,
      'resume-saved': hasResume,
      'resume-compact': compact,
    }"
    aria-label="本地简历"
  >
    <div class="resume-status-row">
      <AppIcon :name="hasResume ? 'check' : 'user'" class="resume-status-icon" />
      <div class="resume-status-copy">
        <strong>{{ hasResume ? '简历已保存在本地' : '请先上传一份简历' }}</strong>
        <p v-if="hasResume">面试与个人经历相关的问答会自动参考这份简历，无需重复上传。</p>
        <p v-else-if="required">上传或粘贴简历后，AI 才能生成贴合你的经历的问题。</p>
        <p v-else>上传一次即可反复使用，让回答贴合你的经历；也可以先直接提问。</p>
      </div>
      <div class="resume-status-actions">
        <button
          class="button small"
          type="button"
          data-action="upload-resume"
          :disabled="disabled"
          @click="uploadResume"
        >
          <AppIcon name="upload" />
          {{ hasResume ? '替换简历' : '上传简历' }}
        </button>
        <button
          class="text-button"
          type="button"
          data-action="edit-resume"
          :disabled="disabled"
          @click="editResume"
        >
          {{ hasResume ? '修改文本' : '粘贴文本' }}
        </button>
      </div>
    </div>

    <div v-if="editing" class="resume-editor">
      <label :for="inputId">简历内容</label>
      <textarea
        :id="inputId"
        v-model="draft"
        rows="7"
        maxlength="16000"
        placeholder="粘贴技能、项目经历、工作经历等简历内容。"
        :disabled="disabled"
      ></textarea>
      <div class="resume-editor-footer">
        <span>{{ draft.length }} / 16000 字 · 保存后立即生效</span>
        <div>
          <button class="button small" type="button" :disabled="disabled" @click="editing = false">
            取消
          </button>
          <button
            class="button primary small"
            type="button"
            data-action="save-resume"
            :disabled="disabled || !draft.trim()"
            @click="saveResume"
          >
            保存到本地
          </button>
        </div>
      </div>
    </div>

    <details v-else-if="hasResume && !compact" class="resume-preview">
      <summary>查看已保存的简历 · {{ resume.length }} 字</summary>
      <pre>{{ resume }}</pre>
    </details>
    <p v-else-if="!hasResume" class="resume-file-hint">
      支持 TXT、Markdown、PDF、DOCX；扫描版 PDF 可改用粘贴文本。
    </p>
  </section>
</template>

<style scoped>
.resume-status {
  margin: 0 0 20px;
  padding: 16px 18px;
  border: 1px solid #e2e8d9;
  border-radius: 8px;
  background: #f7faf2;
  color: #6b7d5a;
}

.resume-status.resume-required {
  background: #fffaf0;
  border-color: #ecdfc2;
}

.resume-status-row,
.resume-status-actions,
.resume-editor-footer,
.resume-editor-footer > div {
  display: flex;
  align-items: center;
  gap: 12px;
}

.resume-status-icon {
  align-self: flex-start;
  margin-top: 3px;
  flex: none;
}

.resume-status-icon :deep(svg) {
  width: 17px;
  height: 17px;
}

.resume-status-copy {
  flex: 1;
  min-width: 0;
}

.resume-status-copy strong {
  font-size: 11px;
  font-weight: 600;
}

.resume-status-copy p,
.resume-file-hint {
  color: #8b987d;
  font-size: 10px;
  line-height: 1.9;
}

.resume-status-actions {
  flex-wrap: wrap;
  justify-content: flex-end;
  flex: none;
  gap: 8px;
}

.resume-file-hint {
  margin: 8px 0 0 29px;
}

.resume-editor,
.resume-preview {
  margin-top: 13px;
  border-top: 1px solid #e1e8d8;
  padding-top: 12px;
}

.resume-editor > label {
  display: block;
  font-size: 10px;
  margin-bottom: 7px;
}

.resume-editor textarea {
  width: 100%;
  border: 1px solid #dfe6d5;
  border-radius: 6px;
  padding: 10px 12px;
  min-height: 140px;
  resize: vertical;
  background: #fff;
  color: #536749;
  font-size: 11px;
  line-height: 1.9;
}

.resume-editor-footer {
  justify-content: space-between;
  flex-wrap: wrap;
  margin-top: 8px;
  font-size: 9px;
  color: #92a080;
}

.resume-editor-footer > div {
  gap: 7px;
}

.resume-preview summary {
  cursor: pointer;
  font-size: 10px;
}

.resume-preview pre {
  max-height: 230px;
  overflow: auto;
  padding: 11px;
  margin: 10px 0 0;
  background: #fff;
  border-radius: 5px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-family: inherit;
  font-size: 11px;
  line-height: 1.9;
}

:global(body.transparent-mode .resume-status) {
  display: none !important;
}

@media (max-width: 950px) {
  .resume-status-row {
    flex-wrap: wrap;
  }

  .resume-status-copy {
    min-width: min(190px, 70%);
  }

  .resume-status-actions {
    margin-left: 29px;
  }
}
</style>
