<script setup>
defineProps({
  draft: { type: Object, required: true },
  disabled: Boolean,
});
</script>

<template>
  <section class="preference-group" aria-labelledby="practice-focus-title">
    <h3 id="practice-focus-title">练习侧重点与改进目标</h3>
    <p>告诉 AI 你想重点练习和改善的内容，留空则按简历综合安排。</p>
    <div class="field">
      <label for="setting-focusAreas">重点知识 / 项目方向（可选）</label>
      <textarea
        id="setting-focusAreas"
        v-model="draft.focusAreas"
        rows="3"
        maxlength="2000"
        placeholder="例如：Vue 3、性能优化、工程化、简历中的订单系统项目。"
        :disabled="disabled"
      ></textarea>
    </div>
    <div class="field">
      <label for="setting-improvementGoals">希望改善的能力（可选）</label>
      <textarea
        id="setting-improvementGoals"
        v-model="draft.improvementGoals"
        rows="3"
        maxlength="2000"
        placeholder="例如：回答更有条理、说明技术选型理由、量化项目成果。"
        :disabled="disabled"
      ></textarea>
    </div>
    <div class="field">
      <label for="setting-additionalRequirements">补充要求（可选）</label>
      <textarea
        id="setting-additionalRequirements"
        v-model="draft.additionalRequirements"
        rows="3"
        maxlength="2000"
        placeholder="例如：多问实际场景，点评时指出遗漏点，回答使用 STAR 结构。"
        :disabled="disabled"
      ></textarea>
      <small>每项最多 2,000 字。保存后，在问答、出题和点评时作为个人偏好参考。</small>
    </div>
  </section>
</template>
