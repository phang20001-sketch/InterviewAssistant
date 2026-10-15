<script setup>
import AppIcon from '../../components/common/AppIcon.vue';
import ResumeStatus from '../../components/common/ResumeStatus.vue';
import { useQuestionLibrary } from './useQuestionLibrary.js';
import LibraryBatchRecords from './components/LibraryBatchRecords.vue';
import LibraryGenerationPanel from './components/LibraryGenerationPanel.vue';
import QuestionCard from './components/QuestionCard.vue';

const {
  currentView,
  search,
  category,
  batchId,
  count,
  generating,
  latestGeneration,
  disabled,
  hasResume,
  aiReady,
  batches,
  allQuestions,
  selectedBatches,
  categories,
  questions,
  generateQuestions,
  selectQuestion,
  navigate,
} = useQuestionLibrary();

function batchLabel(batch) {
  const date = new Date(batch.createdAt);
  const label = Number.isNaN(date.getTime()) ? '本地批次' : date.toLocaleString('zh-CN');
  return `${label} · ${batch.questions?.length || 0} 道题`;
}
</script>

<template>
  <section
    id="view-library"
    class="page-view"
    aria-labelledby="library-title"
    :hidden="currentView !== 'library'"
  >
    <div class="page-heading">
      <div>
        <div class="eyebrow">QUESTIONS FROM YOUR EXPERIENCE</div>
        <h1 id="library-title">练好属于你的问题<span class="heading-star">✳</span></h1>
        <p>根据简历和已保存的面试偏好生成，所有题目持续累加保存在本地。</p>
      </div>
      <span class="large-counter">{{ allQuestions.length }} <small>道本地问题</small></span>
    </div>

    <ResumeStatus required />
    <LibraryGenerationPanel
      v-model:count="count"
      :has-batches="batches.length > 0"
      :has-resume="hasResume"
      :ai-ready="aiReady"
      :disabled="disabled"
      :generating="generating"
      :latest-generation="latestGeneration"
      @generate="generateQuestions"
      @settings="navigate('settings')"
    />

    <div class="library-toolbar">
      <div id="library-filters" class="filter-chips">
        <button
          v-for="item in categories"
          :key="item.value"
          class="filter-chip"
          :class="{ active: category === item.value }"
          :data-category="item.value"
          :disabled="disabled"
          @click="category = item.value"
        >
          {{ item.label }}
        </button>
      </div>
      <label class="search-field">
        <AppIcon name="search" />
        <input
          id="library-search"
          v-model="search"
          placeholder="搜索本地题目…"
          aria-label="搜索题库"
          :disabled="disabled"
        />
      </label>
    </div>

    <div v-if="batches.length" class="library-batch-toolbar">
      <label for="library-batch">查看批次</label>
      <select id="library-batch" v-model="batchId" :disabled="disabled">
        <option value="all">全部累计题目 · {{ batches.length }} 批</option>
        <option v-for="batch in batches" :key="batch.id" :value="batch.id">
          {{ batchLabel(batch) }}
        </option>
      </select>
      <span>{{ questions.length }} 道匹配问题</span>
    </div>

    <div id="question-library" class="question-library">
      <QuestionCard
        v-for="item in questions"
        :key="`${item.batchId}-${item.id}`"
        :question="item"
        :disabled="disabled"
        @select="selectQuestion"
      />
    </div>
    <div id="library-empty" class="no-results" :hidden="questions.length > 0">
      <template v-if="!batches.length">还没有生成题库，上传简历后点击「生成题库」开始。</template>
      <template v-else-if="!selectedBatches.some((batch) => batch.questions?.length)">
        该批次的模型回答保存在下方，可展开查看。
      </template>
      <template v-else>没有找到匹配的问题，试试其他关键词或批次。</template>
    </div>

    <LibraryBatchRecords :batches="selectedBatches" />
  </section>
</template>
