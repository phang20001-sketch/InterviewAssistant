<script setup>
import AppIcon from '../../../components/common/AppIcon.vue';

defineProps({
  draft: { type: Object, required: true },
  disabled: Boolean,
});
const emit = defineEmits(['import-resume']);
</script>

<template>
  <section class="preference-group" aria-labelledby="resume-preferences-title">
    <h3 id="resume-preferences-title">个人经历 / 简历</h3>
    <p>上传一次后保存在本地，后续问答、模拟面试和题库生成会自动参考。</p>
    <div class="field">
      <div class="field-label-row">
        <label for="setting-resume">简历内容</label>
        <button
          id="import-resume"
          type="button"
          class="text-button"
          :disabled="disabled"
          @click="emit('import-resume')"
        >
          <AppIcon name="upload" />上传简历
        </button>
      </div>
      <textarea
        id="setting-resume"
        v-model="draft.resume"
        rows="15"
        maxlength="16000"
        placeholder="粘贴你的技能、项目和工作经历，让回答更贴合你的背景。"
        :disabled="disabled"
      ></textarea>
      <small>
        支持 TXT、Markdown、PDF、DOCX。上传后立即保存在本地；手动修改文本后请保存设置。
      </small>
    </div>
  </section>
</template>
