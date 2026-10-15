<script setup>
defineProps({
  draft: { type: Object, required: true },
  disabled: Boolean,
});

const experienceLevels = [
  { value: 'unspecified', label: '未指定 · 结合简历判断' },
  { value: 'student', label: '在校 / 应届毕业生' },
  { value: 'junior', label: '初级 · 0–2 年经验' },
  { value: 'mid', label: '中级 · 3–5 年经验' },
  { value: 'senior', label: '高级 · 5 年以上经验' },
  { value: 'lead', label: '技术负责人 / 管理岗位' },
];
</script>

<template>
  <section class="preference-group" aria-labelledby="career-preferences-title">
    <h3 id="career-preferences-title">目标岗位与招聘要求</h3>
    <p>填写你准备应聘的方向，让问题深度与岗位要求相匹配。</p>
    <div class="field-row">
      <div class="field">
        <label for="setting-role">目标岗位</label>
        <input
          id="setting-role"
          v-model="draft.role"
          placeholder="例如：高级前端工程师"
          maxlength="120"
          :disabled="disabled"
        />
      </div>
      <div class="field">
        <label for="setting-experienceLevel">经验 / 职级</label>
        <select id="setting-experienceLevel" v-model="draft.experienceLevel" :disabled="disabled">
          <option v-for="level in experienceLevels" :key="level.value" :value="level.value">
            {{ level.label }}
          </option>
        </select>
      </div>
    </div>
    <div class="field">
      <label for="setting-targetCompany">目标公司 / 行业（可选）</label>
      <input
        id="setting-targetCompany"
        v-model="draft.targetCompany"
        maxlength="120"
        placeholder="例如：互联网公司、电商业务或某家目标公司"
        :disabled="disabled"
      />
    </div>
    <div class="field">
      <label for="setting-jobDescription">岗位要求 / JD（可选）</label>
      <textarea
        id="setting-jobDescription"
        v-model="draft.jobDescription"
        rows="6"
        maxlength="6000"
        placeholder="粘贴职位描述、技能要求和工作职责，AI 会优先覆盖简历与岗位要求的交集。"
        :disabled="disabled"
      ></textarea>
      <small>最多 6,000 字。可以只填写你最想准备的几条要求。</small>
    </div>
  </section>
</template>
